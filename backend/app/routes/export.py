import csv
import io
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.core.auth import get_current_user
from app.models.user import User
from app.models.workout import Workout
from app.models.nutrition import NutritionLog
from app.models.biometric import Biometric

router = APIRouter(prefix="/api/export", tags=["Export"])


def _csv_response(rows: list[list], headers: list[str], filename: str) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/workouts")
async def export_workouts(format: str | None = None, user: User = Depends(get_current_user)):
    workouts = await Workout.find(Workout.user_id == str(user.id)).sort("-started_at").to_list()

    if format != "csv":
        return [
            {
                "id": str(w.id),
                "name": w.name,
                "started_at": w.started_at.isoformat(),
                "completed_at": w.completed_at.isoformat() if w.completed_at else None,
                "activities": [a.model_dump() for a in w.activities],
            }
            for w in workouts
        ]

    rows = []
    for w in workouts:
        date = w.started_at.date().isoformat()
        for a in w.activities:
            if a.type != "lift":
                continue
            for i, s in enumerate(a.sets, 1):
                weight = (s.current_performance.weight_kg if s.current_performance else None) \
                    or (s.target_performance.weight_kg if s.target_performance else None) or ""
                reps = (s.current_performance.reps if s.current_performance else None) \
                    or (s.target_performance.reps if s.target_performance else None) or ""
                rows.append([date, w.name, a.name, i, weight, reps, s.completed])

    return _csv_response(rows, ["date", "workout_name", "exercise", "set_number", "weight_kg", "reps", "completed"], "workouts.csv")


@router.get("/nutrition")
async def export_nutrition(
    format: str | None = None,
    start: str | None = None,
    end: str | None = None,
    user: User = Depends(get_current_user),
):
    query = [NutritionLog.user_id == str(user.id)]
    if start:
        query.append(NutritionLog.date >= start)
    if end:
        query.append(NutritionLog.date <= end)
    logs = await NutritionLog.find(*query).sort(-NutritionLog.date).to_list()

    if format != "csv":
        return [
            {
                "id": str(l.id),
                "date": l.date,
                "meals": [m.model_dump() for m in l.meals],
                "calorie_goal": l.calorie_goal,
            }
            for l in logs
        ]

    rows = []
    for l in logs:
        for meal in l.meals:
            for item in meal.items:
                rows.append([
                    l.date, meal.name, item.name,
                    round(item.calories, 1),
                    item.protein_g or "", item.carbs_g or "", item.fat_g or "",
                ])

    return _csv_response(rows, ["date", "meal", "food", "calories", "protein_g", "carbs_g", "fat_g"], "nutrition.csv")


@router.get("/biometrics")
async def export_biometrics(format: str | None = None, user: User = Depends(get_current_user)):
    entries = await Biometric.find(Biometric.user_id == str(user.id)).sort(-Biometric.recorded_at).to_list()

    if format != "csv":
        return [
            {
                "id": str(e.id),
                "recorded_at": e.recorded_at.isoformat(),
                "weight_kg": e.weight_kg,
                "body_fat_pct": e.body_fat_pct,
                "muscle_mass_kg": e.muscle_mass_kg,
                "waist_cm": e.waist_cm,
            }
            for e in entries
        ]

    rows = []
    for e in entries:
        rows.append([
            e.recorded_at.date().isoformat(),
            e.weight_kg or "", e.body_fat_pct or "", e.muscle_mass_kg or "",
            e.visceral_fat_level or "", e.chest_cm or "", e.waist_cm or "",
            e.hips_cm or "", e.thigh_cm or "", e.bicep_cm or "", e.calf_cm or "",
        ])

    return _csv_response(
        rows,
        ["date", "weight_kg", "body_fat_pct", "muscle_mass_kg", "visceral_fat_level",
         "chest_cm", "waist_cm", "hips_cm", "thigh_cm", "bicep_cm", "calf_cm"],
        "biometrics.csv",
    )
