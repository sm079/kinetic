"""Tests for program (WorkoutPlan) CRUD endpoints."""

PROGRAM_PAYLOAD = {
    "name": "5/3/1 Boring But Big",
    "tagline": "Strength and size",
    "description": "Classic 5/3/1 variant",
    "details": {
        "equipment": "full_gym",
        "level": "intermediate",
        "duration_weeks": 4,
        "days_per_week": 4,
        "minutes_per_workout": 60,
        "recommended_days": ["monday", "tuesday", "thursday", "friday"],
    },
    "weeks": [
        {
            "week": 1,
            "days": [
                {
                    "day": 1,
                    "label": "Squat",
                    "activities": [
                        {
                            "type": "lift",
                            "name": "Squat",
                            "note": "",
                            "sets": [
                                {
                                    "is_warmup": False,
                                    "target_performance": {"weight_kg": 100.0, "reps": 5},
                                    "intensity": {"type": "rpe", "value": 8.0},
                                }
                            ],
                        }
                    ],
                }
            ],
        }
    ],
}


async def test_create_program(client, auth_headers):
    res = await client.post("/api/programs", json=PROGRAM_PAYLOAD, headers=auth_headers)
    assert res.status_code == 201
    body = res.json()
    assert body["name"] == "5/3/1 Boring But Big"
    assert "id" in body


async def test_list_programs(client, auth_headers):
    await client.post("/api/programs", json=PROGRAM_PAYLOAD, headers=auth_headers)
    await client.post("/api/programs", json={**PROGRAM_PAYLOAD, "name": "GZCLP"}, headers=auth_headers)
    res = await client.get("/api/programs", headers=auth_headers)
    assert res.status_code == 200
    assert len(res.json()) == 2


async def test_get_program(client, auth_headers):
    create_res = await client.post("/api/programs", json=PROGRAM_PAYLOAD, headers=auth_headers)
    prog_id = create_res.json()["id"]
    res = await client.get(f"/api/programs/{prog_id}", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["id"] == prog_id


async def test_delete_program(client, auth_headers):
    create_res = await client.post("/api/programs", json=PROGRAM_PAYLOAD, headers=auth_headers)
    prog_id = create_res.json()["id"]
    del_res = await client.delete(f"/api/programs/{prog_id}", headers=auth_headers)
    assert del_res.status_code == 200
    get_res = await client.get(f"/api/programs/{prog_id}", headers=auth_headers)
    assert get_res.status_code == 404


async def test_program_requires_auth(client):
    res = await client.get("/api/programs")
    assert res.status_code == 401
