from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import get_current_user
from app.models.exercise import Exercise
from app.models.muscle import Muscle
from app.models.user import User

router = APIRouter(prefix="/api/exercises", tags=["exercises"])


def _fmt(e: Exercise) -> dict:
    return {
        "name":              e.name,
        "bodypart":          e.bodypart,
        "category":          e.category,
        "aliases":           e.aliases,
        "icon_url":          e.icon_url,
        "count":             e.count,
        "primary_muscles":   e.primary_muscles,
        "secondary_muscles": e.secondary_muscles,
    }


@router.get("")
async def list_exercises(
    q:        str | None = Query(None, description="Substring filter on name / aliases"),
    bodypart: str | None = Query(None),
    category: str | None = Query(None),
    _user: User = Depends(get_current_user),
):
    """Return exercise catalog sorted by popularity."""
    query: dict = {}
    if bodypart:
        query["bodypart"] = bodypart
    if category:
        query["category"] = category

    exercises = await Exercise.find(query).sort(-Exercise.count).to_list()

    if q:
        q_lower = q.lower()
        exercises = [
            e for e in exercises
            if q_lower in e.name.lower()
            or any(q_lower in a.lower() for a in e.aliases)
        ]

    return [_fmt(e) for e in exercises]


@router.get("/muscles")
async def list_muscles(_user: User = Depends(get_current_user)):
    """Return flat muscle anatomy catalog."""
    muscles = await Muscle.find_all().to_list()
    return [
        {
            "muscle_id": m.muscle_id,
            "name":      m.name,
            "level":     m.level,
            "parent_id": m.parent_id,
            "group":     m.group,
            "region":    m.region,
        }
        for m in muscles
    ]


@router.get("/session-muscles")
async def get_session_muscles(
    names: list[str] = Query(default=[]),
    _user: User = Depends(get_current_user),
):
    """Return aggregated primary + secondary muscle IDs for a list of exercise names."""
    if not names:
        return {"primary": [], "secondary": []}
    exercises = await Exercise.find({"name": {"$in": names}}).to_list()
    primary: set[str] = set()
    secondary: set[str] = set()
    for ex in exercises:
        primary.update(ex.primary_muscles or [])
        secondary.update(ex.secondary_muscles or [])
    secondary -= primary
    return {"primary": sorted(primary), "secondary": sorted(secondary)}


@router.get("/{name}")
async def get_exercise(name: str, _user: User = Depends(get_current_user)):
    """Return full exercise record including strength standards."""
    ex = await Exercise.find_one({"name": name})
    if not ex:
        # Try case-insensitive fallback
        exercises = await Exercise.find_all().to_list()
        ex = next((e for e in exercises if e.name.lower() == name.lower()), None)
    if not ex:
        raise HTTPException(404, detail=f"Exercise '{name}' not found")

    base = _fmt(ex)
    base["standards_male"]   = [r.model_dump(by_alias=False) for r in ex.standards_male]
    base["standards_female"] = [r.model_dump(by_alias=False) for r in ex.standards_female]
    return base


@router.get("/{name}/level")
async def get_strength_level(
    name:       str,
    weight:     float = Query(..., description="Weight lifted (kg)"),
    bodyweight: float = Query(..., description="Athlete bodyweight (kg)"),
    gender:     str   = Query("male", description="male | female"),
    _user: User = Depends(get_current_user),
):
    """Return the strength level for a given lift weight at a given bodyweight."""
    ex = await Exercise.find_one({"name": name})
    if not ex:
        raise HTTPException(404, detail=f"Exercise '{name}' not found")

    level = ex.strength_level(weight, bodyweight, gender)
    if level is None:
        raise HTTPException(422, detail="No standards available for this exercise")

    # Compute percentile thresholds at this bodyweight for context
    table = ex.standards_male if gender == "male" else ex.standards_female
    row   = min(table, key=lambda r: abs(r.bw - bodyweight)) if table else None
    thresholds = {
        "beg":   row.beg,
        "nov":   row.nov,
        "int":   row.int_,
        "adv":   row.adv,
        "elite": row.elite,
    } if row else {}

    return {
        "exercise":   name,
        "weight_kg":  weight,
        "bodyweight": bodyweight,
        "gender":     gender,
        "level":      level,
        "thresholds": thresholds,
    }
