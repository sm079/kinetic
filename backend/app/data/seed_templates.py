"""
Seed the `templates` MongoDB collection.
Always drops and re-inserts so template changes and exercise name corrections are picked up.
All exercise names match exact entries in the exercises catalog (exercises_full.json).
"""

from __future__ import annotations

from app.models.activity import Cardio, IntensityRPE, Lift, Set, SetPerformance
from app.models.template import Template
from app.models.workout_plan import PlannedDay, PlanWeek, ProgramDetails


# ── Helpers ────────────────────────────────────────────────────────────────


def _lift(name: str, sets_count: int, reps: int | None = None, warmup: int = 0) -> Lift:
    work_perf = SetPerformance(reps=reps)
    sets: list[Set] = []
    for _ in range(warmup):
        sets.append(Set(is_warmup=True, target_performance=SetPerformance(reps=reps)))
    for _ in range(sets_count):
        sets.append(Set(is_warmup=False, target_performance=work_perf))
    return Lift(name=name, sets=sets)


def _cardio(name: str, duration_minutes: int) -> Cardio:
    return Cardio(name=name, duration_seconds=duration_minutes * 60)


def _day(day: int, label: str, activities: list) -> PlannedDay:
    return PlannedDay(day=day, label=label, activities=activities)


def _week(week: int, days: list[PlannedDay]) -> PlanWeek:
    return PlanWeek(week=week, days=days)


def _details(
    equipment: str,
    level: str,
    duration_weeks: int,
    days_per_week: int,
    minutes_per_workout: int,
    recommended_days: list[str],
) -> ProgramDetails:
    return ProgramDetails(
        equipment=equipment,
        level=level,
        duration_weeks=duration_weeks,
        days_per_week=days_per_week,
        minutes_per_workout=minutes_per_workout,
        recommended_days=recommended_days,
    )


# ── Templates ──────────────────────────────────────────────────────────────


def _stronglifts() -> Template:
    """StrongLifts 5×5 — alternate A/B, add weight every session."""
    workout_a = [
        _lift("Squat",       5, reps=5, warmup=2),
        _lift("Bench Press", 5, reps=5, warmup=1),
        _lift("Bent Over Row", 5, reps=5, warmup=1),
    ]
    workout_b = [
        _lift("Squat",    5, reps=5, warmup=2),
        _lift("Military Press", 5, reps=5, warmup=1),
        _lift("Deadlift", 1, reps=5, warmup=2),
    ]
    return Template(
        template_id="stronglifts5x5",
        name="StrongLifts 5×5",
        tagline="Simple barbell strength for beginners",
        description=(
            "Alternate Workout A and B three times per week. "
            "Add 2.5 kg to upper-body lifts and 5 kg to lower-body lifts every session. "
            "Ideal for those new to barbell training."
        ),
        details=_details(
            equipment="full_gym",
            level="beginner",
            duration_weeks=12,
            days_per_week=3,
            minutes_per_workout=45,
            recommended_days=["monday", "wednesday", "friday"],
        ),
        weeks=[_week(1, [
            _day(1, "Workout A", workout_a),
            _day(2, "Workout B", workout_b),
            _day(3, "Workout A", workout_a),
        ])],
    )


