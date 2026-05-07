from enum import Enum
from typing import Literal, Annotated
from pydantic import BaseModel, Field, field_validator


class RPE(float, Enum):
    _4  = 4.0
    _45 = 4.5
    _5  = 5.0
    _55 = 5.5
    _6  = 6.0
    _65 = 6.5
    _7  = 7.0
    _75 = 7.5
    _8  = 8.0
    _85 = 8.5
    _9  = 9.0
    _95 = 9.5
    _10 = 10.0


class IntensityRPE(BaseModel):
    type: Literal["rpe"] = "rpe"
    value: RPE


class IntensityRIR(BaseModel):
    type: Literal["rir"] = "rir"
    value: Literal[0, 1, 2, 3, 4, 5]


Intensity = Annotated[
    IntensityRPE | IntensityRIR,
    Field(discriminator="type")
]


class SetPerformance(BaseModel):
    weight_kg: float | None = Field(None, ge=0)
    reps: int | None = Field(None, ge=0)
    duration_seconds: int | None = Field(None, ge=0)
    intensity: Intensity | None = None


class Set(BaseModel):
    is_warmup: bool = False
    target_performance: SetPerformance | None = None
    current_performance: SetPerformance | None = None
    completed: bool = False


class Lift(BaseModel):
    type: Literal["lift"] = "lift"
    name: str
    note: str | None = None
    sets: list[Set] = []


class Cardio(BaseModel):
    type: Literal["cardio"] = "cardio"
    name: str
    note: str | None = None
    distance_meters: float | None = None
    duration_seconds: int | None = None
    intensity: IntensityRPE | None = None


Activity = Annotated[
    Lift | Cardio,
    Field(discriminator="type")
]