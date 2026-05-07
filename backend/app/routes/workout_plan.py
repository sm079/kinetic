from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import get_current_user
from app.models.biometric import Biometric
from app.models.exercise import Exercise as ExerciseCatalog
from app.models.user import User
from app.models.workout import Workout
from app.models.workout_plan import PlannedDay, PlanWeek, WorkoutPlan
from app.schemas.workout_plan import WorkoutPlanCreateRequest, WorkoutPlanUpdateRequest

router = APIRouter(prefix="/api/programs", tags=["Programs"])


# ── Helpers ────────────────────────────────────────────────────────────────


def _serialize(plan: WorkoutPlan) -> dict:
    return {
        "id": str(plan.id),
        "name": plan.name,
        "tagline": plan.tagline,
        "description": plan.description,
        "details": plan.details.model_dump(),
        "weeks": [
            {
                "week": w.week,
                "days": [
                    {
                        "day": d.day,
                        "label": d.label,
                        "activities": [a.model_dump() for a in d.activities],
                    }
                    for d in w.days
                ],
            }
            for w in plan.weeks
        ],
        "created_at": plan.created_at.isoformat(),
        "updated_at": plan.updated_at.isoformat(),
        "is_following": plan.is_following,
        "current_week": plan.current_week,
        "current_day": plan.current_day,
        "followed_at": plan.followed_at.isoformat() if plan.followed_at else None,
    }


def _assert_owner(plan: WorkoutPlan | None, user_id: str) -> WorkoutPlan:
    if plan is None:
        raise HTTPException(status_code=404, detail="Program not found")
    if plan.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your program")
    return plan


def _first_workout_day(plan: WorkoutPlan) -> tuple[int, int] | None:
    for w in sorted(plan.weeks, key=lambda x: x.week):
        for d in sorted(w.days, key=lambda x: x.day):
            if d.activities:
                return (w.week, d.day)
    return None


def _next_workout_day(plan: WorkoutPlan) -> tuple[int, int] | None:
    passed_current = False
    for w in sorted(plan.weeks, key=lambda x: x.week):
        for d in sorted(w.days, key=lambda x: x.day):
            if not passed_current:
                if w.week == plan.current_week and d.day == plan.current_day:
                    passed_current = True
                continue
            if d.activities:
                return (w.week, d.day)
    return None


def _current_day_obj(plan: WorkoutPlan) -> tuple[PlanWeek | None, PlannedDay | None]:
    for w in plan.weeks:
        if w.week == plan.current_week:
            for d in w.days:
                if d.day == plan.current_day:
                    return w, d
    return None, None


# ── CRUD ───────────────────────────────────────────────────────────────────