def _ppl() -> Template:
    """Push / Pull / Legs — classic 6-day hypertrophy split."""
    push_a = [
        _lift("Bench Press",                 4, reps=8,  warmup=2),
        _lift("Incline Dumbbell Bench Press", 3, reps=10),
        _lift("Military Press",              3, reps=10, warmup=1),
        _lift("Dumbbell Lateral Raise",      4, reps=15),
        _lift("Tricep Pushdown",             3, reps=12),
    ]
    pull_a = [
        _lift("Bent Over Row",   4, reps=8,  warmup=2),
        _lift("Pull Ups",        3, reps=8,  warmup=1),
        _lift("Seated Cable Row",3, reps=10),
        _lift("Face Pull",       4, reps=15),
        _lift("Barbell Curl",    3, reps=12),
    ]
    legs_a = [
        _lift("Squat",            4, reps=8,  warmup=2),
        _lift("Romanian Deadlift",3, reps=10, warmup=1),
        _lift("Sled Leg Press",   3, reps=12),
        _lift("Lying Leg Curl",   3, reps=12),
        _lift("Machine Calf Raise",4, reps=15),
    ]
    push_b = [
        _lift("Incline Bench Press",          4, reps=8,  warmup=1),
        _lift("Dumbbell Shoulder Press",      3, reps=10),
        _lift("Cable Fly",                    3, reps=12),
        _lift("Dumbbell Lateral Raise",       4, reps=15),
        _lift("Lying Tricep Extension",       3, reps=12),
    ]
    pull_b = [
        _lift("Deadlift",          3, reps=5,  warmup=2),
        _lift("Lat Pulldown",      4, reps=10, warmup=1),
        _lift("Dumbbell Row",      3, reps=10),
        _lift("Dumbbell Reverse Fly", 4, reps=15),
        _lift("Hammer Curl",       3, reps=12),
    ]
    legs_b = [
        _lift("Front Squat",           4, reps=8,  warmup=2),
        _lift("Leg Extension",         3, reps=12),
        _lift("Bulgarian Split Squat", 3, reps=10),
        _lift("Lying Leg Curl",        3, reps=12),
        _lift("Seated Calf Raise",     4, reps=15),
    ]
    return Template(
        template_id="ppl",
        name="Push / Pull / Legs",
        tagline="6-day hypertrophy split",
        description=(
            "Classic PPL split run twice per week. "
            "Push days target chest, shoulders and triceps. "
            "Pull days target back and biceps. "
            "Leg days hit the full lower body. "
            "Ideal for intermediates who can train 6 days per week."
        ),
        details=_details(
            equipment="full_gym",
            level="intermediate",
            duration_weeks=8,
            days_per_week=6,
            minutes_per_workout=75,
            recommended_days=["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
        ),
        weeks=[_week(1, [
            _day(1, "Push A",  push_a),
            _day(2, "Pull A",  pull_a),
            _day(3, "Legs A",  legs_a),
            _day(4, "Push B",  push_b),
            _day(5, "Pull B",  pull_b),
            _day(6, "Legs B",  legs_b),
        ])],
    )


def _fullbody() -> Template:
    """Full Body 3×/Week — balanced beginner template."""
    session_a = [
        _lift("Squat",         3, reps=8, warmup=1),
        _lift("Bench Press",   3, reps=8, warmup=1),
        _lift("Bent Over Row", 3, reps=8, warmup=1),
        _lift("Military Press",3, reps=10),
        _lift("Deadlift",      1, reps=5, warmup=2),
    ]
    session_b = [
        _lift("Squat",                    3, reps=8, warmup=1),
        _lift("Incline Dumbbell Bench Press", 3, reps=10),
        _lift("Pull Ups",                 3, reps=8,  warmup=1),
        _lift("Dumbbell Shoulder Press",  3, reps=10),
        _lift("Romanian Deadlift",        3, reps=10, warmup=1),
    ]
    return Template(
        template_id="fullbody3x",
        name="Full Body 3×/Week",
        tagline="Balanced full-body for beginners",
        description=(
            "Three full-body sessions per week hitting all major muscle groups each time. "
            "Alternates between Session A and B. "
            "Great for building a solid foundation in the first 6–12 months of training."
        ),
        details=_details(
            equipment="full_gym",
            level="beginner",
            duration_weeks=8,
            days_per_week=3,
            minutes_per_workout=60,
            recommended_days=["monday", "wednesday", "friday"],
        ),
        weeks=[_week(1, [
            _day(1, "Session A", session_a),
            _day(2, "Session B", session_b),
            _day(3, "Session A", session_a),
        ])],
    )


def _gzclp() -> Template:
    """GZCLP — 4-day linear progression with T1/T2/T3 tiers."""
    day1 = [
        _lift("Squat",         5, reps=3, warmup=2),
        _lift("Military Press",3, reps=10, warmup=1),
        _lift("Lat Pulldown",  3, reps=15),
    ]
    day2 = [
        _lift("Bench Press",  5, reps=3, warmup=2),
        _lift("Deadlift",     3, reps=8, warmup=2),
        _lift("Dumbbell Row", 3, reps=15),
    ]
    day3 = [
        _lift("Squat",         6, reps=2, warmup=2),
        _lift("Military Press",3, reps=10, warmup=1),
        _lift("Lat Pulldown",  3, reps=15),
    ]
    day4 = [
        _lift("Bench Press",  6, reps=2, warmup=2),
        _lift("Deadlift",     3, reps=8, warmup=2),
        _lift("Dumbbell Row", 3, reps=15),
    ]
    return Template(
        template_id="gzclp",
        name="GZCLP",
        tagline="4-day linear progression",
        description=(
            "GZCLP classifies exercises into Tier 1 (heavy, low-rep compounds), "
            "Tier 2 (moderate compounds) and Tier 3 (high-rep accessories). "
            "Linear progression on all lifts; tier-down scheme when you miss reps. "
            "Suits those who have outgrown 3-day full-body beginner programmes."
        ),
        details=_details(
            equipment="full_gym",
            level="intermediate",
            duration_weeks=12,
            days_per_week=4,
            minutes_per_workout=60,
            recommended_days=["monday", "tuesday", "thursday", "friday"],
        ),
        weeks=[_week(1, [
            _day(1, "Day 1 — Squat / Press",   day1),
            _day(2, "Day 2 — Bench / Deadlift", day2),
            _day(3, "Day 3 — Squat / Press",    day3),
            _day(4, "Day 4 — Bench / Deadlift", day4),
        ])],
    )


def _531_bbb() -> Template:
    """5/3/1 BBB — strength + volume for intermediates."""
    press_day = [
        _lift("Military Press",      3, reps=5, warmup=2),
        _lift("Military Press",      5, reps=10),        # BBB volume
        _lift("Pull Ups",            5, reps=10),
        _lift("Dumbbell Row",        5, reps=10),
        _lift("Face Pull",           3, reps=15),
    ]
    deadlift_day = [
        _lift("Deadlift",        3, reps=5, warmup=2),
        _lift("Romanian Deadlift",5, reps=10),           # BBB volume
        _lift("Sled Leg Press",  5, reps=10),
        _lift("Lying Leg Curl",  5, reps=10),
        _lift("Machine Calf Raise", 3, reps=15),
    ]
    bench_day = [
        _lift("Bench Press",   3, reps=5, warmup=2),
        _lift("Bench Press",   5, reps=10),              # BBB volume
        _lift("Pull Ups",      5, reps=10),
        _lift("Face Pull",     5, reps=15),
        _lift("Hammer Curl",   3, reps=12),
    ]
    squat_day = [
        _lift("Squat",              3, reps=5, warmup=2),
        _lift("Squat",              5, reps=10),         # BBB volume
        _lift("Sled Leg Press",     5, reps=10),
        _lift("Lying Leg Curl",     3, reps=12),
        _lift("Machine Calf Raise", 5, reps=15),
    ]
    return Template(
        template_id="531bbb",
        name="5/3/1 BBB",
        tagline="Strength + volume for intermediates",
        description=(
            "Jim Wendler's 5/3/1 with Boring But Big accessory work. "
            "Work up to a heavy 5/3/1 top set then do 5×10 of the same lift at 50–60% 1RM. "
            "Cycles through 3-week waves with a deload week. "
            "Best for intermediates who want to build both strength and size."
        ),
        details=_details(
            equipment="full_gym",
            level="intermediate",
            duration_weeks=16,
            days_per_week=4,
            minutes_per_workout=80,
            recommended_days=["monday", "wednesday", "friday", "saturday"],
        ),
        weeks=[_week(1, [
            _day(1, "Press Day",    press_day),
            _day(2, "Deadlift Day", deadlift_day),
            _day(3, "Bench Day",    bench_day),
            _day(4, "Squat Day",    squat_day),
        ])],
    )


def _upper_lower() -> Template:
    """Upper / Lower 4-day split — good stepping stone to advanced training."""
    upper_a = [
        _lift("Bench Press",          4, reps=6, warmup=2),
        _lift("Bent Over Row",        4, reps=6, warmup=1),
        _lift("Military Press",       3, reps=8, warmup=1),
        _lift("Pull Ups",             3, reps=8),
        _lift("Dumbbell Lateral Raise",3, reps=15),
    ]
    lower_a = [
        _lift("Squat",             4, reps=6, warmup=2),
        _lift("Romanian Deadlift", 4, reps=8, warmup=1),
        _lift("Sled Leg Press",    3, reps=10),
        _lift("Lying Leg Curl",    3, reps=12),
        _lift("Machine Calf Raise",3, reps=15),
    ]
    upper_b = [
        _lift("Incline Bench Press",      4, reps=8, warmup=1),
        _lift("Seated Cable Row",         4, reps=8),
        _lift("Dumbbell Shoulder Press",  3, reps=10),
        _lift("Lat Pulldown",             3, reps=10, warmup=1),
        _lift("Hammer Curl",              3, reps=12),
        _lift("Tricep Pushdown",          3, reps=12),
    ]
    lower_b = [
        _lift("Deadlift",              4, reps=5, warmup=2),
        _lift("Bulgarian Split Squat", 3, reps=10),
        _lift("Leg Extension",         3, reps=12),
        _lift("Lying Leg Curl",        3, reps=12),
        _lift("Seated Calf Raise",     3, reps=15),
    ]
    return Template(
        template_id="upper_lower",
        name="Upper / Lower Split",
        tagline="4-day strength and hypertrophy",
        description=(
            "Splits training into two upper-body and two lower-body days per week. "
            "A days focus on strength (lower reps, heavier loads) and B days on hypertrophy. "
            "Good progression from a full-body beginner programme."
        ),
        details=_details(
            equipment="full_gym",
            level="intermediate",
            duration_weeks=8,
            days_per_week=4,
            minutes_per_workout=65,
            recommended_days=["monday", "tuesday", "thursday", "friday"],
        ),
        weeks=[_week(1, [
            _day(1, "Upper A", upper_a),
            _day(2, "Lower A", lower_a),
            _day(3, "Upper B", upper_b),
            _day(4, "Lower B", lower_b),
        ])],
    )


# ── Entry point ────────────────────────────────────────────────────────────


async def seed_templates() -> None:
    """Drop all existing templates and re-insert the current set."""
    await Template.find_all().delete()

    templates: list[Template] = [
        _stronglifts(),
        _ppl(),
        _fullbody(),
        _gzclp(),
        _531_bbb(),
        _upper_lower(),
    ]

    for t in templates:
        await t.insert()

    print(f"[seed] Templates   {len(templates)} inserted ✓")
