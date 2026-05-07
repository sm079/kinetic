from datetime import datetime, timezone
from pydantic import BaseModel, Field


class BiometricCreateRequest(BaseModel):
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    weight_kg: float | None = Field(None, ge=0)
    body_fat_pct: float | None = Field(None, ge=0)
    muscle_mass_kg: float | None = Field(None, ge=0)
    visceral_fat_level: int | None = Field(None, ge=0)
    chest_cm: float | None = Field(None, ge=0)
    waist_cm: float | None = Field(None, ge=0)
    hips_cm: float | None = Field(None, ge=0)
    thigh_cm: float | None = Field(None, ge=0)
    bicep_cm: float | None = Field(None, ge=0)
    calf_cm: float | None = Field(None, ge=0)
    wellness_sleep: int | None = Field(None, ge=1, le=10)
    wellness_recovery: int | None = Field(None, ge=1, le=10)
    wellness_stress: int | None = Field(None, ge=1, le=10)
    wellness_energy: int | None = Field(None, ge=1, le=10)


class BiometricUpdateRequest(BaseModel):
    recorded_at: datetime | None = None
    weight_kg: float | None = Field(None, ge=0)
    body_fat_pct: float | None = Field(None, ge=0)
    muscle_mass_kg: float | None = Field(None, ge=0)
    visceral_fat_level: int | None = Field(None, ge=0)
    chest_cm: float | None = Field(None, ge=0)
    waist_cm: float | None = Field(None, ge=0)
    hips_cm: float | None = Field(None, ge=0)
    thigh_cm: float | None = Field(None, ge=0)
    bicep_cm: float | None = Field(None, ge=0)
    calf_cm: float | None = Field(None, ge=0)
    wellness_sleep: int | None = Field(None, ge=1, le=10)
    wellness_recovery: int | None = Field(None, ge=1, le=10)
    wellness_stress: int | None = Field(None, ge=1, le=10)
    wellness_energy: int | None = Field(None, ge=1, le=10)


class BiometricResponse(BaseModel):
    id: str
    recorded_at: datetime
    weight_kg: float | None
    body_fat_pct: float | None
    muscle_mass_kg: float | None
    visceral_fat_level: int | None
    chest_cm: float | None
    waist_cm: float | None
    hips_cm: float | None
    thigh_cm: float | None
    bicep_cm: float | None
    calf_cm: float | None
    wellness_sleep: int | None
    wellness_recovery: int | None
    wellness_stress: int | None
    wellness_energy: int | None
