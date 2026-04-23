import base64
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from postgrest.exceptions import APIError
from supabase import AsyncClient

from app.database import get_supabase
from app.models import UserRow
from app.services.auth import get_current_user
from app.services.athlete_profile import DEFAULT_MOBILITY_TARGET, get_effective_athlete_profile, get_manual_athlete_profile

router = APIRouter(prefix="/activities", tags=["activities"])


class ActivitySummary(BaseModel):
    id: str
    garmin_activity_id: int | None
    discipline: str
    name: str | None
    start_time: str
    duration_seconds: int | None
    calories: int | None
    distance_meters: float | None
    elevation_gain_meters: float | None
    avg_hr: int | None
    avg_pace_sec_per_km: float | None
    avg_power_watts: int | None
    tss: float | None
    total_sets: int | None
    total_volume_kg: float | None
    session_type: str | None


class ActivityDetail(ActivitySummary):
    polyline: str | None
    laps: Any
    hr_zones: Any
    exercises: Any
    primary_muscle_groups: list[str] | None
    notes: str | None
    ai_analysis: str | None


class DailyHealthSchema(BaseModel):
    id: str
    date: str
    resting_hr: int | None
    hrv_status: str | None
    hrv_last_night: float | None
    body_battery_high: int | None
    body_battery_low: int | None
    stress_avg: int | None
    sleep_score: int | None
    sleep_duration_seconds: int | None
    deep_sleep_seconds: int | None
    rem_sleep_seconds: int | None
    light_sleep_seconds: int | None
    steps: int | None


class DashboardStats(BaseModel):
    total_activities_30d: int
    total_distance_km_30d: float
    total_duration_hours_30d: float
    discipline_breakdown_30d: dict[str, int]
    avg_sleep_score_7d: float | None
    avg_hrv_7d: float | None
    recent_activities: list[ActivitySummary]


class ActivityFileMetadata(BaseModel):
    file_format: str
    content_type: str
    content_encoding: str
    file_size_bytes: int | None
    source_filename: str | None
    synced_at: str | None = None


