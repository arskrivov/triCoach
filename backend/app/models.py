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
    garmin_type_key: str | None = None
    garmin_event_type: str | None = None
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
    total_volume_kg: float | None = None
    primary_muscle_groups: list[str] | None = None
    # Yoga/Mobility
    session_type: str | None = None
    # Training effect (aerobic/anaerobic, 0–5 scale)
    aerobic_training_effect: float | None = None
    anaerobic_training_effect: float | None = None
    training_effect_label: str | None = None


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
    vo2max_running: float | None = None
    vo2max_cycling: float | None = None


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
    weekly_training_hours: float | None = None


class GoalRow(BaseModel):
    id: str = ""
    user_id: str = ""
    description: str = ""
    target_date: str | None = None
    sport: str | None = None
    weekly_volume_km: float | None = None
    is_active: bool = True
    race_type: str | None = None
    weekly_hours_budget: float | None = None
    priority: int = 1
    created_at: str = ""


class TrainingPlanRow(BaseModel):
    id: str = ""
    user_id: str = ""
    goal_id: str | None = None
    name: str = ""
    status: str = "active"
    race_date: str | None = None
    start_date: str = ""
    end_date: str = ""
    weekly_hours: float = 0.0
    plan_structure: dict = Field(default_factory=dict)
    adjustments: list = Field(default_factory=list)
    created_at: str | None = None
    updated_at: str | None = None


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
    plan_id: str | None = None
    plan_week: int | None = None
    plan_day: int | None = None
    created_at: str = ""
    updated_at: str = ""
