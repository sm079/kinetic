#!/usr/bin/env python3
"""
seed_user.py — seed a consistent test user with training history,
nutrition logs, and biometric entries for Kinetic.

Usage:
    python seed_user.py [OPTIONS]

Options:
    --email       EMAIL              (default: test@kinetic.dev)
    --password    PASSWORD           (default: Test1234!)
    --name        DISPLAY_NAME       (default: "Alex Carter")
    --level       beginner|intermediate|advanced   (default: intermediate)
    --weeks       NUMBER_OF_WEEKS    (default: 16)
    --mongo-url   MONGODB_URL        (default: mongodb://localhost:27017)
    --db          DATABASE_NAME      (default: app)
    --delete      delete existing user with same email before creating

Example:
    python seed_user.py --level advanced --weeks 24 --delete
"""

import argparse
import asyncio
import random
import sys
from datetime import datetime, timezone, timedelta

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── helpers ────────────────────────────────────────────────────────────────

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def oid() -> ObjectId:
    return ObjectId()


# ── exercise library ───────────────────────────────────────────────────────

# name → (bodypart, category, (beginner_kg, intermediate_kg, advanced_kg))
# 0 kg = bodyweight exercise
EXERCISES = {
    "Bench Press":            ("Chest",     "Barbell",    (40,  80,  120)),
    "Incline Bench Press":    ("Chest",     "Barbell",    (35,  65,  100)),
    "Dumbbell Bench Press":   ("Chest",     "Dumbbell",   (16,  32,   48)),
    "Cable Fly":              ("Chest",     "Cable",      (10,  18,   27)),
    "Deadlift":               ("Back",      "Barbell",    (60, 120,  180)),
    "Bent Over Row":          ("Back",      "Barbell",    (40,  80,  120)),
    "Pull Ups":               ("Back",      "Bodyweight", ( 0,   0,    0)),
    "Seated Cable Row":       ("Back",      "Cable",      (35,  65,   90)),
    "Lat Pulldown":           ("Back",      "Cable",      (40,  65,   90)),
    "Military Press":         ("Shoulders", "Barbell",    (30,  60,   90)),
    "Dumbbell Lateral Raise": ("Shoulders", "Dumbbell",   ( 6,  14,   22)),
    "Face Pull":              ("Shoulders", "Cable",      (15,  25,   35)),
    "Squat":                  ("Legs",      "Barbell",    (50, 100,  160)),
    "Romanian Deadlift":      ("Legs",      "Barbell",    (40,  80,  120)),
    "Sled Leg Press":         ("Legs",      "Machine",    (80, 160,  240)),
    "Lying Leg Curl":         ("Legs",      "Machine",    (25,  50,   70)),
    "Leg Extension":          ("Legs",      "Machine",    (30,  55,   75)),
    "Bulgarian Split Squat":  ("Legs",      "Dumbbell",   (12,  24,   36)),
    "Barbell Curl":           ("Biceps",    "Barbell",    (20,  40,   60)),
    "Dumbbell Curl":          ("Biceps",    "Dumbbell",   (10,  18,   26)),
    "Tricep Pushdown":        ("Triceps",   "Cable",      (15,  30,   45)),
    "Lying Tricep Extension":          ("Triceps",   "Barbell",    (20,  35,   50)),
    "Cable Crunch":           ("Core",      "Cable",      (20,  40,   60)),
}

