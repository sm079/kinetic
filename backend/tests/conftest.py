"""
Test fixtures — uses mongomock-motor for an in-process fake MongoDB
so no real server is needed.
"""
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017")
os.environ.setdefault("MONGODB_DB",  "kinetic_test")
os.environ.setdefault("JWT_SECRET",  "test-secret-not-for-production")
os.environ.setdefault("REDIS_URL",   "redis://localhost:6379")

from beanie import init_beanie
from mongomock_motor import AsyncMongoMockClient

from app.models.user import User
from app.models.workout import Workout
from app.models.workout_plan import WorkoutPlan
from app.models.conversation import Conversation
from app.models.biometric import Biometric
from app.models.nutrition import NutritionLog

ALL_MODELS = [User, Workout, WorkoutPlan, Conversation, Biometric, NutritionLog]


@pytest_asyncio.fixture(autouse=True)
async def reset_db():
    """Initialise Beanie with a fresh mongomock database for every test."""
    client = AsyncMongoMockClient()
    await init_beanie(database=client["kinetic_test"], document_models=ALL_MODELS)
    yield
    # mongomock keeps state in-process; clear collections after each test
    for model in ALL_MODELS:
        await model.delete_all()


@pytest_asyncio.fixture
async def client(reset_db):
    """HTTPX async client wired to the FastAPI app via ASGITransport."""
    # ASGITransport skips the lifespan, so the real MongoDB / Redis startup
    # checks never run. get_redis() is called directly rather than through
    # Depends, so swap the cached client instead of using dependency_overrides.
    import fakeredis.aioredis as fakeredis
    from app.core import redis as redis_module
    from main import app

    redis_module._client = fakeredis.FakeRedis(decode_responses=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    redis_module._client = None


@pytest_asyncio.fixture
async def auth_headers(client):
    """Register a test user and return Authorization headers."""
    payload = {
        "email": "test@example.com",
        "display_name": "Test User",
        "password": "TestPass1!",
        "password_confirm": "TestPass1!",
    }
    res = await client.post("/api/auth/register", json=payload)
    assert res.status_code == 201, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
