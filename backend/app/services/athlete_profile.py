from __future__ import annotations

from datetime import datetime, timedelta, timezone
from statistics import median

from pydantic import BaseModel, Field
from supabase import AsyncClient

from app.models import ActivityRow, AthleteProfileRow, DailyHealthRow

DEFAULT_MOBILITY_TARGET = 2

PROFILE_FIELDS = (
    "ftp_watts", "threshold_pace_sec_per_km", "swim_css_sec_per_100m",
    "max_hr", "resting_hr", "weight_kg",
    "squat_1rm_kg", "deadlift_1rm_kg", "bench_1rm_kg", "overhead_press_1rm_kg",
    "mobility_sessions_per_week_target", "weekly_training_hours",
)


class EffectiveAthleteProfile(BaseModel):
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
    mobility_sessions_per_week_target: int = DEFAULT_MOBILITY_TARGET
    weekly_training_hours: float | None = None
    field_sources: dict[str, str] = Field(default_factory=dict)
    garmin_values: dict[str, float | int | None] = Field(default_factory=dict)


def _round_optional(value: float | None, digits: int = 1) -> float | None:
    return round(value, digits) if value is not None else None


def _derive_max_hr(activities: list[ActivityRow]) -> int | None:
    candidates = [a.max_hr for a in activities if a.max_hr and 120 <= a.max_hr <= 240]
    return max(candidates) if candidates else None


def _derive_resting_hr(health_rows: list[DailyHealthRow]) -> int | None:
    candidates = [h.resting_hr for h in health_rows if h.resting_hr and 30 <= h.resting_hr <= 100]
    return int(round(median(candidates))) if candidates else None


def _derive_ftp_watts(activities: list[ActivityRow]) -> int | None:
    estimates: list[float] = []
    for a in activities:
        if a.discipline not in {"RIDE_ROAD", "RIDE_GRAVEL"}:
            continue
        duration = a.duration_seconds or 0
        if duration < 20 * 60:
            continue
        power = a.normalized_power_watts or a.avg_power_watts
        if not power or power < 80 or power > 500:
            continue
        if duration < 35 * 60:
            multiplier = 0.93
        elif duration < 75 * 60:
            multiplier = 0.95
        elif duration < 150 * 60:
            multiplier = 0.90
        else:
            multiplier = 0.86
        if a.normalized_power_watts is None:
            multiplier -= 0.03
        estimates.append(power * multiplier)
    return int(round(max(estimates))) if estimates else None


def _derive_threshold_pace(activities: list[ActivityRow]) -> float | None:
    estimates: list[float] = []
    for a in activities:
        if a.discipline != "RUN":
            continue
        pace = a.avg_pace_sec_per_km
        duration = a.duration_seconds or 0
        distance = a.distance_meters or 0
        if not pace or pace < 150 or pace > 480:
            continue
        if duration < 15 * 60 or distance < 3000:
            continue
        if duration < 25 * 60:
            multiplier = 1.05
        elif duration < 50 * 60:
            multiplier = 1.03
        elif duration < 90 * 60:
            multiplier = 1.00
        else:
            multiplier = 0.98
        estimates.append(pace * multiplier)
    return _round_optional(min(estimates) if estimates else None)


def _derive_swim_css(activities: list[ActivityRow]) -> float | None:
    estimates: list[float] = []
    for a in activities:
        if a.discipline != "SWIM":
            continue
        pace_sec_per_km = a.avg_pace_sec_per_km
        distance = a.distance_meters or 0
        if not pace_sec_per_km or distance < 400:
            continue
        css = pace_sec_per_km / 10
        if css < 50 or css > 300:
            continue
        estimates.append(css * 1.03)
    return _round_optional(min(estimates) if estimates else None)


def _match_strength_field(name: str) -> str | None:
    lower = name.lower()
    if "bench press" in lower:
        return "bench_1rm_kg"
    if any(k in lower for k in ("overhead press", "military press", "strict press", "shoulder press", "push press")):
        return "overhead_press_1rm_kg"
    if "deadlift" in lower or lower == "rdl" or "romanian deadlift" in lower:
        return "deadlift_1rm_kg"
    if "squat" in lower and "jump squat" not in lower:
        return "squat_1rm_kg"
    return None


