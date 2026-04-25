from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from statistics import median

from pydantic import BaseModel, Field
from supabase import AsyncClient

from app.models import ActivityRow, AthleteProfileRow, DailyHealthRow

logger = logging.getLogger(__name__)

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


def _estimate_ftp_from_vo2max(vo2max_cycling: float, weight_kg: float) -> int | None:
    """Estimate cycling FTP from VO2max using empirical formula.
    
    Formula: FTP (W/kg) ≈ (VO2max - 10.8) / 12.5
    This is based on the relationship between VO2max and sustainable power output.
    
    Args:
        vo2max_cycling: Cycling VO2max in ml/kg/min
        weight_kg: Body weight in kg
    
    Returns:
        Estimated FTP in watts, or None if inputs are invalid
    """
    if not vo2max_cycling or not weight_kg:
        return None
    if vo2max_cycling < 20 or vo2max_cycling > 90:  # Reasonable VO2max range
        return None
    if weight_kg < 30 or weight_kg > 200:
        return None
    
    ftp_wkg = (vo2max_cycling - 10.8) / 12.5
    if ftp_wkg < 1.0 or ftp_wkg > 7.0:  # Reasonable W/kg range
        return None
    
    return int(round(ftp_wkg * weight_kg))


async def _fetch_garmin_profile_values(user_id: str, sb: AsyncClient) -> dict[str, int | float | None]:
    """Fetch athlete profile values directly from Garmin user settings.
    
    This fetches:
    - max_hr, resting_hr from /biometric-service/heartRateZones
    - threshold_pace_sec_per_km from /biometric-service/lactateThreshold (speed field)
    - ftp_watts from /biometric-service/lactateThreshold (cycling FTP if available),
      or estimated from VO2max cycling if no direct FTP is available
    - weight_kg from user profile or lactate threshold
    
    Returns a dict with Garmin profile values, or empty dict if Garmin is not connected.
    """
    try:
        from app.services.garmin import get_garmin_client
        client = await get_garmin_client(user_id, sb)
    except Exception as e:
        logger.debug("Could not get Garmin client for user %s: %s", user_id, e)
        return {}
    
    values: dict[str, int | float | None] = {}
    vo2max_cycling: float | None = None
    weight_kg: float | None = None
    
    # Fetch user profile for VO2max and weight
    try:
        profile = client.get_user_profile()
        user_data = profile.get('userData', {}) if profile else {}
        
        vo2max_cycling = user_data.get('vo2MaxCycling')
        
        # Weight is stored in grams in user profile
        weight_g = user_data.get('weight')
        if weight_g and 30000 <= weight_g <= 200000:
            weight_kg = weight_g / 1000
            values['weight_kg'] = round(weight_kg, 1)
    except Exception as e:
        logger.debug("Could not fetch user profile from Garmin for user %s: %s", user_id, e)
    
    # Fetch HR zones for max_hr and resting_hr
    try:
        hr_zones = client.connectapi('/biometric-service/heartRateZones')
        if hr_zones and isinstance(hr_zones, list) and hr_zones:
            zone_data = hr_zones[0]
            max_hr = zone_data.get('maxHeartRateUsed')
            resting_hr = zone_data.get('restingHeartRateUsed')
            if max_hr and 100 <= max_hr <= 250:
                values['max_hr'] = int(max_hr)
            if resting_hr and 30 <= resting_hr <= 100:
                values['resting_hr'] = int(resting_hr)
    except Exception as e:
        logger.debug("Could not fetch HR zones from Garmin for user %s: %s", user_id, e)
    
    # Fetch lactate threshold for threshold pace and potentially FTP
    cycling_ftp_found = False
    try:
        lt = client.get_lactate_threshold()
        if lt:
            # Threshold pace from speed field
            # Note: Garmin returns speed in a scaled format (multiply by 10 to get m/s)
            speed_hr = lt.get('speed_and_heart_rate') or {}
            speed_raw = speed_hr.get('speed')
            if speed_raw and speed_raw > 0:
                # The speed value from Garmin appears to be in m/s * 0.1
                # Multiply by 10 to get actual m/s, then convert to sec/km
                speed_ms = speed_raw * 10
                threshold_pace = round(1000 / speed_ms, 1)
                if 150 <= threshold_pace <= 600:  # Reasonable pace range (2:30 - 10:00/km)
                    values['threshold_pace_sec_per_km'] = threshold_pace
            
            # FTP and weight from power section
            power_data = lt.get('power') or {}
            sport = power_data.get('sport', '').upper()
            ftp = power_data.get('functionalThresholdPower')
            lt_weight = power_data.get('weight')
            
            # Only use FTP if it's for cycling (not running power)
            if ftp and sport == 'CYCLING' and 50 <= ftp <= 500:
                values['ftp_watts'] = int(ftp)
                cycling_ftp_found = True
            
            # Use weight from lactate threshold if not already set
            if lt_weight and 30 <= lt_weight <= 200 and 'weight_kg' not in values:
                weight_kg = float(lt_weight)
                values['weight_kg'] = round(weight_kg, 1)
    except Exception as e:
        logger.debug("Could not fetch lactate threshold from Garmin for user %s: %s", user_id, e)
    
    # If no cycling FTP found, estimate from VO2max
    if not cycling_ftp_found and vo2max_cycling and weight_kg:
        estimated_ftp = _estimate_ftp_from_vo2max(vo2max_cycling, weight_kg)
        if estimated_ftp:
            values['ftp_watts'] = estimated_ftp
            logger.debug(
                "Estimated cycling FTP for user %s: %dW (from VO2max=%.1f, weight=%.1fkg)",
                user_id, estimated_ftp, vo2max_cycling, weight_kg
            )
    
    return values


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

    # First, get values derived from activity/health data (fallback)
    derived_strength = _derive_strength_1rms(activities)
    activity_derived: dict[str, int | float | None] = {
        "ftp_watts": _derive_ftp_watts(activities),
        "threshold_pace_sec_per_km": _derive_threshold_pace(activities),
        "swim_css_sec_per_100m": _derive_swim_css(activities),
        "max_hr": _derive_max_hr(activities),
        "resting_hr": _derive_resting_hr(health_rows),
        "weight_kg": None,
        **derived_strength,
    }
    
    # Then, fetch Garmin user profile settings (preferred source for thresholds)
    garmin_profile = await _fetch_garmin_profile_values(user_id, sb)
    
    # Merge: Garmin profile values take priority over activity-derived values
    derived_values: dict[str, int | float | None] = {**activity_derived}
    for key, value in garmin_profile.items():
        if value is not None:
            derived_values[key] = value

    values, field_sources, garmin_values = merge_profile_fields(manual, derived_values)

    return EffectiveAthleteProfile(**values, field_sources=field_sources, garmin_values=garmin_values)
