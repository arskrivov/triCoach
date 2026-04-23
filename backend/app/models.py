"""Pydantic row models — one per DB table. These replace the old SQLAlchemy ORM models."""

from typing import Any

from pydantic import BaseModel, Field


class UserRow(BaseModel):
    id: str
    email: str
    hashed_password: str | None = None
    name: str | None = None
    garmin_email: str | None = None
    garmin_session_data: str | None = None  # Fernet-encrypted, stored as text
    garmin_connected_at: str | None = None
    garmin_last_sync_at: str | None = None
    created_at: str = ""


class ActivityRow(BaseModel):
    id: str = ""
    user_id: str = ""
    garmin_activity_id: int | None = None
    discipline: str = "OTHER"
    name: str | None = None
    start_time: str = ""
    duration_seconds: int | None = None
    calories: int | None = None
    ai_analysis: str | None = None
    ai_analyzed_at: str | None = None
    # Endurance
    distance_meters: float | None = None
    elevation_gain_meters: float | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    avg_power_watts: int | None = None
    normalized_power_watts: int | None = None
    avg_pace_sec_per_km: float | None = None
    avg_cadence: int | None = None
    tss: float | None = None
    intensity_factor: float | None = None
    polyline: str | None = None
    laps: Any = None
    hr_zones: Any = None
    # Strength
    exercises: Any = None
    total_sets: int | None = None
    # Yoga/Mobility
    session_type: str | None = None


class DailyHealthRow(BaseModel):
    id: str = ""
    user_id: str = ""
    date: str = ""  # "YYYY-MM-DD"
    resting_hr: int | None = None
    hrv_status: str | None = None
    hrv_last_night: float | None = None
    body_battery_high: int | None = None
    body_battery_low: int | None = None
    stress_avg: int | None = None
    sleep_score: int | None = None
    sleep_duration_seconds: int | None = None
    deep_sleep_seconds: int | None = None
    rem_sleep_seconds: int | None = None
    light_sleep_seconds: int | None = None
    steps: int | None = None
    daily_calories: int | None = None
    respiration_avg: float | None = None
    spo2_avg: float | None = None
    morning_readiness_score: int | None = None


class DailyBriefingRow(BaseModel):
    id: str = ""
    user_id: str = ""
    briefing_date: str = ""
    data_signature: str = ""
    timezone: str | None = None
    briefing: Any = None
    created_at: str = ""
    updated_at: str = ""


class ActivityFileRow(BaseModel):
    id: str = ""
    user_id: str = ""
    activity_id: str | None = None
    garmin_activity_id: int = 0
    file_format: str = ""
    content_type: str = ""
    content_encoding: str = ""
    file_data: str = ""
    file_size_bytes: int | None = None
    source_filename: str | None = None
    created_at: str = ""
    synced_at: str = ""


class AthleteProfileRow(BaseModel):
    id: str = ""
    user_id: str = ""
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
    mobility_sessions_per_week_target: int = 2


class GoalRow(BaseModel):
    id: str = ""
    user_id: str = ""
    description: str = ""
    target_date: str | None = None
    sport: str | None = None
    weekly_volume_km: float | None = None
    is_active: bool = True
    created_at: str = ""


class CoachConversationRow(BaseModel):
    id: str = ""
    user_id: str = ""
    messages: list = Field(default_factory=list)
    updated_at: str = ""


class WorkoutRow(BaseModel):
    id: str = ""
    user_id: str = ""
    name: str = ""
    discipline: str = ""
    builder_type: str = ""
    description: str | None = None
    content: Any = Field(default_factory=dict)
    estimated_duration_seconds: int | None = None
    estimated_tss: float | None = None
    estimated_volume_kg: float | None = None
    garmin_workout_id: int | None = None
    is_template: bool = False
    scheduled_date: str | None = None
    created_at: str = ""
    updated_at: str = ""


class ExerciseRow(BaseModel):
    id: str = ""
    user_id: str | None = None
    name: str = ""
    muscle_groups: list[str] | None = None
    equipment: str | None = None
    is_custom: bool = False


class RouteRow(BaseModel):
    id: str = ""
    user_id: str = ""
    name: str = ""
    sport: str = ""
    start_lat: float = 0.0
    start_lng: float = 0.0
    end_lat: float | None = None
    end_lng: float | None = None
    is_loop: bool = True
    distance_meters: float | None = None
    elevation_gain_meters: float | None = None
    elevation_loss_meters: float | None = None
    estimated_duration_seconds: int | None = None
    geojson: Any = None
    gpx_data: str | None = None
    surface_breakdown: Any = None
    created_at: str = ""
