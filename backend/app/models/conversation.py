from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4
from beanie import Document
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import BaseModel, Field


def _now():
    return datetime.now(timezone.utc)

def _uuid():
    return str(uuid4())


class Message(BaseModel):
    id: str = Field(default_factory=_uuid)
    role: str
    content: str
    timestamp: datetime = Field(default_factory=_now)
    parent_id: Optional[str] = None


class Conversation(Document):
    user_id: str
    title: Optional[str] = None
    messages: list[Message] = []        # active thread (kept in sync with nodes/active_tip_id)
    nodes: list[Message] = []           # full message tree across all branches
    active_tip_id: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    class Settings:
        name = "conversations"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("updated_at", DESCENDING)]),
        ]

    def ensure_nodes(self):
        """One-time migration from flat messages list to the tree structure."""
        if self.nodes:
            return
        if not self.messages:
            return
        prev_id: Optional[str] = None
        migrated: list[Message] = []
        for msg in self.messages:
            new_msg = Message(
                id=msg.id if msg.id else str(uuid4()),
                role=msg.role,
                content=msg.content,
                timestamp=msg.timestamp,
                parent_id=prev_id,
            )
            migrated.append(new_msg)
            prev_id = new_msg.id
        self.nodes = migrated
        self.active_tip_id = migrated[-1].id if migrated else None

    def get_thread(self, tip_id: Optional[str] = None) -> list[Message]:
        """Walk parent chain from tip to root, return in chronological order."""
        tip = tip_id or self.active_tip_id
        if not tip:
            return []
        by_id = {n.id: n for n in self.nodes}
        path: list[Message] = []
        cur = tip
        while cur:
            msg = by_id.get(cur)
            if not msg:
                break
            path.append(msg)
            cur = msg.parent_id
        return list(reversed(path))

    def sync_messages(self):
        """Keep messages field in sync with active thread."""
        self.messages = self.get_thread()