SPLITS = {
    "beginner": [
        {"name": "Full Body A",
         "exercises": ["Squat", "Bench Press", "Bent Over Row", "Military Press", "Dumbbell Curl"]},
        {"name": "Full Body B",
         "exercises": ["Deadlift", "Incline Bench Press", "Lat Pulldown", "Dumbbell Lateral Raise", "Tricep Pushdown"]},
    ],
    "intermediate": [
        {"name": "Upper A",
         "exercises": ["Bench Press", "Bent Over Row", "Military Press", "Dumbbell Curl", "Tricep Pushdown"]},
        {"name": "Lower A",
         "exercises": ["Squat", "Romanian Deadlift", "Sled Leg Press", "Lying Leg Curl"]},
        {"name": "Upper B",
         "exercises": ["Incline Bench Press", "Seated Cable Row", "Dumbbell Lateral Raise", "Barbell Curl", "Lying Tricep Extension"]},
        {"name": "Lower B",
         "exercises": ["Deadlift", "Bulgarian Split Squat", "Leg Extension", "Cable Crunch"]},
    ],
    "advanced": [
        {"name": "Push",
         "exercises": ["Bench Press", "Incline Bench Press", "Military Press", "Dumbbell Lateral Raise", "Cable Fly"]},
        {"name": "Pull",
         "exercises": ["Deadlift", "Bent Over Row", "Pull Ups", "Seated Cable Row", "Face Pull", "Dumbbell Curl"]},
        {"name": "Legs",
         "exercises": ["Squat", "Romanian Deadlift", "Sled Leg Press", "Lying Leg Curl", "Leg Extension"]},
        {"name": "Push (light)",
         "exercises": ["Dumbbell Bench Press", "Incline Bench Press", "Military Press", "Dumbbell Lateral Raise", "Tricep Pushdown"]},
        {"name": "Pull (light)",
         "exercises": ["Bent Over Row", "Lat Pulldown", "Seated Cable Row", "Barbell Curl", "Face Pull"]},
        {"name": "Legs (light)",
         "exercises": ["Squat", "Bulgarian Split Squat", "Sled Leg Press", "Lying Leg Curl", "Cable Crunch"]},
    ],
}

DAYS_PER_WEEK = {"beginner": 3, "intermediate": 4, "advanced": 6}

SET_SCHEMES = {
    "beginner":     {"sets": 3, "reps": (8, 12)},
    "intermediate": {"sets": 4, "reps": (6, 12)},
    "advanced":     {"sets": 4, "reps": (4, 10)},
}

PROGRESSION_RATE = {
    "beginner":     0.025,   # ~2.5 % per week
    "intermediate": 0.010,   # ~1.0 %
    "advanced":     0.005,   # ~0.5 %
}


# ── deterministic weight curves ────────────────────────────────────────────

def precompute_weights(level: str, total_weeks: int) -> dict[str, list[float]]:
    """Pre-compute a deterministic weight progression for each exercise.

    Each exercise gets its own seeded RNG so:
    - The same exercise always produces the same curve at the same level.
    - Calling weight_for(exercise, week) twice always returns the same value.
    - The curve smoothly increases week-over-week with a deload every 4th week.
    """
    rate = PROGRESSION_RATE[level]
    level_idx = ["beginner", "intermediate", "advanced"].index(level)

    curves: dict[str, list[float]] = {}
    for name, (_, _, base_weights) in EXERCISES.items():
        base = base_weights[level_idx]
        if base == 0:
            curves[name] = [0.0] * (total_weeks + 1)
            continue

        rng = random.Random(name)          # seeded on exercise name — reproducible
        curve = [float(base)]
        for wk in range(1, total_weeks + 1):
            prev = curve[-1]
            if wk % 4 == 0:               # deload every 4th week
                curve.append(round(prev * 0.90, 2))
            else:
                gain = rate * rng.uniform(0.6, 1.4)
                curve.append(round(prev * (1 + gain), 2))
        curves[name] = curve

    return curves


# ── workout builder ────────────────────────────────────────────────────────

def build_set(weight_kg: float, reps: int, is_warmup: bool,
              rng: random.Random) -> dict:
    noise = rng.gauss(0, max(weight_kg * 0.01, 0.1))
    actual_w = max(0.0, round(weight_kg + noise, 2))
    actual_r = max(1, reps + rng.randint(-1, 1))
    if rng.random() < 0.04:              # occasional missed rep
        actual_r = max(1, actual_r - 1)
    return {
        "is_warmup": is_warmup,
        "target_performance": {
            "weight_kg": round(weight_kg, 2),
            "reps": reps,
            "intensity": {"type": "rir", "value": 2},
        },
        "current_performance": {
            "weight_kg": actual_w,
            "reps": actual_r,
            "intensity": None,
        },
        "completed": True,
    }

def build_lift(name: str, weight_kg: float, level: str,
               rng: random.Random) -> dict:
    scheme = SET_SCHEMES[level]
    rlo, rhi = scheme["reps"]
    target_reps = rng.randint(rlo, rhi)
    sets = []
    if weight_kg > 0:
        sets.append(build_set(round(weight_kg * 0.6, 2), target_reps + 4,
                               is_warmup=True, rng=rng))
    for _ in range(scheme["sets"]):
        sets.append(build_set(weight_kg, target_reps, is_warmup=False, rng=rng))
    return {"type": "lift", "name": name, "note": None, "sets": sets}

