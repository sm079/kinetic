"""Tests for workout CRUD endpoints."""
from datetime import datetime, timezone


WORKOUT_PAYLOAD = {
    "name": "Push Day",
    "started_at": datetime.now(timezone.utc).isoformat(),
    "completed_at": None,
    "note": "Feeling strong",
    "activities": [
        {
            "type": "lift",
            "name": "Bench Press",
            "note": "",
            "sets": [
                {
                    "is_warmup": False,
                    "target_performance": {"weight_kg": 80.0, "reps": 5},
                    "current_performance": {"weight_kg": 80.0, "reps": 5},
                    "completed": True,
                    "intensity": {"type": "rpe", "value": 8.0},
                }
            ],
        }
    ],
}


async def test_create_workout(client, auth_headers):
    res = await client.post("/api/workouts", json=WORKOUT_PAYLOAD, headers=auth_headers)
    assert res.status_code == 201
    body = res.json()
    assert body["name"] == "Push Day"
    assert "id" in body


async def test_list_workouts(client, auth_headers):
    await client.post("/api/workouts", json=WORKOUT_PAYLOAD, headers=auth_headers)
    await client.post("/api/workouts", json={**WORKOUT_PAYLOAD, "name": "Pull Day"}, headers=auth_headers)
    res = await client.get("/api/workouts", headers=auth_headers)
    assert res.status_code == 200
    assert len(res.json()) == 2


async def test_get_workout(client, auth_headers):
    create_res = await client.post("/api/workouts", json=WORKOUT_PAYLOAD, headers=auth_headers)
    workout_id = create_res.json()["id"]
    res = await client.get(f"/api/workouts/{workout_id}", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["id"] == workout_id


async def test_delete_workout(client, auth_headers):
    create_res = await client.post("/api/workouts", json=WORKOUT_PAYLOAD, headers=auth_headers)
    workout_id = create_res.json()["id"]
    del_res = await client.delete(f"/api/workouts/{workout_id}", headers=auth_headers)
    assert del_res.status_code == 204
    get_res = await client.get(f"/api/workouts/{workout_id}", headers=auth_headers)
    assert get_res.status_code == 404


async def test_workout_isolated_per_user(client):
    """Two users should not see each other's workouts."""
    user_a = {"email": "a@example.com", "display_name": "A", "password": "TestPass1!", "password_confirm": "TestPass1!"}
    user_b = {"email": "b@example.com", "display_name": "B", "password": "TestPass1!", "password_confirm": "TestPass1!"}

    tok_a = (await client.post("/api/auth/register", json=user_a)).json()["access_token"]
    tok_b = (await client.post("/api/auth/register", json=user_b)).json()["access_token"]

    headers_a = {"Authorization": f"Bearer {tok_a}"}
    headers_b = {"Authorization": f"Bearer {tok_b}"}

    await client.post("/api/workouts", json=WORKOUT_PAYLOAD, headers=headers_a)

    res_b = await client.get("/api/workouts", headers=headers_b)
    assert res_b.status_code == 200
    assert len(res_b.json()) == 0
