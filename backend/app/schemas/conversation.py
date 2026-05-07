from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class SendMessageRequest(BaseModel):
    message: str
    parent_message_id: Optional[str] = None  # fork from this message to create a branch


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    timestamp: datetime
    parent_id: Optional[str] = None


class ConversationResponse(BaseModel):
    id: str
    title: Optional[str]
    created_at: datetime
    updated_at: datetime
    messages: list[MessageResponse]     # active thread
    nodes: list[MessageResponse]        # full message tree (all branches)
    active_tip_id: Optional[str] = None
