from beanie import Document
from pydantic import BaseModel, Field


class StandardRow(BaseModel):
    bw:    int    # bodyweight kg
    beg:   float  # beginner threshold (kg)
    nov:   float  # novice
    int_:  float  # intermediate  (aliased from "int" in JSON)
    adv:   float  # advanced
    elite: float

    model_config = {"populate_by_name": True}

    @classmethod
    def from_dict(cls, d: dict) -> "StandardRow":
        def _f(v) -> float:
            if isinstance(v, (int, float)):
                return float(v)
            s = str(v).replace("kg", "").replace(",", "").strip()
            if s.startswith("<"):
                return 0.0
            return float(s)

        return cls(bw=int(d["bw"]), beg=_f(d["beg"]), nov=_f(d["nov"]), int_=_f(d["int"]), adv=_f(d["adv"]), elite=_f(d["elite"]))


class Exercise(Document):
    """Global exercise catalog — seeded from exercises_full.json."""
    name:               str
    bodypart:           str
    category:           str
    aliases:            list[str] = Field(default_factory=list)
    icon_url:           str | None = None
    count:              int = 0
    primary_muscles:   list[str] = Field(default_factory=list)
    secondary_muscles: list[str] = Field(default_factory=list)
    standards_male:    list[StandardRow] = Field(default_factory=list)
    standards_female:  list[StandardRow] = Field(default_factory=list)

    class Settings:
        name = "exercises"

    def strength_level(self, weight_kg: float, bodyweight_kg: float, gender: str = "male") -> str | None:
        """Return 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite' | None."""
        table = self.standards_male if gender == "male" else self.standards_female
        if not table:
            return None
        # Find closest bodyweight row
        row = min(table, key=lambda r: abs(r.bw - bodyweight_kg))
        if weight_kg < row.beg:   return "beginner"
        if weight_kg < row.nov:   return "novice"
        if weight_kg < row.int_:  return "intermediate"
        if weight_kg < row.adv:   return "advanced"
        if weight_kg < row.elite: return "advanced"
        return "elite"
