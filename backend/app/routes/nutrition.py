import base64
import json
import os
import re
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from app.core.auth import get_current_user
from app.models.user import User
from app.models.nutrition import NutritionLog, Meal, FoodItem
from app.schemas.nutrition import NutritionLogUpdateRequest, NutritionLogResponse

router = APIRouter(prefix="/api/nutrition", tags=["Nutrition"])


def _fmt(log: NutritionLog) -> NutritionLogResponse:
    return NutritionLogResponse(
        id=str(log.id),
        date=log.date,
        meals=log.meals,
        calorie_goal=log.calorie_goal,
        protein_goal_g=log.protein_goal_g,
        carbs_goal_g=log.carbs_goal_g,
        fat_goal_g=log.fat_goal_g,
    )


def _assert_owner(log: NutritionLog | None, user_id: str) -> NutritionLog:
    if log is None:
        raise HTTPException(status_code=404, detail="Log not found")
    if log.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your log")
    return log


@router.get("", response_model=NutritionLogResponse)
async def get_or_create_log(
    date: str | None = None,
    user: User = Depends(get_current_user),
):
    """Get the nutrition log for a given date (YYYY-MM-DD), creating one if it doesn't exist."""
    target_date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Validate date format
    try:
        datetime.strptime(target_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")

    log = await NutritionLog.find_one(
        NutritionLog.user_id == str(user.id),
        NutritionLog.date == target_date,
    )
    if not log:
        # Carry over goals from the most recent previous log
        prev = await NutritionLog.find(
            NutritionLog.user_id == str(user.id)
        ).sort(-NutritionLog.date).first_or_none()

        log = NutritionLog(
            user_id=str(user.id),
            date=target_date,
            calorie_goal=prev.calorie_goal if prev else None,
            protein_goal_g=prev.protein_goal_g if prev else None,
            carbs_goal_g=prev.carbs_goal_g if prev else None,
            fat_goal_g=prev.fat_goal_g if prev else None,
        )
        await log.insert()

    return _fmt(log)


@router.patch("/{log_id}", response_model=NutritionLogResponse)
async def update_log(log_id: str, body: NutritionLogUpdateRequest, user: User = Depends(get_current_user)):
    log = await NutritionLog.get(log_id)
    _assert_owner(log, str(user.id))

    if body.meals is not None:
        log.meals = [
            Meal(
                name=m.name,
                time=m.time,
                items=[FoodItem(**item.model_dump()) for item in m.items],
            )
            for m in body.meals
        ]
    if body.calorie_goal is not None:
        log.calorie_goal = body.calorie_goal
    if body.protein_goal_g is not None:
        log.protein_goal_g = body.protein_goal_g
    if body.carbs_goal_g is not None:
        log.carbs_goal_g = body.carbs_goal_g
    if body.fat_goal_g is not None:
        log.fat_goal_g = body.fat_goal_g

    log.updated_at = datetime.now(timezone.utc)
    await log.save()
    return _fmt(log)


@router.delete("/{log_id}", status_code=204)
async def delete_log(log_id: str, user: User = Depends(get_current_user)):
    log = await NutritionLog.get(log_id)
    _assert_owner(log, str(user.id))
    await log.delete()


@router.get("/history", response_model=list[NutritionLogResponse])
async def get_history(days: int = 30, user: User = Depends(get_current_user)):
    """Return the last N days of logs that have data."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    logs = await NutritionLog.find(
        NutritionLog.user_id == str(user.id),
        NutritionLog.date >= cutoff,
    ).sort(-NutritionLog.date).to_list()
    return [_fmt(l) for l in logs]


_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
_ANALYZE_PROMPT = """You are a nutrition expert. Analyze this food image and return a JSON object.

Return ONLY valid JSON, no markdown, no explanation. Format:
{
  "name": "descriptive food name",
  "calories": <number>,
  "protein_g": <number or null>,
  "carbs_g": <number or null>,
  "fat_g": <number or null>,
  "quantity_g": <estimated grams or null>,
  "micros": [
    {"name": "Vitamin C", "amount": "15mg"},
    {"name": "Iron", "amount": "2.1mg"}
  ],
  "confidence": "low" | "medium" | "high",
  "note": "brief note about the estimate e.g. portion size assumed, multiple items detected"
}

Rules:
- Estimate for a typical single serving unless the image clearly shows more
- If multiple foods are visible, name the main dish and combine totals
- Round calories to nearest 5, macros to 1 decimal
- confidence = "high" if food is clearly identifiable, "medium" if likely, "low" if unclear
- micros: include 2-4 notable micronutrients only (the most relevant for this food)
- If you cannot identify any food, return {"error": "No food detected"}"""


@router.post("/analyze-image")
async def analyze_food_image(
    image: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Analyze a food image and return estimated nutrition info using Llama 4 Scout vision."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Vision analysis not configured")

    # Read and encode image
    data = await image.read()
    if len(data) > 10 * 1024 * 1024:  # 10 MB limit
        raise HTTPException(status_code=400, detail="Image too large (max 10 MB)")

    mime = image.content_type or "image/jpeg"
    b64 = base64.b64encode(data).decode()

    payload = {
        "model": _VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}"},
                    },
                    {"type": "text", "text": _ANALYZE_PROMPT},
                ],
            }
        ],
        "max_tokens": 512,
        "temperature": 0.2,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Vision API error: {resp.text[:200]}")

    raw = resp.json()["choices"][0]["message"]["content"].strip()

    # Strip markdown code fences if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Could not parse vision model response")

    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])

    return result
