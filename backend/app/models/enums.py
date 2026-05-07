from enum import Enum


class FitnessGoal(str, Enum):
    muscle = "muscle"
    strength = "strength"
    fat_loss = "fat_loss"
    endurance = "endurance"
    general = "general"
    performance = "performance"


class FitnessLevel(str, Enum):
    beginner     = "beginner"
    novice       = "novice"
    intermediate = "intermediate"
    advanced     = "advanced"
    elite        = "elite"


class Equipment(str, Enum):
    full_gym = "full_gym"
    home_gym = "home_gym"
    bodyweight_only = "bodyweight_only"


class DayOfWeek(str, Enum):
    monday = "monday"
    tuesday = "tuesday"
    wednesday = "wednesday"
    thursday = "thursday"
    friday = "friday"
    saturday = "saturday"
    sunday = "sunday"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            return cls.__members__.get(value.lower())
        return None


class PreferredUnits(str, Enum):
    metric = "metric"
    imperial = "imperial"
