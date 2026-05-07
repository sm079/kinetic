from pydantic import BaseModel, Field
from app.models.nutrition import FoodItem, Meal


class FoodItemRequest(BaseModel):
    name: str
    note: str | None = None
    calories: float = Field(gt=0)
    protein_g: float | None = Field(None, ge=0)
    carbs_g: float | None = Field(None, ge=0)
    fat_g: float | None = Field(None, ge=0)
    quantity_g: float | None = Field(None, ge=0)


class MealRequest(BaseModel):
    name: str
    time: str | None = None
    items: list[FoodItemRequest] = []


class NutritionLogUpdateRequest(BaseModel):
    meals: list[MealRequest] | None = None
    calorie_goal: int | None = Field(None, gt=0)
    protein_goal_g: int | None = Field(None, ge=0)
    carbs_goal_g: int | None = Field(None, ge=0)
    fat_goal_g: int | None = Field(None, ge=0)


class NutritionLogResponse(BaseModel):
    id: str
    date: str
    meals: list[Meal]
    calorie_goal: int | None
    protein_goal_g: int | None
    carbs_goal_g: int | None
    fat_goal_g: int | None