def workout_note(week: int, rng: random.Random) -> str | None:
    if week > 0 and week % 4 == 0:
        return rng.choice(["Deload — keeping it light", "Deload week", "Easy session"])
    return rng.choice([None, None, None, "Felt strong today", "Tough session",
                       "Good pump", "Solid work"])

def build_workout(template: dict, user_id: ObjectId, level: str, week: int,
                  ts: datetime, ex_weights: dict[str, list[float]]) -> dict:
    # Seed per (user, template, week) so every field is reproducible
    rng = random.Random(f"{user_id}-{template['name']}-w{week}")
    duration_mins = rng.randint(45, 85)
    activities = []

    for ex_name in template["exercises"]:
        w_kg = ex_weights[ex_name][week]
        if w_kg == 0:
            scheme = SET_SCHEMES[level]
            rlo, rhi = scheme["reps"]
            sets = [build_set(0, rng.randint(rlo, rhi), is_warmup=False, rng=rng)
                    for _ in range(scheme["sets"])]
            activities.append({"type": "lift", "name": ex_name, "note": None, "sets": sets})
        else:
            activities.append(build_lift(ex_name, w_kg, level, rng))

    # Light cardio finisher ~15 % of sessions
    if rng.random() < 0.15:
        dist = round(rng.uniform(2500, 5000))
        dur  = int(dist / rng.uniform(2.2, 3.0))
        activities.append({
            "type": "cardio",
            "name": "Treadmill Run",
            "note": None,
            "distance_meters": float(dist),
            "duration_seconds": dur,
            "intensity": {"type": "rpe", "value": rng.choice([6.0, 6.5, 7.0])},
        })

    return {
        "_id": oid(),
        "user_id": str(user_id),
        "name": template["name"],
        "note": workout_note(week, rng),
        "started_at": ts,
        "completed_at": ts + timedelta(minutes=duration_mins),
        "activities": activities,
        "updated_at": ts,
        "program_id": None,
        "program_week": None,
        "program_day": None,
        "program_day_label": None,
    }


# ── workout schedule ───────────────────────────────────────────────────────

def generate_schedule(level: str, total_weeks: int) -> list[tuple[datetime, dict, int]]:
    days_per_week = DAYS_PER_WEEK[level]
    templates = SPLITS[level]

    if days_per_week <= 3:
        training_days = [0, 2, 4][:days_per_week]
    elif days_per_week == 4:
        training_days = [0, 1, 3, 4]
    elif days_per_week == 5:
        training_days = [0, 1, 2, 4, 5]
    else:
        training_days = [0, 1, 2, 3, 4, 5]

    rng = random.Random(42)              # fixed seed — same schedule every run
    schedule: list[tuple[datetime, dict, int]] = []
    template_idx = 0
    start_date = now_utc() - timedelta(weeks=total_weeks)

    for week in range(total_weeks):
        week_start = start_date + timedelta(weeks=week)
        monday = week_start - timedelta(days=week_start.weekday())

        for wd in training_days:
            day_dt = monday + timedelta(days=wd)
            hour   = rng.choice([6, 7, 8, 12, 17, 18, 19, 20])
            minute = rng.choice([0, 15, 30, 45])
            day_dt = day_dt.replace(hour=hour, minute=minute, second=0,
                                    microsecond=0, tzinfo=timezone.utc)

            if day_dt >= now_utc() - timedelta(hours=2):
                continue
            if rng.random() < 0.08:      # skip ~8 % of sessions
                continue

            tmpl = templates[template_idx % len(templates)]
            template_idx += 1
            schedule.append((day_dt, tmpl, week))

    return schedule


# ── nutrition ──────────────────────────────────────────────────────────────

NUTRITION_TARGETS = {
    "beginner":     {"cal": 2400, "protein": 140, "carbs": 270, "fat": 75},
    "intermediate": {"cal": 2800, "protein": 175, "carbs": 315, "fat": 88},
    "advanced":     {"cal": 3200, "protein": 210, "carbs": 370, "fat": 100},
}

