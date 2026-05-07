from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.core.auth import get_current_user, hash_password, verify_password
from app.models.enums import FitnessGoal, FitnessLevel, Equipment, DayOfWeek, PreferredUnits
from app.models.user import User

router = APIRouter(prefix="/api/users", tags=["Users"])


class UserProfileResponse(BaseModel):
    id: str
    email: str
    display_name: str | None
    notifications_enabled: bool
    preferred_units: PreferredUnits
    created_at: datetime
    onboarding_completed: bool
    fitness_goal: FitnessGoal | None
    fitness_level: FitnessLevel | None
    preferred_equipment: Equipment | None
    days_per_week: int | None
    preferred_days: list[DayOfWeek]
    age: int | None
    gender: str


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    email: EmailStr | None = None
    notifications_enabled: bool | None = None
    preferred_units: PreferredUnits | None = None
    onboarding_completed: bool | None = None
    # Fitness profile — model_fields_set lets callers explicitly null a field
    fitness_goal: FitnessGoal | None = None
    fitness_level: FitnessLevel | None = None
    preferred_equipment: Equipment | None = None
    days_per_week: int | None = None
    preferred_days: list[DayOfWeek] | None = None
    age: int | None = None
    gender: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def _fmt(user: User) -> UserProfileResponse:
    return UserProfileResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        notifications_enabled=user.notifications_enabled,
        preferred_units=user.preferred_units,
        created_at=user.created_at,
        onboarding_completed=user.onboarding_completed,
        fitness_goal=user.fitness_goal,
        fitness_level=user.fitness_level,
        preferred_equipment=user.preferred_equipment,
        days_per_week=user.days_per_week,
        preferred_days=user.preferred_days,
        age=user.age,
        gender=user.gender,
    )


@router.get("/me", response_model=UserProfileResponse)
async def get_me(user: User = Depends(get_current_user)):
    return _fmt(user)


@router.patch("/me", response_model=UserProfileResponse)
async def update_me(body: UpdateProfileRequest, user: User = Depends(get_current_user)):
    set_fields = body.model_fields_set

    if "display_name" in set_fields:
        user.display_name = body.display_name
    if "email" in set_fields and body.email and body.email != user.email:
        existing = await User.find_one(User.email == body.email)
        if existing and str(existing.id) != str(user.id):
            raise HTTPException(status_code=409, detail="Email already in use")
        user.email = body.email
    if "notifications_enabled" in set_fields and body.notifications_enabled is not None:
        user.notifications_enabled = body.notifications_enabled
    if "preferred_units" in set_fields and body.preferred_units is not None:
        user.preferred_units = body.preferred_units
    if "onboarding_completed" in set_fields and body.onboarding_completed is not None:
        user.onboarding_completed = body.onboarding_completed

    # Fitness profile: use model_fields_set so callers can explicitly clear a field to null
    if "fitness_goal" in set_fields:
        user.fitness_goal = body.fitness_goal
    if "fitness_level" in set_fields:
        user.fitness_level = body.fitness_level
    if "preferred_equipment" in set_fields:
        user.preferred_equipment = body.preferred_equipment
    if "days_per_week" in set_fields:
        user.days_per_week = body.days_per_week
    if "preferred_days" in set_fields and body.preferred_days is not None:
        user.preferred_days = body.preferred_days
    if "age" in set_fields:
        user.age = body.age
    if "gender" in set_fields and body.gender is not None:
        user.gender = body.gender

    user.updated_at = datetime.now(timezone.utc)
    await user.save()
    return _fmt(user)


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(body: ChangePasswordRequest, user: User = Depends(get_current_user)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    # Invalidate all existing sessions — any token with iat < now will be rejected
    # by get_current_user's tokens_invalidated_at check.
    user.tokens_invalidated_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    await user.save()