@router.post("", status_code=201)
async def create_program(
    body: WorkoutPlanCreateRequest,
    user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    plan = WorkoutPlan(
        user_id=str(user.id),
        name=body.name,
        tagline=body.tagline,
        description=body.description,
        details=body.details,
        weeks=body.weeks,
        created_at=now,
        updated_at=now,
    )
    await plan.insert()
    return _serialize(plan)


# NOTE: /active must be declared before /{plan_id} to avoid "active" being
# matched as an ObjectId.
@router.get("/active")
async def get_active_program(user: User = Depends(get_current_user)):
    """Return the program the user is currently following, with the current
    week/day object inlined for immediate use in TrackWorkoutPage."""
    plan = await WorkoutPlan.find_one(
        WorkoutPlan.user_id == str(user.id),
        WorkoutPlan.is_following == True,  # noqa: E712
    )
    if plan is None:
        return None

    week_obj, day_obj = _current_day_obj(plan)
    result = _serialize(plan)
    result["current_day_data"] = (
        {
            "week": week_obj.week,
            "day": day_obj.day,
            "label": day_obj.label,
            "activities": [a.model_dump() for a in day_obj.activities],
        }
        if week_obj and day_obj
        else None
    )
    return result


@router.get("")
async def list_programs(
    skip: int = 0,
    limit: int = 50,
    user: User = Depends(get_current_user),
):
    plans = (
        await WorkoutPlan.find(WorkoutPlan.user_id == str(user.id))
        .sort("-created_at")
        .skip(skip)
        .limit(limit)
        .to_list()
    )
    return [_serialize(p) for p in plans]


@router.get("/{plan_id}/completions")
async def get_program_completions(
    plan_id: str,
    user: User = Depends(get_current_user),
):
    """Return a list of completed program days derived from the user's workout records."""
    plan = await WorkoutPlan.get(plan_id)
    _assert_owner(plan, str(user.id))

    workouts = await Workout.find(
        Workout.user_id == str(user.id),
        Workout.program_id == plan_id,
        {"completed_at": {"$ne": None}},
    ).sort("-started_at").to_list()

    return [
        {
            "week": w.program_week,
            "day": w.program_day,
            "label": w.program_day_label,
            "workout_id": str(w.id),
            "completed_at": w.completed_at.isoformat() if w.completed_at else None,
        }
        for w in workouts
        if w.program_week is not None and w.program_day is not None
    ]


@router.get("/{plan_id}")
async def get_program(
    plan_id: str,
    user: User = Depends(get_current_user),
):
    plan = await WorkoutPlan.get(plan_id)
    _assert_owner(plan, str(user.id))
    return _serialize(plan)


@router.patch("/{plan_id}")
async def update_program(
    plan_id: str,
    body: WorkoutPlanUpdateRequest,
    user: User = Depends(get_current_user),
):
    plan = await WorkoutPlan.get(plan_id)
    _assert_owner(plan, str(user.id))

    if body.name is not None:
        plan.name = body.name
    if body.tagline is not None:
        plan.tagline = body.tagline
    if body.description is not None:
        plan.description = body.description
    if body.details is not None:
        plan.details = body.details
    if body.weeks is not None:
        plan.weeks = body.weeks
    plan.updated_at = datetime.now(timezone.utc)

    await plan.save()
    return _serialize(plan)


@router.delete("/{plan_id}", status_code=204)
async def delete_program(
    plan_id: str,
    user: User = Depends(get_current_user),
):
    plan = await WorkoutPlan.get(plan_id)
    _assert_owner(plan, str(user.id))
    await plan.delete()


# ── Day with computed targets ─────────────────────────────────────────────


_LEVEL_REPS: dict[str, int] = {
    "beginner": 8, "novice": 8, "intermediate": 8, "advanced": 6, "elite": 5,
}


def _round_weight(w: float) -> float:
    return round(w * 2) / 2


def _progressive_target(history: list[tuple[float, int]]) -> tuple[float | None, int | None]:
    """Apply linear progressive overload from ordered (weight, reps) history (newest first)."""
    if not history:
        return None, None
    last_w, last_r = history[0]
    if not last_w or not last_r:
        return None, None
    if len(history) >= 2:
        prev_w = history[1][0]
        increment = last_w - prev_w
        next_w = _round_weight(last_w + (increment if 0 < increment <= 10 else 2.5))
    else:
        next_w = _round_weight(last_w + 2.5)
    return float(next_w), int(last_r)


def _std_target(
    ex_doc: ExerciseCatalog,
    bw_kg: float,
    level: str,
    gender: str,
) -> tuple[float | None, int | None]:
    table = ex_doc.standards_male if gender == "male" else ex_doc.standards_female
    if not table:
        return None, None
    row = min(table, key=lambda r: abs(r.bw - bw_kg))
    weight_map = {
        "beginner": row.beg,
        "novice": row.nov,
        "intermediate": row.int_,
        "advanced": row.adv,
        "elite": row.elite,
    }
    raw_kg = weight_map.get(level, row.beg)
    target_kg = round(raw_kg / 2.5) * 2.5
    return float(target_kg), _LEVEL_REPS.get(level, 8)


@router.get("/{plan_id}/day")
async def get_day_with_targets(
    plan_id: str,
    week: int,
    day: int,
    user: User = Depends(get_current_user),
):
    """Return the planned day's activities with target weights/reps filled in.

    Priority order per set:
      1. Existing target_performance.weight_kg (user already set it) → keep as-is.
      2. Last completed working set for this exercise → use that weight + reps.
      3. Strength-standards lookup using the user's fitness level + bodyweight.
    """
    plan = await WorkoutPlan.get(plan_id)
    _assert_owner(plan, str(user.id))

    week_obj = next((w for w in plan.weeks if w.week == week), None)
    if week_obj is None:
        raise HTTPException(status_code=404, detail="Week not found")
    day_obj = next((d for d in week_obj.days if d.day == day), None)
    if day_obj is None:
        raise HTTPException(status_code=404, detail="Day not found")

    lift_names = [a.name for a in day_obj.activities if a.type == "lift"]

    # ── 1. User's bodyweight from most recent biometric ───────────────────
    bodyweight_kg: float | None = None
    if lift_names:
        latest_bio = await Biometric.find(
            Biometric.user_id == str(user.id),
        ).sort("-recorded_at").first_or_none()
        if latest_bio:
            bodyweight_kg = latest_bio.weight_kg

    fitness_level = user.fitness_level.value if user.fitness_level else "intermediate"
    gender = user.gender or "male"

    # ── 2. Past performance — collect ordered history per exercise ───────────
    exercise_history: dict[str, list[tuple[float, int]]] = defaultdict(list)
    if lift_names:
        recent_workouts = await Workout.find(
            Workout.user_id == str(user.id),
            {"completed_at": {"$ne": None}},
            {"activities": {"$elemMatch": {"type": "lift", "name": {"$in": lift_names}}}},
        ).sort("-started_at").limit(50).to_list()

        for wkt in recent_workouts:
            seen_this_session: set[str] = set()
            for act in wkt.activities:
                if act.type != "lift" or act.name not in lift_names:
                    continue
                if act.name in seen_this_session:
                    continue
                working = [
                    s for s in act.sets
                    if not s.is_warmup
                    and s.current_performance
                    and s.current_performance.weight_kg is not None
                    and s.current_performance.reps is not None
                ]
                if working:
                    best = max(working, key=lambda s: s.current_performance.weight_kg)
                    exercise_history[act.name].append((
                        best.current_performance.weight_kg,
                        best.current_performance.reps,
                    ))
                    seen_this_session.add(act.name)

    # ── 3. Exercise standards for exercises with no history ────────────────
    exercises_needed = [n for n in lift_names if n not in exercise_history]
    exercise_map: dict[str, ExerciseCatalog] = {}
    if exercises_needed and bodyweight_kg:
        docs = await ExerciseCatalog.find(
            {"name": {"$in": exercises_needed}}
        ).to_list()
        exercise_map = {ex.name: ex for ex in docs}

    # ── 4. Build result with targets injected ─────────────────────────────
    result_activities = []
    for activity in day_obj.activities:
        act_dict = activity.model_dump()
        if activity.type == "lift":
            for i, s in enumerate(activity.sets):
                if s.is_warmup:
                    continue
                tp = dict(act_dict["sets"][i].get("target_performance") or {})
                if tp.get("weight_kg") is not None:
                    # User already set an explicit target — preserve it
                    act_dict["sets"][i]["target_performance"] = tp
                    continue

                if activity.name in exercise_history:
                    next_w, next_r = _progressive_target(exercise_history[activity.name])
                    if next_w is not None:
                        tp["weight_kg"] = next_w
                    if next_r is not None and tp.get("reps") is None:
                        tp["reps"] = next_r
                elif activity.name in exercise_map and bodyweight_kg:
                    w, r = _std_target(
                        exercise_map[activity.name], bodyweight_kg, fitness_level, gender
                    )
                    if w is not None:
                        tp["weight_kg"] = w
                    if r is not None and tp.get("reps") is None:
                        tp["reps"] = r

                act_dict["sets"][i]["target_performance"] = tp if tp else None
        result_activities.append(act_dict)

    return {
        "week": week,
        "day": day,
        "label": day_obj.label,
        "activities": result_activities,
    }


# ── Follow / progression ───────────────────────────────────────────────────


@router.post("/{plan_id}/follow")
async def follow_program(
    plan_id: str,
    user: User = Depends(get_current_user),
):
    """Mark this program as the active followed program. Unfollows any other
    currently followed program. Resets progression to the first workout day."""
    plan = await WorkoutPlan.get(plan_id)
    _assert_owner(plan, str(user.id))

    if not plan.weeks:
        raise HTTPException(status_code=400, detail="Program has no weeks defined")

    await WorkoutPlan.find(
        WorkoutPlan.user_id == str(user.id),
        WorkoutPlan.is_following == True,  # noqa: E712
    ).update({"$set": {"is_following": False}})

    first = _first_workout_day(plan)
    if first is None:
        raise HTTPException(status_code=400, detail="Program has no workout days")

    plan.is_following = True
    plan.current_week, plan.current_day = first
    plan.followed_at = datetime.now(timezone.utc)
    plan.updated_at = datetime.now(timezone.utc)
    await plan.save()
    return _serialize(plan)


@router.post("/{plan_id}/unfollow")
async def unfollow_program(
    plan_id: str,
    user: User = Depends(get_current_user),
):
    plan = await WorkoutPlan.get(plan_id)
    _assert_owner(plan, str(user.id))

    plan.is_following = False
    plan.updated_at = datetime.now(timezone.utc)
    await plan.save()
    return _serialize(plan)


@router.post("/{plan_id}/advance")
async def advance_program(
    plan_id: str,
    user: User = Depends(get_current_user),
):
    """Advance the program to the next workout day. Returns the updated plan.
    If there are no more days, the program is marked complete (is_following=False)."""
    plan = await WorkoutPlan.get(plan_id)
    _assert_owner(plan, str(user.id))

    nxt = _next_workout_day(plan)
    if nxt is None:
        plan.is_following = False
    else:
        plan.current_week, plan.current_day = nxt

    plan.updated_at = datetime.now(timezone.utc)
    await plan.save()

    result = _serialize(plan)
    result["program_complete"] = nxt is None
    return result