# (name, calories, protein_g, carbs_g, fat_g)
MEAL_OPTIONS: dict[str, list[tuple]] = {
    "Breakfast": [
        ("Oats with Whey",         390, 34, 54,  7),
        ("Eggs & Toast",           370, 27, 38, 14),
        ("Greek Yogurt & Fruit",   310, 24, 44,  5),
        ("Protein Pancakes",       440, 38, 48, 10),
        ("Scrambled Eggs & Rice",  400, 30, 48, 11),
    ],
    "Lunch": [
        ("Chicken Rice Bowl",      640, 52, 68, 15),
        ("Tuna Wrap",              510, 44, 54, 12),
        ("Beef & Potato",          690, 54, 63, 18),
        ("Salmon & Quinoa",        590, 49, 57, 16),
        ("Turkey Sandwich",        560, 46, 60, 14),
    ],
    "Dinner": [
        ("Steak & Vegetables",     680, 56, 28, 27),
        ("Chicken Pasta",          740, 54, 78, 17),
        ("Turkey Bolognese",       670, 51, 70, 19),
        ("Salmon & Sweet Potato",  640, 47, 59, 21),
        ("Lean Beef Stir Fry",     700, 52, 65, 22),
    ],
    "Pre-workout": [
        ("Banana & Peanut Butter", 275,  8, 41, 12),
        ("Rice Cakes & Honey",     215,  4, 50,  2),
        ("Apple & Almond Butter",  230,  6, 35, 10),
    ],
    "Post-workout": [
        ("Whey Protein Shake",     195, 30,  7,  3),
        ("Whey & Banana",          315, 31, 39,  4),
        ("Chocolate Milk",         280, 18, 42,  6),
    ],
    "Snack": [
        ("Cottage Cheese",         175, 22,  9,  4),
        ("Mixed Nuts",             195,  6,  7, 17),
        ("Protein Bar",            215, 20, 24,  8),
        ("Rice Cakes & Tuna",      180, 22, 18,  2),
    ],
}

def build_food_item(name: str, cal: float, pro: float, carbs: float, fat: float,
                    rng: random.Random, noise: float = 0.08) -> dict:
    n = rng.uniform(1 - noise, 1 + noise)
    return {
        "name": name,
        "calories":  round(cal   * n, 1),
        "protein_g": round(pro   * n, 1),
        "carbs_g":   round(carbs * n, 1),
        "fat_g":     round(fat   * n, 1),
        "quantity_g": None,
    }

def build_nutrition_log(user_id: ObjectId, date_str: str, level: str,
                        is_training_day: bool, rng: random.Random) -> dict:
    targets = NUTRITION_TARGETS[level]
    meals_out = []

    for meal_name in ["Breakfast", "Lunch", "Dinner"]:
        row = rng.choice(MEAL_OPTIONS[meal_name])
        meals_out.append({
            "name": meal_name,
            "time": None,
            "items": [build_food_item(*row, rng=rng)],
        })

    if is_training_day:
        for slot in ["Pre-workout", "Post-workout"]:
            row = rng.choice(MEAL_OPTIONS[slot])
            meals_out.append({"name": slot, "time": None,
                              "items": [build_food_item(*row, rng=rng)]})

    if rng.random() < 0.65:
        row = rng.choice(MEAL_OPTIONS["Snack"])
        meals_out.append({"name": "Snack", "time": None,
                          "items": [build_food_item(*row, rng=rng)]})

    if rng.random() < 0.08:
        meals_out.append({
            "name": "Cheat Meal",
            "time": None,
            "items": [{
                "name": rng.choice(["Pizza", "Burger & Fries", "Ice Cream", "Takeout"]),
                "calories":  round(rng.uniform(600, 1100), 1),
                "protein_g": round(rng.uniform(20,   40),  1),
                "carbs_g":   round(rng.uniform(70,  120),  1),
                "fat_g":     round(rng.uniform(25,   50),  1),
                "quantity_g": None,
            }],
        })

    return {
        "_id": oid(),
        "user_id": str(user_id),
        "date": date_str,
        "meals": meals_out,
        "calorie_goal":   targets["cal"],
        "protein_goal_g": targets["protein"],
        "carbs_goal_g":   targets["carbs"],
        "fat_goal_g":     targets["fat"],
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }


# ── biometrics ─────────────────────────────────────────────────────────────

# (weight_kg, body_fat_pct, muscle_mass_kg, visceral_fat,
#  chest_cm, waist_cm, hips_cm, thigh_cm, bicep_cm, calf_cm)
BIO_START = {
    "beginner":     (85.0, 22.0, 38.0, 8,  98,  90, 98, 57, 35, 37),
    "intermediate": (82.0, 17.0, 41.0, 7, 102,  84, 96, 58, 37, 38),
    "advanced":     (88.0, 12.0, 47.0, 5, 108,  80, 97, 60, 41, 40),
}