# ── Activities ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ActivitySummary])
async def list_activities(
    discipline: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    q = sb.table("activities").select(
        "id,garmin_activity_id,discipline,name,start_time,duration_seconds,calories,"
        "distance_meters,elevation_gain_meters,avg_hr,avg_pace_sec_per_km,avg_power_watts,"
        "tss,total_sets,total_volume_kg,session_type"
    ).eq("user_id", current_user.id).order("start_time", desc=True).range(offset, offset + limit - 1)

    if discipline:
        q = q.eq("discipline", discipline.upper())

    res = await q.execute()
    return res.data or []


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()
    seven_days_ago = (date.today() - timedelta(days=7)).isoformat()

    acts_res = await sb.table("activities").select(
        "discipline,distance_meters,duration_seconds"
    ).eq("user_id", current_user.id).gte("start_time", thirty_days_ago).execute()
    acts = acts_res.data or []

    total_distance = sum((a.get("distance_meters") or 0) for a in acts) / 1000
    total_duration = sum((a.get("duration_seconds") or 0) for a in acts) / 3600
    discipline_breakdown: dict[str, int] = {}
    for a in acts:
        d = a.get("discipline", "OTHER")
        discipline_breakdown[d] = discipline_breakdown.get(d, 0) + 1

    health_res = await sb.table("daily_health").select(
        "sleep_score,hrv_last_night"
    ).eq("user_id", current_user.id).gte("date", seven_days_ago).execute()
    health_rows = health_res.data or []
    sleep_scores = [h["sleep_score"] for h in health_rows if h.get("sleep_score")]
    hrv_values = [h["hrv_last_night"] for h in health_rows if h.get("hrv_last_night")]

    recent_res = await sb.table("activities").select(
        "id,garmin_activity_id,discipline,name,start_time,duration_seconds,calories,"
        "distance_meters,elevation_gain_meters,avg_hr,avg_pace_sec_per_km,avg_power_watts,"
        "tss,total_sets,total_volume_kg,session_type"
    ).eq("user_id", current_user.id).order("start_time", desc=True).limit(5).execute()

    return DashboardStats(
        total_activities_30d=len(acts),
        total_distance_km_30d=round(total_distance, 2),
        total_duration_hours_30d=round(total_duration, 2),
        discipline_breakdown_30d=discipline_breakdown,
        avg_sleep_score_7d=round(sum(sleep_scores) / len(sleep_scores), 1) if sleep_scores else None,
        avg_hrv_7d=round(sum(hrv_values) / len(hrv_values), 1) if hrv_values else None,
        recent_activities=recent_res.data or [],
    )


@router.get("/health-data/range", response_model=list[DailyHealthSchema])
async def get_health_range(
    days: int = Query(30, ge=1, le=365),
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    since = (date.today() - timedelta(days=days)).isoformat()
    res = await sb.table("daily_health").select("*").eq("user_id", current_user.id).gte(
        "date", since
    ).order("date", desc=False).execute()
    return res.data or []


@router.get("/{activity_id}", response_model=ActivityDetail)
async def get_activity(
    activity_id: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    res = await sb.table("activities").select("*").eq("id", activity_id).eq(
        "user_id", current_user.id
    ).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    return res.data[0]


@router.get("/{activity_id}/files", response_model=list[ActivityFileMetadata])
async def list_activity_files(
    activity_id: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    try:
        res = await sb.table("activity_files").select(
            "file_format,content_type,content_encoding,file_size_bytes,source_filename,synced_at"
        ).eq("activity_id", activity_id).eq("user_id", current_user.id).order("file_format").execute()
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Activity file storage is not available until the Supabase migration is applied.",
        ) from exc
    return res.data or []


@router.get("/{activity_id}/files/{file_format}")
async def download_activity_file(
    activity_id: str,
    file_format: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    normalized_format = file_format.upper()
    try:
        res = await sb.table("activity_files").select(
            "file_format,content_type,content_encoding,file_data,source_filename"
        ).eq("activity_id", activity_id).eq("user_id", current_user.id).eq(
            "file_format", normalized_format
        ).limit(1).execute()
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Activity file storage is not available until the Supabase migration is applied.",
        ) from exc
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity file not found")

    row = res.data[0]
    content_encoding = row.get("content_encoding")
    file_data = row.get("file_data") or ""
    if content_encoding == "base64":
        content = base64.b64decode(file_data)
    else:
        content = file_data.encode("utf-8")

    filename = row.get("source_filename") or f"{activity_id}.{normalized_format.lower()}"
    return Response(
        content=content,
        media_type=row.get("content_type") or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Athlete profile ───────────────────────────────────────────────────────────

class AthleteProfileSchema(BaseModel):
    ftp_watts: int | None
    threshold_pace_sec_per_km: float | None
    swim_css_sec_per_100m: float | None
    max_hr: int | None
    resting_hr: int | None
    weight_kg: float | None
    squat_1rm_kg: float | None
    deadlift_1rm_kg: float | None
    bench_1rm_kg: float | None
    overhead_press_1rm_kg: float | None
    mobility_sessions_per_week_target: int


class AthleteProfileUpdate(BaseModel):
    ftp_watts: int | None = None
    threshold_pace_sec_per_km: float | None = None
    swim_css_sec_per_100m: float | None = None
    max_hr: int | None = None
    resting_hr: int | None = None
    weight_kg: float | None = None
    squat_1rm_kg: float | None = None
    deadlift_1rm_kg: float | None = None
    bench_1rm_kg: float | None = None
    overhead_press_1rm_kg: float | None = None
    mobility_sessions_per_week_target: int | None = None


@router.get("/profile/athlete", response_model=AthleteProfileSchema)
async def get_athlete_profile(
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    return await get_effective_athlete_profile(current_user.id, sb)


@router.put("/profile/athlete", response_model=AthleteProfileSchema)
async def update_athlete_profile(
    body: AthleteProfileUpdate,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    payload = body.model_dump(exclude_unset=True)
    if payload.get("mobility_sessions_per_week_target") is None and "mobility_sessions_per_week_target" in payload:
        payload["mobility_sessions_per_week_target"] = DEFAULT_MOBILITY_TARGET

    existing = await get_manual_athlete_profile(current_user.id, sb)
    if existing:
        await sb.table("athlete_profile").update(payload).eq("user_id", current_user.id).execute()
    else:
        await sb.table("athlete_profile").insert({"user_id": current_user.id, **payload}).execute()

    return await get_effective_athlete_profile(current_user.id, sb)
