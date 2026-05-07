from datetime import datetime, timezone, timedelta, date as date_type

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import get_current_user
from app.models.biometric import Biometric
from app.models.exercise import Exercise as ExerciseCatalog
from app.models.user import User
from app.models.workout import Workout
from app.schemas.workout import WorkoutCreateRequest, WorkoutUpdateRequest

_PROFILE_REPS: dict[str, int] = {
    "beginner": 8, "novice": 8, "intermediate": 8, "advanced": 6, "elite": 5,
}
_DEFAULT_BW: dict[str, float] = {"male": 75.0, "female": 62.0}

router = APIRouter(prefix="/api/workouts", tags=["Workouts"])


def _serialize(workout: Workout) -> dict:
    return {
        "id": str(workout.id),
        "name": workout.name,
        "note": workout.note,
        "started_at": workout.started_at.isoformat(),
        "completed_at": workout.completed_at.isoformat() if workout.completed_at else None,
        "updated_at": workout.updated_at.isoformat() if workout.updated_at else None,
        "activities": [a.model_dump() for a in workout.activities],
        "program_id": workout.program_id,
        "program_week": workout.program_week,
        "program_day": workout.program_day,
        "program_day_label": workout.program_day_label,
    }


def _assert_owner(workout: Workout | None, user_id: str) -> Workout:
    if workout is None:
        raise HTTPException(status_code=404, detail="Workout not found")
    if workout.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your workout")
    return workout


def _vol(activities) -> float:
    """Sum weight_kg × reps across all completed lift sets."""
    total = 0.0
    for a in activities:
        if a.type != "lift":
            continue
        for s in a.sets:
            w_kg = (s.current_performance.weight_kg if s.current_performance else None) \
                or (s.target_performance.weight_kg if s.target_performance else None) or 0
            r = (s.current_performance.reps if s.current_performance else None) \
                or (s.target_performance.reps if s.target_performance else None) or 0
            total += (w_kg or 0) * (r or 0)
    return total


@router.post("", status_code=201)
async def create_workout(
    body: WorkoutCreateRequest,
    user: User = Depends(get_current_user),
):
    workout = Workout(
        user_id=str(user.id),
        name=body.name,
        note=body.note,
        started_at=body.started_at,
        completed_at=body.completed_at,
        activities=body.activities,
        program_id=body.program_id,
        program_week=body.program_week,
        program_day=body.program_day,
        program_day_label=body.program_day_label,
    )
    await workout.insert()
    return _serialize(workout)


@router.get("")
async def list_workouts(
    skip: int = 0,
    limit: int = 50,
    user: User = Depends(get_current_user),
):
    workouts = (
        await Workout.find(Workout.user_id == str(user.id))
        .sort("-started_at")
        .skip(skip)
        .limit(limit)
        .to_list()
    )
    return [_serialize(w) for w in workouts]


@router.get("/exercises")
async def list_exercises(user: User = Depends(get_current_user)):
    """Return a sorted deduplicated list of all exercise names (lifts + cardio) the user has logged."""
    workouts = await Workout.find(Workout.user_id == str(user.id)).to_list()
    names: set[str] = set()
    for w in workouts:
        for a in w.activities:
            names.add(a.name)
    return sorted(names)


@router.get("/stats")
async def workout_stats(user: User = Depends(get_current_user)):
    """Aggregate workout statistics computed server-side."""
    workouts = await Workout.find(Workout.user_id == str(user.id)).to_list()

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    def _aware(dt: datetime) -> datetime:
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

    this_month = [w for w in workouts if _aware(w.started_at) >= month_start]

    # Streak
    dates: set[date_type] = {w.started_at.date() for w in workouts}
    streak = 0
    today = now.date()
    for i in range(365):
        d = today - timedelta(days=i)
        if d in dates:
            streak += 1
        elif i > 0:
            break

    total_volume = sum(_vol(w.activities) for w in workouts)
    this_month_volume = sum(_vol(w.activities) for w in this_month)

    return {
        "total_sessions": len(workouts),
        "this_month_sessions": len(this_month),
        "current_streak_days": streak,
        "total_volume_kg": round(total_volume, 1),
        "this_month_volume_kg": round(this_month_volume, 1),
    }


