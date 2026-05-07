from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import get_current_user
from app.models.user import User
from app.models.biometric import Biometric
from app.schemas.biometric import BiometricCreateRequest, BiometricUpdateRequest, BiometricResponse

router = APIRouter(prefix="/api/biometrics", tags=["Biometrics"])


def _fmt(b: Biometric) -> BiometricResponse:
    return BiometricResponse(
        id=str(b.id),
        recorded_at=b.recorded_at,
        weight_kg=b.weight_kg,
        body_fat_pct=b.body_fat_pct,
        muscle_mass_kg=b.muscle_mass_kg,
        visceral_fat_level=b.visceral_fat_level,
        chest_cm=b.chest_cm,
        waist_cm=b.waist_cm,
        hips_cm=b.hips_cm,
        thigh_cm=b.thigh_cm,
        bicep_cm=b.bicep_cm,
        calf_cm=b.calf_cm,
        wellness_sleep=b.wellness_sleep,
        wellness_recovery=b.wellness_recovery,
        wellness_stress=b.wellness_stress,
        wellness_energy=b.wellness_energy,
    )


def _assert_owner(b: Biometric | None, user_id: str) -> Biometric:
    if b is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    if b.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your entry")
    return b


@router.post("", response_model=BiometricResponse, status_code=status.HTTP_201_CREATED)
async def create_biometric(body: BiometricCreateRequest, user: User = Depends(get_current_user)):
    b = Biometric(user_id=str(user.id), **body.model_dump())
    await b.insert()
    return _fmt(b)


@router.get("", response_model=list[BiometricResponse])
async def list_biometrics(skip: int = 0, limit: int = 100, user: User = Depends(get_current_user)):
    entries = (
        await Biometric.find(Biometric.user_id == str(user.id))
        .sort(-Biometric.recorded_at)
        .skip(skip)
        .limit(limit)
        .to_list()
    )
    return [_fmt(e) for e in entries]


@router.get("/latest", response_model=BiometricResponse | None)
async def get_latest(user: User = Depends(get_current_user)):
    entry = await Biometric.find(
        Biometric.user_id == str(user.id)
    ).sort(-Biometric.recorded_at).first_or_none()
    return _fmt(entry) if entry else None


_TREND_METRICS = {
    "weight_kg", "body_fat_pct", "muscle_mass_kg", "visceral_fat_level",
    "chest_cm", "waist_cm", "hips_cm", "thigh_cm", "bicep_cm", "calf_cm",
    "wellness_sleep", "wellness_recovery", "wellness_stress", "wellness_energy",
}


@router.get("/trends")
async def get_trends(metric: str = "weight_kg", days: int = 90, user: User = Depends(get_current_user)):
    """Return time-series data for a single biometric metric."""
    if metric not in _TREND_METRICS:
        raise HTTPException(status_code=400, detail=f"metric must be one of {sorted(_TREND_METRICS)}")
    query = Biometric.find(Biometric.user_id == str(user.id))
    if days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        query = query.find(Biometric.recorded_at >= cutoff)
    entries = await query.sort(Biometric.recorded_at).to_list()
    result = []
    for e in entries:
        val = getattr(e, metric, None)
        if val is not None:
            result.append({"date": e.recorded_at.date().isoformat(), "value": val})
    return result


@router.patch("/{entry_id}", response_model=BiometricResponse)
async def update_biometric(entry_id: str, body: BiometricUpdateRequest, user: User = Depends(get_current_user)):
    b = await Biometric.get(entry_id)
    _assert_owner(b, str(user.id))
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(b, field, value)
    await b.save()
    return _fmt(b)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_biometric(entry_id: str, user: User = Depends(get_current_user)):
    b = await Biometric.get(entry_id)
    _assert_owner(b, str(user.id))
    await b.delete()
