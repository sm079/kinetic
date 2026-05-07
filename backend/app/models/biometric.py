from datetime import datetime, timezone
from beanie import Document
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import Field


class Biometric(Document):
    user_id: str
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Body composition
    weight_kg: float | None = None
    body_fat_pct: float | None = None
    muscle_mass_kg: float | None = None
    visceral_fat_level: int | None = None

    # Dimensions (cm)
    chest_cm: float | None = None
    waist_cm: float | None = None
    hips_cm: float | None = None
    thigh_cm: float | None = None
    bicep_cm: float | None = None
    calf_cm: float | None = None

    # Daily wellness (1–10 subjective)
    wellness_sleep: int | None = None
    wellness_recovery: int | None = None
    wellness_stress: int | None = None
    wellness_energy: int | None = None

    class Settings:
        name = "biometrics"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("recorded_at", DESCENDING)]),
        ]
