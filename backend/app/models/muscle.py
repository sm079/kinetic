from beanie import Document
from pydantic import Field


class Muscle(Document):
    """Flat anatomy catalog — seeded from muscles_flat.json."""
    muscle_id: str          # e.g. "pectoralis_major"
    name:      str          # e.g. "Pectoralis Major"
    level:     str          # "muscle" | "sub_muscle"
    parent_id: str | None = None   # parent muscle_id for sub_muscles
    group:     str | None = None   # "Chest", "Back", …
    region:    str | None = None   # "Upper Body", "Lower Body", "Core"

    class Settings:
        name = "muscles"
