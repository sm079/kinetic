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
    # Patch the lifespan so we skip real MongoDB / Redis startup checks
    from unittest.mock import AsyncMock, patch, MagicMock
    import fakeredis.aioredis as fakeredis

    fake_redis = fakeredis.FakeRedis()

    async def fake_lifespan(app):
        from contextlib import asynccontextmanager
        # Already initialised above in reset_db
        yield

    # We need to bypass the real lifespan; easiest is to import app and replace
    # the startup events with no-ops via dependency_overrides.
    from main import app
    from app.core.redis import get_redis

    async def _fake_get_redis():
        return fake_redis

    app.dependency_overrides[get_redis] = _fake_get_redis

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.pop(get_redis, None)


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
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
