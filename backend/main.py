import os
import sys
from contextlib import asynccontextmanager

from beanie import init_beanie
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic_settings import BaseSettings
from pydantic import ValidationError

from app.core.redis import get_redis
from app.models.user import User
from app.models.workout import Workout
from app.models.workout_plan import WorkoutPlan
from app.models.conversation import Conversation
from app.models.biometric import Biometric
from app.models.nutrition import NutritionLog
from app.models.template import Template
from app.models.exercise import Exercise
from app.models.muscle import Muscle
from app.data.seed_templates import seed_templates
from app.data.seed_exercises import seed_exercises
from app.routes.auth import router as auth_router
from app.routes.users import router as users_router
from app.routes.workout import router as workout_router
from app.routes.workout_plan import router as program_router
from app.routes.conversations import router as conversations_router
from app.routes.biometrics import router as biometrics_router
from app.routes.nutrition import router as nutrition_router
from app.routes.export import router as export_router
from app.routes.templates import router as templates_router
from app.routes.exercises import router as exercises_router


# ── 1. Env vars ───────────────────────────────────────────────────────────────

try:
    from app.core.config import settings
except ValidationError as e:
    missing = [err["loc"][0] for err in e.errors() if err["type"] == "missing"]
    print("\n[startup] Missing required environment variables:")
    for var in missing:
        print(f"  • {str(var).upper()}")
    print("\nCreate a .env file in the backend/ directory with the variables above.\n")
    sys.exit(1)


# ── 2. Lifespan: MongoDB + Redis checks ──────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # MongoDB
    mongo_client = AsyncIOMotorClient(
        settings.mongodb_url,
        serverSelectionTimeoutMS=5_000,
    )
    try:
        await mongo_client.admin.command("ping")
        print("[startup] MongoDB  ✓")
    except Exception as e:
        print(f"[startup] MongoDB  ✗  {e}")
        print("          Check that MongoDB is running and MONGODB_URL is correct.")
        os._exit(1)

    app.state.mongo_client = mongo_client
    await init_beanie(database=mongo_client[settings.mongodb_db], document_models=[User, Workout, WorkoutPlan, Conversation, Biometric, NutritionLog, Template, Exercise, Muscle])
    await seed_templates()
    await seed_exercises()

    # Redis
    try:
        r = await get_redis()
        await r.ping()
        print("[startup] Redis    ✓")
    except Exception as e:
        print(f"[startup] Redis    ✗  {e}")
        print("          Check that Redis is running and REDIS_URL is correct.")
        mongo_client.close()
        os._exit(1)

    print("[startup] Server   ready\n")
    yield

    mongo_client.close()


# ── 3. App ────────────────────────────────────────────────────────────────────

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(workout_router)
app.include_router(program_router)
app.include_router(conversations_router)
app.include_router(biometrics_router)
app.include_router(nutrition_router)
app.include_router(export_router)
app.include_router(templates_router)
app.include_router(exercises_router)


# ── 4. Health endpoint ────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    results: dict[str, str] = {}

    try:
        await app.state.mongo_client.admin.command("ping")
        results["mongodb"] = "ok"
    except Exception as e:
        results["mongodb"] = f"error: {e}"

    try:
        r = await get_redis()
        await r.ping()
        results["redis"] = "ok"
    except Exception as e:
        results["redis"] = f"error: {e}"

    ok = all(v == "ok" for v in results.values())
    return {"status": "ok" if ok else "degraded", **results}