@router.get("/prs")
async def workout_prs(user: User = Depends(get_current_user)):
    """Return the heaviest logged weight per exercise."""
    workouts = await Workout.find(Workout.user_id == str(user.id)).sort("-started_at").to_list()
    bests: dict[str, dict] = {}
    for w in workouts:
        for a in w.activities:
            if a.type != "lift":
                continue
            for s in a.sets:
                weight = (s.current_performance.weight_kg if s.current_performance else None) \
                    or (s.target_performance.weight_kg if s.target_performance else None)
                reps = (s.current_performance.reps if s.current_performance else None) \
                    or (s.target_performance.reps if s.target_performance else None)
                if not weight:
                    continue
                if a.name not in bests or weight > bests[a.name]["weight_kg"]:
                    bests[a.name] = {
                        "name": a.name,
                        "weight_kg": weight,
                        "reps": reps,
                        "date": w.started_at.date().isoformat(),
                    }
    return sorted(bests.values(), key=lambda x: x["weight_kg"], reverse=True)


# ── Progression prediction helpers ────────────────────────────────────────

def _round_weight(w: float) -> float:
    """Round to nearest 0.5 kg."""
    return round(w * 2) / 2


def _brzycki_1rm(weight: float, reps: int) -> float:
    """Brzycki 1RM formula (valid 1–36 reps)."""
    if reps <= 0:
        return weight
    if reps >= 37:
        return weight * 1.9
    return weight * 36 / (37 - reps)


def _suggest_next(history: list[tuple[float, int]]) -> dict | None:
    """
    Given (weight_kg, reps) tuples most-recent first, recommend the next
    working weight using linear progression + Brzycki 1RM estimate.
    """
    if not history:
        return None
    last_w, last_r = history[0]
    if last_w <= 0 or last_r <= 0:
        return None

    est_1rm = _brzycki_1rm(last_w, last_r)

    if len(history) >= 2:
        prev_w, _ = history[1]
        increment = last_w - prev_w
        # Continue the same increment if it was a positive, sensible jump
        next_w = _round_weight(last_w + (increment if 0 < increment <= 10 else 2.5))
    else:
        next_w = _round_weight(last_w + 2.5)

    return {
        "weight_kg": next_w,
        "reps": last_r,
        "last_weight_kg": last_w,
        "last_reps": last_r,
        "estimated_1rm": round(est_1rm, 1),
        "sessions_analysed": len(history),
    }


@router.get("/suggestions")
async def exercise_suggestions(
    exercises: list[str] = Query(default=[]),
    user: User = Depends(get_current_user),
):
    """
    For each requested exercise name, inspect the last 50 workouts and return
    a progressive-overload target (weight + reps) based on prior performance.
    """
    if not exercises:
        return {}

    name_lower_map = {e.lower(): e for e in exercises}
    target_lower = set(name_lower_map.keys())

    workouts = (
        await Workout.find(Workout.user_id == str(user.id))
        .sort("-started_at")
        .limit(50)
        .to_list()
    )

    # Collect the heaviest completed work set per exercise per session
    history: dict[str, list[tuple[float, int]]] = defaultdict(list)
    for w in workouts:
        session_best: dict[str, tuple[float, int]] = {}
        for a in w.activities:
            if a.type != "lift":
                continue
            name_l = a.name.lower()
            if name_l not in target_lower:
                continue
            for s in a.sets:
                if s.is_warmup or not s.completed:
                    continue
                cp = s.current_performance
                if not cp or not cp.weight_kg or not cp.reps:
                    continue
                orig = name_lower_map[name_l]
                if orig not in session_best or cp.weight_kg > session_best[orig][0]:
                    session_best[orig] = (cp.weight_kg, cp.reps)
        for orig, best in session_best.items():
            history[orig].append(best)

    result: dict[str, dict] = {
        name: suggestion
        for name in exercises
        if (suggestion := _suggest_next(history.get(name, []))) is not None
    }

    # ── Profile-based fallback for exercises with no logged history ───────────
    no_history = [n for n in exercises if n not in result]
    if no_history:
        latest_bio = await Biometric.find(
            Biometric.user_id == str(user.id)
        ).sort("-recorded_at").first_or_none()

        gender = user.gender or "male"
        bw_kg: float = (
            latest_bio.weight_kg
            if latest_bio and latest_bio.weight_kg
            else _DEFAULT_BW.get(gender, 75.0)
        )
        fitness_level = user.fitness_level.value if user.fitness_level else "intermediate"

        ex_docs = await ExerciseCatalog.find({"name": {"$in": no_history}}).to_list()
        for ex_doc in ex_docs:
            table = ex_doc.standards_male if gender == "male" else ex_doc.standards_female
            if not table:
                continue
            row = min(table, key=lambda r: abs(r.bw - bw_kg))
            weight_map = {
                "beginner": row.beg, "novice": row.nov, "intermediate": row.int_,
                "advanced": row.adv, "elite": row.elite,
            }
            raw_kg = weight_map.get(fitness_level, row.beg)
            if raw_kg <= 0:
                continue
            target_kg = round(raw_kg / 2.5) * 2.5
            result[ex_doc.name] = {
                "weight_kg": float(target_kg),
                "reps": _PROFILE_REPS.get(fitness_level, 8),
                "last_weight_kg": None,
                "last_reps": None,
                "estimated_1rm": None,
                "sessions_analysed": 0,
            }

    return result


