from datetime import datetime
from pydantic import BaseModel
from app.models.activity import Activity


class WorkoutCreateRequest(BaseModel):
    name: str
    note: str | None = None
    started_at: datetime
    completed_at: datetime | None = None
    activities: list[Activity] = []
    # Optional program linkage
    program_id: str | None = None
    program_week: int | None = None
    program_day: int | None = None
    program_day_label: str | None = None


class WorkoutUpdateRequest(BaseModel):
    name: str | None = None
    note: str | None = None
    completed_at: datetime | None = None
    activities: list[Activity] | None = None
