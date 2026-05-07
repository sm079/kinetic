from beanie import Document
from datetime import datetime, timezone
from pymongo import IndexModel, ASCENDING
from pydantic import EmailStr, Field

from app.models.enums import FitnessGoal, FitnessLevel, Equipment, DayOfWeek, PreferredUnits


class User(Document):
    display_name: str | None = None
    email: EmailStr
    password_hash: str
    is_active: bool = True
    tokens_invalidated_at: datetime | None = None
    notifications_enabled: bool = True
    preferred_units: PreferredUnits = PreferredUnits.metric
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Onboarding / fitness profile
    onboarding_completed: bool = False
    fitness_goal: FitnessGoal | None = None
    fitness_level: FitnessLevel | None = None
    preferred_equipment: Equipment | None = None
    days_per_week: int | None = None
    preferred_days: list[DayOfWeek] = []
    age: int | None = None
    gender: str = "male"  # "male" | "female" — used for strength standards lookup

    class Settings:
        name = "users"
        indexes = [
            IndexModel([("email", ASCENDING)], unique=True),
        ]
