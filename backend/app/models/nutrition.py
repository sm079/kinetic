from datetime import datetime, timezone
from beanie import Document
from pymongo import IndexModel, ASCENDING, DESCENDING
from pydantic import BaseModel, Field


class FoodItem(BaseModel):
    name: str
    note: str | None = None
    calories: float
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    quantity_g: float | None = None


class Meal(BaseModel):
    name: str  # Breakfast / Lunch / Dinner / Snack
    time: str | None = None
    items: list[FoodItem] = []


class NutritionLog(Document):
    user_id: str
    date: str  # YYYY-MM-DD
    meals: list[Meal] = []
    calorie_goal: int | None = None
    protein_goal_g: int | None = None
    carbs_goal_g: int | None = None
    fat_goal_g: int | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "nutrition_logs"
        indexes = [
            # Queries filter by user then sort/filter by date
            IndexModel([("user_id", ASCENDING), ("date", DESCENDING)]),
        ]
