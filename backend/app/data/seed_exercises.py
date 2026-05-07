"""
Seed exercises + muscles collections.
Always drops and re-inserts so cardio exercises and catalog updates are picked up.
Source: backend/app/data/exercises_full.json  +  muscles_flat.json
"""
from __future__ import annotations

import json
from pathlib import Path

from app.models.exercise import Exercise, StandardRow
from app.models.muscle import Muscle

_DATA_DIR = Path(__file__).parent

_EX_PATH  = _DATA_DIR / "exercises_full.json"
_MUS_PATH = _DATA_DIR / "muscles_flat.json"


async def seed_exercises() -> None:
    await _seed_muscles()
    await _seed_exercise_catalog()


async def _seed_muscles() -> None:
    await Muscle.find_all().delete()

    raw = json.loads(_MUS_PATH.read_text(encoding="utf-8"))
    docs = [
        Muscle(
            muscle_id=m["muscle_id"],
            name=m["name"],
            level=m["level"],
            parent_id=m.get("parent_id"),
            group=m.get("group"),
            region=m.get("region"),
        )
        for m in raw["data"]
    ]
    await Muscle.insert_many(docs)
    print(f"[seed] Muscles     {len(docs)} inserted ✓")


async def _seed_exercise_catalog() -> None:
    await Exercise.find_all().delete()

    raw = json.loads(_EX_PATH.read_text(encoding="utf-8"))

    docs = []
    for e in raw["data"]:
        docs.append(Exercise(
            name=e["name"],
            bodypart=e.get("bodypart", ""),
            category=e.get("category", ""),
            aliases=e.get("aliases", []),
            icon_url=e.get("icon_url"),
            count=e.get("count", 0),
            primary_muscles=e.get("primary_muscles", []),
            secondary_muscles=e.get("secondary_muscles", []),
            standards_male=[StandardRow.from_dict(r) for r in e.get("standards_male", [])],
            standards_female=[StandardRow.from_dict(r) for r in e.get("standards_female", [])],
        ))

    await Exercise.insert_many(docs)
    print(f"[seed] Exercises   {len(docs)} inserted ✓")
