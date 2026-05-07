import asyncio
import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)

from app.core.auth import get_current_user
from app.models.user import User
from app.models.conversation import Conversation, Message
from app.schemas.conversation import SendMessageRequest, ConversationResponse, MessageResponse
from app.services.ai import conversation_graph

router = APIRouter(prefix="/api/conversations", tags=["Conversations"])


def _msg_response(m: Message) -> MessageResponse:
    return MessageResponse(
        id=m.id,
        role=m.role,
        content=m.content,
        timestamp=m.timestamp,
        parent_id=m.parent_id,
    )


def _fmt(s: Conversation) -> ConversationResponse:
    return ConversationResponse(
        id=str(s.id),
        title=s.title,
        created_at=s.created_at,
        updated_at=s.updated_at,
        messages=[_msg_response(m) for m in s.messages],
        nodes=[_msg_response(m) for m in s.nodes],
        active_tip_id=s.active_tip_id,
    )


def _assert_owner(conv: Conversation | None, user_id: str) -> Conversation:
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your conversation")
    return conv


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(user: User = Depends(get_current_user)):
    conv = Conversation(user_id=str(user.id))
    await conv.insert()
    return _fmt(conv)


@router.get("", response_model=list[ConversationResponse])
async def list_conversations(user: User = Depends(get_current_user)):
    convs = await Conversation.find(
        Conversation.user_id == str(user.id)
    ).sort(-Conversation.updated_at).to_list()
    return [_fmt(c) for c in convs]


@router.get("/{conv_id}", response_model=ConversationResponse)
async def get_conversation(conv_id: str, user: User = Depends(get_current_user)):
    conv = await Conversation.get(conv_id)
    _assert_owner(conv, str(user.id))
    if not conv.nodes and conv.messages:
        conv.ensure_nodes()
        await conv.save()
    return _fmt(conv)


class UpdateConversationRequest(BaseModel):
    title: str | None = None


@router.patch("/{conv_id}", response_model=ConversationResponse)
async def update_conversation(
    conv_id: str,
    body: UpdateConversationRequest,
    user: User = Depends(get_current_user),
):
    conv = await Conversation.get(conv_id)
    _assert_owner(conv, str(user.id))
    if body.title is not None:
        conv.title = body.title[:80]
    conv.updated_at = datetime.now(timezone.utc)
    await conv.save()
    return _fmt(conv)


@router.delete("/{conv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conv_id: str, user: User = Depends(get_current_user)):
    conv = await Conversation.get(conv_id)
    _assert_owner(conv, str(user.id))
    await conv.delete()


class SeedMessage(BaseModel):
    role: str
    content: str


class SeedRequest(BaseModel):
    messages: list[SeedMessage]


@router.post("/{conv_id}/seed", status_code=status.HTTP_204_NO_CONTENT)
async def seed_conversation(
    conv_id: str,
    body: SeedRequest,
    user: User = Depends(get_current_user),
):
    conv = await Conversation.get(conv_id)
    _assert_owner(conv, str(user.id))
    conv.messages = [Message(role=m.role, content=m.content) for m in body.messages]
    conv.nodes = []
    conv.active_tip_id = None
    if not conv.title and body.messages:
        first_user = next((m.content for m in body.messages if m.role == "user"), None)
        if first_user:
            conv.title = first_user[:60]
    conv.ensure_nodes()
    await conv.save()


class SetActiveBranchRequest(BaseModel):
    tip_id: str


@router.patch("/{conv_id}/active-branch", response_model=ConversationResponse)
async def set_active_branch(
    conv_id: str,
    body: SetActiveBranchRequest,
    user: User = Depends(get_current_user),
):
    conv = await Conversation.get(conv_id)
    _assert_owner(conv, str(user.id))
    conv.ensure_nodes()
    if body.tip_id not in {n.id for n in conv.nodes}:
        raise HTTPException(status_code=404, detail="Branch tip not found")
    conv.active_tip_id = body.tip_id
    conv.sync_messages()
    conv.updated_at = datetime.now(timezone.utc)
    await conv.save()
    return _fmt(conv)


@router.post("/{conv_id}/message")
async def send_message(
    conv_id: str,
    body: SendMessageRequest,
    user: User = Depends(get_current_user),
):
    conv = await Conversation.get(conv_id)
    _assert_owner(conv, str(user.id))
    # Persist migration before the background task loads the session independently
    if not conv.nodes:
        conv.ensure_nodes()
        if conv.nodes:
            await conv.save()

    queue: asyncio.Queue = asyncio.Queue()
    result_box: dict = {}

    async def stream_cb(chunk: str):
        await queue.put(chunk)

    async def run():
        try:
            result = await conversation_graph.ainvoke({
                "user_id": str(user.id),
                "session_id": conv_id,
                "user_message": body.message,
                "parent_message_id": body.parent_message_id,
                "stream_callback": stream_cb,
            })
            result_box.update(result)
        except Exception:
            logger.exception("Graph execution failed")
            await queue.put("\x00error")
        await queue.put(None)

    async def events():
        asyncio.create_task(run())
        while True:
            chunk = await queue.get()
            if chunk is None:
                if result_box.get("user_msg_id"):
                    meta = {
                        "$": "saved",
                        "user_msg_id": result_box["user_msg_id"],
                        "ai_msg_id": result_box["ai_msg_id"],
                        "active_tip_id": result_box["ai_msg_id"],
                    }
                    yield f"data: {json.dumps(meta)}\n\n"
                yield "data: [DONE]\n\n"
                break
            yield f"data: {json.dumps(chunk)}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
