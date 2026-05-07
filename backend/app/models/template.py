from datetime import datetime, timezone
from beanie import Document
from pydantic import Field

from app.models.workout_plan import ProgramDetails, PlanWeek


class Template(Document):
    """A shared (non-user-owned) program template stored in MongoDB."""
    template_id: str
    name: str
    tagline: str | None = None
    description: str | None = None
    details: ProgramDetails = Field(default_factory=ProgramDetails)
    weeks: list[PlanWeek] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "templates"