# Per-week trend: weight_kg, body_fat_pct, muscle_mass_kg, waist_cm
BIO_DELTA = {
    "beginner":     (-0.15, -0.12, +0.08, -0.20),
    "intermediate": (-0.08, -0.06, +0.05, -0.10),
    "advanced":     (-0.03, -0.02, +0.03, -0.05),
}

def build_biometric(user_id: ObjectId, week: int, total_weeks: int,
                    level: str, ts: datetime) -> dict:
    sw, sbf, sm, sv, sc, swa, sh, sth, sbi, sca = BIO_START[level]
    dw, dbf, dm, dwaist = BIO_DELTA[level]

    # Per-entry seeded RNG — reproducible noise
    rng = random.Random(f"bio-{user_id}-w{week}")

    weight = clamp(round(sw  + dw  * week + rng.gauss(0, 0.2),  2), 50.0, 200.0)
    bf     = clamp(round(sbf + dbf * week + rng.gauss(0, 0.15), 2),  5.0,  40.0)
    muscle = clamp(round(sm  + dm  * week + rng.gauss(0, 0.1),  2), 20.0,  80.0)
    visc   = clamp(sv - week // 6, 2, 15)

    waist  = round(swa + dwaist * week + rng.gauss(0, 0.3),  1)
    chest  = round(sc  + 0.05   * week + rng.gauss(0, 0.2),  1)
    hips   = round(sh  - 0.04   * week + rng.gauss(0, 0.2),  1)
    thigh  = round(sth + 0.03   * week + rng.gauss(0, 0.15), 1)
    bicep  = round(sbi + 0.05   * week + rng.gauss(0, 0.15), 1)
    calf   = round(sca + 0.02   * week + rng.gauss(0, 0.15), 1)

    # Wellness trends upward as the user adapts; deload weeks feel better
    progress  = week / max(total_weeks, 1)           # 0 → 1 over the training block
    is_deload = week > 0 and week % 4 == 0
    well_mod  = +1 if is_deload else rng.choice([-1, 0, 0, 1])

    sleep    = clamp(round(5.5 + progress * 2.5) + well_mod + rng.randint(-1, 1), 1, 10)
    recovery = clamp(round(5.0 + progress * 3.0) + well_mod + rng.randint(-1, 1), 1, 10)
    stress   = clamp(round(6.5 - progress * 2.5) - well_mod + rng.randint(-1, 1), 1, 10)
    energy   = clamp(round(5.5 + progress * 2.5) + well_mod + rng.randint(-1, 1), 1, 10)

    return {
        "_id": oid(),
        "user_id": str(user_id),
        "recorded_at": ts,
        "weight_kg":          weight,
        "body_fat_pct":       bf,
        "muscle_mass_kg":     muscle,
        "visceral_fat_level": visc,
        "chest_cm":  chest,
        "waist_cm":  waist,
        "hips_cm":   hips,
        "thigh_cm":  thigh,
        "bicep_cm":  bicep,
        "calf_cm":   calf,
        "wellness_sleep":    sleep,
        "wellness_recovery": recovery,
        "wellness_stress":   stress,
        "wellness_energy":   energy,
    }


# ── main ───────────────────────────────────────────────────────────────────

async def run(args):
    level     = args.level
    weeks     = args.weeks
    email     = args.email
    password  = args.password
    name      = args.name or "Alex Carter"
    mongo_url = args.mongo_url
    db_name   = args.db

    print(f"\n{'='*56}")
    print(f"  Kinetic — seed_user.py")
    print(f"{'='*56}")
    print(f"  Name     : {name}")
    print(f"  Level    : {level}")
    print(f"  Duration : {weeks} weeks")
    print(f"  Email    : {email}")
    print(f"  DB       : {mongo_url} / {db_name}")
    print(f"{'='*56}\n")

    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5_000)
    db = client[db_name]

    try:
        await client.admin.command("ping")
        print("[OK] Connected to MongoDB")
    except Exception as e:
        print(f"[FAIL] MongoDB: {e}")
        sys.exit(1)

    if args.delete:
        existing = await db.users.find_one({"email": email})
        if existing:
            uid = str(existing["_id"])
            await db.users.delete_one({"_id": existing["_id"]})
            await db.workouts.delete_many({"user_id": uid})
            await db.nutrition_logs.delete_many({"user_id": uid})
            await db.biometrics.delete_many({"user_id": uid})
            print(f"[OK] Deleted existing user {email}")

    if await db.users.find_one({"email": email}):
        print(f"[FAIL] {email} already exists — use --delete to remove first")
        sys.exit(1)

    # ── User ──────────────────────────────────────────────────────────────
    user_id = oid()
    await db.users.insert_one({
        "_id": user_id,
        "display_name": name,
        "email": email,
        "password_hash": pwd_ctx.hash(password),
        "is_active": True,
        "tokens_invalidated_at": None,
        "notifications_enabled": True,
        "preferred_units": "metric",
        "onboarding_completed": True,
        "fitness_goal": {"beginner": "general", "intermediate": "muscle", "advanced": "strength"}[level],
        "fitness_level": level,
        "preferred_equipment": "full_gym",
        "days_per_week": DAYS_PER_WEEK[level],
        "preferred_days": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][:DAYS_PER_WEEK[level]],
        "created_at": now_utc() - timedelta(weeks=weeks),
        "updated_at": now_utc(),
    })
    print(f"[OK] Created user : {email}  ({name})")

    # ── Pre-compute exercise weights ─────────────────────────────────────
    ex_weights = precompute_weights(level, weeks)

    # ── Workouts ─────────────────────────────────────────────────────────
    schedule = generate_schedule(level, weeks)
    print(f"  Generating {len(schedule)} workouts over {weeks} weeks…")

    training_dates: set[str] = set()
    workout_docs = []
    for ts, template, week in schedule:
        doc = build_workout(template, user_id, level, week, ts, ex_weights)
        workout_docs.append(doc)
        training_dates.add(ts.date().isoformat())

    if workout_docs:
        await db.workouts.insert_many(workout_docs)
    print(f"[OK] Inserted {len(workout_docs)} workouts")

    # ── Nutrition ────────────────────────────────────────────────────────
    print("  Generating nutrition logs…")
    rng_nut = random.Random(42)
    start_date = (now_utc() - timedelta(weeks=weeks)).date()
    nutrition_docs = []
    d = start_date
    while d <= now_utc().date():
        if rng_nut.random() < 0.85:      # ~85 % daily compliance
            date_str = d.isoformat()
            nutrition_docs.append(
                build_nutrition_log(user_id, date_str, level,
                                    date_str in training_dates, rng_nut)
            )
        d += timedelta(days=1)

    if nutrition_docs:
        await db.nutrition_logs.insert_many(nutrition_docs)
    print(f"[OK] Inserted {len(nutrition_docs)} nutrition logs")

    # ── Biometrics ───────────────────────────────────────────────────────
    print("  Generating biometric entries…")
    rng_bio = random.Random(99)
    bio_docs = []
    for week in range(weeks + 1):
        jitter = timedelta(minutes=rng_bio.randint(-120, 120))
        ts = now_utc() - timedelta(days=(weeks - week) * 7) + jitter
        if ts >= now_utc():
            ts = now_utc() - timedelta(hours=1)
        bio_docs.append(build_biometric(user_id, week, weeks, level, ts))

    if bio_docs:
        await db.biometrics.insert_many(bio_docs)
    print(f"[OK] Inserted {len(bio_docs)} biometric entries")

    client.close()

    print(f"\n{'='*56}")
    print(f"  Done!")
    print(f"    Email    : {email}")
    print(f"    Password : {password}")
    print(f"{'='*56}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Seed a test Kinetic user with consistent training data."
    )
    parser.add_argument("--email",     default="test@kinetic.dev",         help="User email")
    parser.add_argument("--password",  default="Test1234!",                help="User password")
    parser.add_argument("--name",      default=None,                       help='Display name (default: "Alex Carter")')
    parser.add_argument("--level",     default="intermediate",
                        choices=["beginner", "intermediate", "advanced"],   help="Fitness level")
    parser.add_argument("--weeks",     default=16, type=int,               help="Weeks of history to generate (1–104)")
    parser.add_argument("--mongo-url", default="mongodb://localhost:27017", help="MongoDB connection URL")
    parser.add_argument("--db",        default="fitnessapp",               help="Database name")
    parser.add_argument("--delete",    action="store_true",                help="Delete existing user first")
    args = parser.parse_args()

    if not (1 <= args.weeks <= 104):
        print("--weeks must be between 1 and 104")
        sys.exit(1)

    asyncio.run(run(args))


if __name__ == "__main__":
    main()
