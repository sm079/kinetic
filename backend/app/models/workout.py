from datetime import datetime, timezone
from beanie import Document
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field

from app.models.activity import Activity


class Workout(Document):
    user_id: str
    name: str
    note: str | None = None
    started_at: datetime
    completed_at: datetime | None = None
    activities: list[Activity] = []
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Program linkage — set when workout is started from a followed program day
    program_id: str | None = None
    program_week: int | None = None
    program_day: int | None = None
    program_day_label: str | None = None

    class Settings:
        name = "workouts"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("started_at", DESCENDING)]),
        ]