@router.get("/heatmap")
async def workout_heatmap(
    year: int | None = Query(None, description="Calendar year (e.g. 2025). Omit for rolling 52-week window."),
    user: User = Depends(get_current_user),
):
    """Return per-day aggregated workout data for the heatmap grid."""
    today = datetime.now(timezone.utc).date()

    if year is not None:
        start = datetime(year, 1, 1, tzinfo=timezone.utc)
        end   = datetime(year, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
        rolling = False
    else:
        isoday = today.weekday()  # Mon=0
        monday = today - timedelta(days=isoday)
        start  = datetime(*(monday - timedelta(weeks=51)).timetuple()[:3], tzinfo=timezone.utc)
        end    = datetime(*((monday + timedelta(days=6)).timetuple()[:3]),
                          23, 59, 59, tzinfo=timezone.utc)
        rolling = True

    workouts = await Workout.find(
        Workout.user_id == str(user.id),
        Workout.started_at >= start,
        Workout.started_at <= end,
    ).to_list()

    days: dict[str, dict] = {}
    for w in workouts:
        key = w.started_at.date().isoformat()
        if key not in days:
            days[key] = {"volume": 0.0, "sessions": 0, "cardio_minutes": 0.0, "exercises": {}}
        days[key]["sessions"] += 1
        days[key]["volume"]   = round(days[key]["volume"] + _vol(w.activities), 2)
        for a in w.activities:
            if a.type == "cardio" and a.duration_seconds:
                mins = round(a.duration_seconds / 60, 1)
                days[key]["cardio_minutes"] = round(days[key]["cardio_minutes"] + mins, 1)
                days[key]["exercises"][a.name] = round(
                    days[key]["exercises"].get(a.name, 0) + mins, 1
                )
            elif a.type == "lift":
                lift_vol = _vol([a])
                if lift_vol > 0:
                    days[key]["exercises"][a.name] = round(
                        days[key]["exercises"].get(a.name, 0) + lift_vol, 2
                    )

    return {"year": year, "rolling": rolling, "days": days}


@router.get("/{workout_id}")
async def get_workout(
    workout_id: str,
    user: User = Depends(get_current_user),
):
    workout = await Workout.get(workout_id)
    _assert_owner(workout, str(user.id))
    return _serialize(workout)


@router.patch("/{workout_id}")
async def update_workout(
    workout_id: str,
    body: WorkoutUpdateRequest,
    user: User = Depends(get_current_user),
):
    workout = await Workout.get(workout_id)
    _assert_owner(workout, str(user.id))

    if body.name is not None:
        workout.name = body.name
    if body.note is not None:
        workout.note = body.note
    if body.completed_at is not None:
        workout.completed_at = body.completed_at
    if body.activities is not None:
        workout.activities = body.activities
    workout.updated_at = datetime.now(timezone.utc)

    await workout.save()
    return _serialize(workout)


@router.delete("/{workout_id}", status_code=204)
async def delete_workout(
    workout_id: str,
    user: User = Depends(get_current_user),
):
    workout = await Workout.get(workout_id)
    _assert_owner(workout, str(user.id))
    await workout.delete()
