from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import get_current_user
from app.models.template import Template
from app.models.user import User
from app.models.workout_plan import WorkoutPlan, ProgramDetails

router = APIRouter(prefix="/api/templates", tags=["Templates"])


# ── Serializers ────────────────────────────────────────────────────────────


def _fmt_list(t: Template) -> dict:
    """Lightweight summary for the list endpoint (no weeks)."""
    total_days = sum(len(w.days) for w in t.weeks)
    return {
        "id": t.template_id,
        "name": t.name,
        "tagline": t.tagline,
        "description": t.description,
        "details": t.details.model_dump(),
        "week_count": len(t.weeks),
        "day_count": total_days,
    }


def _fmt_detail(t: Template) -> dict:
    """Full representation including weeks/days/activities."""
    return {
        "id": t.template_id,
        "name": t.name,
        "tagline": t.tagline,
        "description": t.description,
        "details": t.details.model_dump(),
        "week_count": len(t.weeks),
        "weeks": [
            {
                "week": w.week,
                "days": [
                    {
                        "day": d.day,
                        "label": d.label,
                        "activities": [a.model_dump() for a in d.activities],
                    }
                    for d in w.days
                ],
            }
            for w in t.weeks
        ],
    }


# ── Routes ─────────────────────────────────────────────────────────────────


@router.get("")
async def list_templates():
    templates = await Template.find_all().to_list()
    return [_fmt_list(t) for t in templates]


@router.get("/{template_id}")
async def get_template(template_id: str):
    t = await Template.find_one(Template.template_id == template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return _fmt_detail(t)


@router.post("/{template_id}/import")
async def import_template(template_id: str, user: User = Depends(get_current_user)):
    t = await Template.find_one(Template.template_id == template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")

    plan = WorkoutPlan(
        user_id=str(user.id),
        name=t.name,
        tagline=t.tagline,
        description=t.description,
        details=ProgramDetails(
            equipment=t.details.equipment,
            level=t.details.level,
            duration_weeks=t.details.duration_weeks,
            days_per_week=t.details.days_per_week,
            minutes_per_workout=t.details.minutes_per_workout,
            recommended_days=t.details.recommended_days,
        ),
        weeks=t.weeks,  # shallow copy — Beanie embeds them as values
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    await plan.insert()
    return {"id": str(plan.id), "name": plan.name}
