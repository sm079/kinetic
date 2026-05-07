from pydantic import BaseModel, Field
from app.models.workout_plan import ProgramDetails, PlanWeek


class WorkoutPlanCreateRequest(BaseModel):
    name: str
    tagline: str | None = None
    description: str | None = None
    details: ProgramDetails = Field(default_factory=ProgramDetails)
    weeks: list[PlanWeek] = []


class WorkoutPlanUpdateRequest(BaseModel):
    name: str | None = None
    tagline: str | None = None
    description: str | None = None
    details: ProgramDetails | None = None
    weeks: list[PlanWeek] | None = None