def _derive_strength_1rms(activities: list[ActivityRow]) -> dict[str, float | None]:
    estimates: dict[str, float | None] = {
        "squat_1rm_kg": None, "deadlift_1rm_kg": None,
        "bench_1rm_kg": None, "overhead_press_1rm_kg": None,
    }
    for a in activities:
        if a.discipline != "STRENGTH":
            continue
        for exercise in a.exercises or []:
            field_name = _match_strength_field(str(exercise.get("name") or ""))
            if not field_name:
                continue
            for s in exercise.get("sets") or []:
                reps = s.get("reps")
                weight = s.get("weight_kg")
                if not reps or not weight or reps < 1 or reps > 12 or weight <= 0:
                    continue
                estimate = round(weight * (1 + reps / 30), 1)
                current = estimates[field_name]
                if current is None or estimate > current:
                    estimates[field_name] = estimate
    return estimates


def merge_profile_fields(
    manual: AthleteProfileRow | None,
    derived_values: dict[str, int | float | None],
    profile_fields: tuple[str, ...] = PROFILE_FIELDS,
    default_mobility_target: int = DEFAULT_MOBILITY_TARGET,
) -> tuple[dict[str, int | float | None], dict[str, str], dict[str, int | float | None]]:
    """Merge manual, Garmin-derived, and default values.

    Returns:
        (effective_values, field_sources, garmin_values)
    """
    effective_values: dict[str, int | float | None] = {}
    field_sources: dict[str, str] = {}
    garmin_values: dict[str, int | float | None] = {}

    for field_name in profile_fields:
        manual_value = getattr(manual, field_name) if manual else None
        derived = derived_values.get(field_name)

        # garmin_values always contains the derived value regardless of overrides
        garmin_values[field_name] = derived

        if field_name == "mobility_sessions_per_week_target":
            effective_values[field_name] = manual_value if manual_value is not None else default_mobility_target
            field_sources[field_name] = "manual" if manual_value is not None else "default"
            continue

        if manual_value is not None:
            effective_values[field_name] = manual_value
            field_sources[field_name] = "manual"
        elif derived is not None:
            effective_values[field_name] = derived
            field_sources[field_name] = "garmin"
        else:
            effective_values[field_name] = None
            field_sources[field_name] = "default"

    return effective_values, field_sources, garmin_values


async def get_manual_athlete_profile(user_id: str, sb: AsyncClient) -> AthleteProfileRow | None:
    res = await sb.table("athlete_profile").select("*").eq("user_id", user_id).limit(1).execute()
    return AthleteProfileRow(**res.data[0]) if res.data else None


async def get_effective_athlete_profile(user_id: str, sb: AsyncClient) -> EffectiveAthleteProfile:
    manual = await get_manual_athlete_profile(user_id, sb)

    lookback = (datetime.now(timezone.utc) - timedelta(days=365)).isoformat()
    acts_res = await sb.table("activities").select("*").eq("user_id", user_id).gte("start_time", lookback).execute()
    activities = [ActivityRow(**r) for r in (acts_res.data or [])]

    from datetime import date
    health_since = (date.today() - timedelta(days=365)).isoformat()
    health_res = await sb.table("daily_health").select("*").eq("user_id", user_id).gte("date", health_since).execute()
    health_rows = [DailyHealthRow(**r) for r in (health_res.data or [])]

    derived_strength = _derive_strength_1rms(activities)
    derived_values: dict[str, int | float | None] = {
        "ftp_watts": _derive_ftp_watts(activities),
        "threshold_pace_sec_per_km": _derive_threshold_pace(activities),
        "swim_css_sec_per_100m": _derive_swim_css(activities),
        "max_hr": _derive_max_hr(activities),
        "resting_hr": _derive_resting_hr(health_rows),
        "weight_kg": None,
        **derived_strength,
    }

    values, field_sources, garmin_values = merge_profile_fields(manual, derived_values)

    return EffectiveAthleteProfile(**values, field_sources=field_sources, garmin_values=garmin_values)
