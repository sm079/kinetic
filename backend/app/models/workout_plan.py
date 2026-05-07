from datetime import datetime, timezone
from beanie import Document
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import BaseModel, Field

from app.models.activity import Activity
from app.models.enums import Equipment, FitnessLevel, DayOfWeek


class ProgramDetails(BaseModel):
    equipment: Equipment | None = None
    level: FitnessLevel | None = None
    duration_weeks: int | None = None
    days_per_week: int | None = None
    minutes_per_workout: int | None = None
    recommended_days: list[DayOfWeek] = []


class PlannedDay(BaseModel):
    day: int
    label: str | None = None
    activities: list[Activity] = []


class PlanWeek(BaseModel):
    week: int
    days: list[PlannedDay] = []


class WorkoutPlan(Document):
    user_id: str
    name: str
    tagline: str | None = None
    description: str | None = None
    details: ProgramDetails = Field(default_factory=ProgramDetails)
    weeks: list[PlanWeek] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Follow / progression tracking
    is_following: bool = False
    current_week: int = 1   # week.week number (1-based)
    current_day: int = 1    # day.day number within that week
    followed_at: datetime | None = None

    class Settings:
        name = "workout_plans"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("updated_at", DESCENDING)]),
            IndexModel([("user_id", ASCENDING), ("is_following", ASCENDING)]),
        ]
