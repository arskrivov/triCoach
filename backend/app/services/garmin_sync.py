"""Garmin Connect sync service — Supabase edition.

Maps Garmin activity types to our discipline enum and syncs:
  - Activities (last N days) → activities table
  - Daily health metrics → daily_health table
"""

import base64
import io
import logging
import zipfile
from datetime import datetime, timedelta, timezone
from typing import Any

import polyline as polyline_codec
from postgrest.exceptions import APIError
from supabase import AsyncClient

from app.services.garmin import get_garmin_client

logger = logging.getLogger(__name__)

_GARMIN_TYPE_MAP: dict[str, str] = {
    "running": "RUN", "trail_running": "RUN", "treadmill_running": "RUN",
    "ultra_run": "RUN", "obstacle_run": "RUN", "track_running": "RUN", "virtual_run": "RUN",
    "cycling": "RIDE_ROAD", "road_biking": "RIDE_ROAD", "indoor_cycling": "RIDE_ROAD", "virtual_ride": "RIDE_ROAD",
    "gravel_cycling": "RIDE_GRAVEL", "mountain_biking": "RIDE_GRAVEL", "cyclocross": "RIDE_GRAVEL", "bmx": "RIDE_GRAVEL",
    "open_water_swimming": "SWIM", "lap_swimming": "SWIM", "swimming": "SWIM",
    "strength_training": "STRENGTH", "hiit": "STRENGTH", "fitness_equipment": "STRENGTH", "weight_training": "STRENGTH",
    "yoga": "YOGA", "pilates": "YOGA",
    "flexibility": "MOBILITY", "stretching": "MOBILITY", "breathwork": "MOBILITY",
    "multi_sport": "RUN", "triathlon": "RUN", "duathlon": "RUN",
}

_ENDURANCE = {"RUN", "RIDE_ROAD", "RIDE_GRAVEL", "SWIM"}
_STRENGTH = {"STRENGTH"}
_YOGA = {"YOGA", "MOBILITY"}
_FILE_DISCIPLINES = _ENDURANCE

_HRV_STATUS_MAP = {
    "poor": "POOR", "balanced": "BALANCED", "good": "GOOD",
    "no_data": "NO_DATA", "none": "NO_DATA",
}


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _training_load_from_summary(summary: dict[str, Any] | None) -> float | None:
    if not summary:
        return None
    return _to_float(summary.get("activityTrainingLoad") or summary.get("trainingLoad"))


def _map_discipline(garmin_type: str) -> str:
    return _GARMIN_TYPE_MAP.get(garmin_type.lower(), "OTHER")


def _encode_polyline(gps_points: list[dict]) -> str | None:
    try:
        coords = [(p["lat"], p["lon"]) for p in gps_points if "lat" in p and "lon" in p]
        return polyline_codec.encode(coords, precision=5) if coords else None
    except Exception:
        return None


def _extract_geo_points(details: dict | None) -> list[dict]:
    if not details:
        return []
    gps_points = details.get("gpsPoints")
    if isinstance(gps_points, list) and gps_points:
        return gps_points
    geo_polyline = details.get("geoPolylineDTO") or {}
    polyline_points = geo_polyline.get("polyline")
    if isinstance(polyline_points, list):
        return polyline_points
    return []


def _extract_laps(details: dict | None, splits: dict | None) -> list[dict] | None:
    lap_dtos = (splits or {}).get("lapDTOs")
    if isinstance(lap_dtos, list) and lap_dtos:
        return lap_dtos[:50]
    laps_raw = (details or {}).get("activityDetailMetrics")
    if isinstance(laps_raw, list) and laps_raw:
        return laps_raw[:50]
    return None


def _parse_endurance(summary: dict, details: dict | None, splits: dict | None) -> dict:
    out: dict[str, Any] = {}
    distance = summary.get("distance")
    out["distance_meters"] = _to_float(distance)
    elev = summary.get("elevationGain")
    out["elevation_gain_meters"] = _to_float(elev)
    out["avg_hr"] = _to_int(summary.get("averageHR"))
    out["max_hr"] = _to_int(summary.get("maxHR"))
    out["avg_power_watts"] = _to_int(summary.get("avgPower") or summary.get("averagePower"))
    out["normalized_power_watts"] = _to_int(summary.get("normPower") or summary.get("normalizedPower"))
    out["avg_cadence"] = _to_int(
        summary.get("averageRunningCadenceInStepsPerMinute")
        or summary.get("averageRunCadence")
        or summary.get("averageBikingCadenceInRevPerMin")
        or summary.get("avgBikingCadenceInRevPerMin")
    )
    speed = summary.get("averageSpeed")
    speed_value = _to_float(speed)
    if speed_value and speed_value > 0:
        out["avg_pace_sec_per_km"] = round(1000 / speed_value, 1)
    if details:
        gps = _extract_geo_points(details)
        out["polyline"] = _encode_polyline(gps)
    laps = _extract_laps(details, splits)
    if laps:
        out["laps"] = laps
    out["tss"] = _training_load_from_summary(summary)
    out["intensity_factor"] = _to_float(summary.get("intensityFactor"))
    return out


def _parse_strength(details: dict | None) -> dict:
    out: dict[str, Any] = {"exercises": [], "total_sets": 0, "total_volume_kg": None, "primary_muscle_groups": None}
    if not details:
        return out
    exercise_sets = details.get("exerciseSets") or []
    parsed: dict[str, dict] = {}
    total_volume = 0.0
    total_sets = 0
    has_weight = False
    for ex_set in exercise_sets:
        if ex_set.get("setType") == "REST":
            continue
        ex_name = (
            ex_set.get("exerciseName")
            or ex_set.get("categoryExerciseName")
            or ex_set.get("category") or "Unknown"
        )
        ex_name = ex_name.replace("_", " ").title()
        reps = ex_set.get("repetitions") or ex_set.get("reps")
        weight_kg = None
        weight_raw = ex_set.get("weight")
        if weight_raw is not None:
            weight_kg = round(float(weight_raw) / 1000, 2)
        duration_sec = ex_set.get("duration")
        rpe = ex_set.get("rpe")
        if weight_kg and reps:
            total_volume += weight_kg * int(reps)
            has_weight = True
        total_sets += 1
        if ex_name not in parsed:
            parsed[ex_name] = {"name": ex_name, "muscle_groups": [], "sets": []}
        set_data: dict[str, Any] = {}
        if reps:
            set_data["reps"] = int(reps)
        if weight_kg is not None:
            set_data["weight_kg"] = weight_kg
        if duration_sec:
            set_data["duration_sec"] = int(duration_sec)
        if rpe:
            set_data["rpe"] = float(rpe)
        parsed[ex_name]["sets"].append(set_data)
    out["exercises"] = list(parsed.values())
    out["total_sets"] = total_sets if total_sets > 0 else None
    # Only write volume when we actually have weighted sets — bodyweight-only sessions
    # produce 0.0 which is misleading; leave as null instead
    out["total_volume_kg"] = round(total_volume, 2) if has_weight else None
    # Garmin does not expose muscle group data via the API — leave as null
    out["primary_muscle_groups"] = None
    return out


def _parse_yoga(summary: dict) -> dict:
    type_key = (summary.get("activityType", {}).get("typeKey") or "").lower()
    if "yoga" in type_key or "pilates" in type_key:
        session_type = "YOGA_FLOW"
    elif "stretch" in type_key or "flexibility" in type_key:
        session_type = "STATIC_STRETCH"
    else:
        session_type = "MIXED"
    return {"session_type": session_type}


def _infer_download_metadata(
    garmin_activity_id: int,
    file_format: str,
    payload: bytes,
) -> tuple[str, str, str]:
    if file_format == "GPX":
        return (
            "application/gpx+xml",
            "utf-8",
            f"{garmin_activity_id}.gpx",
        )
    if file_format == "TCX":
        return (
            "application/vnd.garmin.tcx+xml",
            "utf-8",
            f"{garmin_activity_id}.tcx",
        )

    filename = f"{garmin_activity_id}.zip"
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            names = archive.namelist()
            if names:
                filename = f"{names[0]}.zip"
    except Exception:
        pass
    return ("application/zip", "base64", filename)


def _encode_download_payload(
    garmin_activity_id: int,
    file_format: str,
    payload: bytes,
) -> dict[str, Any]:
    content_type, content_encoding, source_filename = _infer_download_metadata(
        garmin_activity_id,
        file_format,
        payload,
    )
    if content_encoding == "utf-8":
        file_data = payload.decode("utf-8", errors="replace")
    else:
        file_data = base64.b64encode(payload).decode("ascii")

    return {
        "garmin_activity_id": garmin_activity_id,
        "file_format": file_format,
        "content_type": content_type,
        "content_encoding": content_encoding,
        "file_data": file_data,
        "file_size_bytes": len(payload),
        "source_filename": source_filename,
    }


async def _has_activity_files_table(sb: AsyncClient) -> bool:
    try:
        await sb.table("activity_files").select("id").limit(1).execute()
        return True
    except APIError as exc:
        logger.warning("Skipping activity file sync because activity_files table is missing: %s", exc)
        return False


async def _existing_activity_file_keys(
    user_id: str,
    sb: AsyncClient,
    garmin_activity_ids: list[int],
) -> set[tuple[int, str]]:
    if not garmin_activity_ids:
        return set()
    try:
        res = await sb.table("activity_files").select(
            "garmin_activity_id,file_format"
        ).eq("user_id", user_id).in_("garmin_activity_id", garmin_activity_ids).execute()
    except APIError as exc:
        logger.warning("Skipping activity file lookup: %s", exc)
        return set()
    return {
        (int(row["garmin_activity_id"]), str(row["file_format"]))
        for row in (res.data or [])
        if row.get("garmin_activity_id") and row.get("file_format")
    }


async def sync_activities(user_id: str, sb: AsyncClient, days_back: int = 90) -> tuple[int, int]:
    client = await get_garmin_client(user_id, sb)
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days_back)

    try:
        activities = client.get_activities_by_date(
            start_date.strftime("%Y-%m-%d"),
            end_date.strftime("%Y-%m-%d"),
        )
    except Exception as e:
        logger.error("Failed to fetch Garmin activities for user %s: %s", user_id, e)
        raise

    file_download_formats = (
        client.ActivityDownloadFormat.ORIGINAL,
        client.ActivityDownloadFormat.TCX,
        client.ActivityDownloadFormat.GPX,
    )
    records: list[dict] = []
    garmin_ids = [
        int(summary["activityId"])
        for summary in activities
        if summary.get("activityId") is not None
    ]
    files_table_available = await _has_activity_files_table(sb)
    existing_file_keys = await _existing_activity_file_keys(user_id, sb, garmin_ids) if files_table_available else set()
    file_records: list[dict[str, Any]] = []
    for summary in activities:
        garmin_id = summary.get("activityId")
        if not garmin_id:
            continue
        garmin_id = int(garmin_id)

        type_key = (summary.get("activityType") or {}).get("typeKey", "OTHER")
        discipline = _map_discipline(type_key)

        start_local = summary.get("startTimeLocal") or summary.get("startTimeGMT") or ""
        try:
            start_time = datetime.fromisoformat(start_local.replace("Z", "+00:00")).isoformat()
        except Exception:
            start_time = datetime.now(timezone.utc).isoformat()

        duration = summary.get("duration") or summary.get("movingDuration")
        calories = summary.get("calories") or summary.get("bmrCalories")

        row: dict[str, Any] = {
            "user_id": user_id,
            "garmin_activity_id": garmin_id,
            "discipline": discipline,
            "name": summary.get("activityName") or type_key.replace("_", " ").title(),
            "start_time": start_time,
            "duration_seconds": _to_int(duration),
            "calories": _to_int(calories),
        }

        details = None
        activity_payload = None
        splits = None
        hr_zones = None
        weather = None
        exercise_sets = None

        try:
            activity_payload = client.get_activity(garmin_id)
        except Exception as e:
            logger.warning("Could not fetch activity payload for activity %s: %s", garmin_id, e)

        summary_payload = (activity_payload or {}).get("summaryDTO") or summary

        if discipline in _ENDURANCE or discipline in _STRENGTH:
            try:
                details = client.get_activity_details(garmin_id)
            except Exception as e:
                logger.warning("Could not fetch details for activity %s: %s", garmin_id, e)

        try:
            splits = client.get_activity_splits(garmin_id)
        except Exception as e:
            logger.warning("Could not fetch splits for activity %s: %s", garmin_id, e)

        try:
            hr_zones = client.get_activity_hr_in_timezones(garmin_id)
            if hr_zones:
                row["hr_zones"] = hr_zones
        except Exception as e:
            logger.warning("Could not fetch HR zones for activity %s: %s", garmin_id, e)

        try:
            weather = client.get_activity_weather(garmin_id)
        except Exception as e:
            logger.warning("Could not fetch weather for activity %s: %s", garmin_id, e)

        if discipline in _STRENGTH:
            try:
                exercise_sets = client.get_activity_exercise_sets(garmin_id)
            except Exception as e:
                logger.warning("Could not fetch exercise sets for activity %s: %s", garmin_id, e)

        row["tss"] = _training_load_from_summary(summary_payload)

        if discipline in _ENDURANCE:
            row.update(_parse_endurance(summary_payload, details, splits))
        elif discipline in _STRENGTH:
            row.update(_parse_strength(exercise_sets or details))
        elif discipline in _YOGA:
            row.update(_parse_yoga(summary_payload))

        records.append(row)

        if not files_table_available or discipline not in _FILE_DISCIPLINES:
            continue
        for download_format in file_download_formats:
            format_name = download_format.name
            if (garmin_id, format_name) in existing_file_keys:
                continue
            try:
                payload = client.download_activity(str(garmin_id), download_format)
                file_records.append(
                    {
                        "user_id": user_id,
                        **_encode_download_payload(garmin_id, format_name, payload),
                    }
                )
            except Exception as e:
                logger.warning(
                    "Could not download %s export for activity %s: %s",
                    format_name,
                    garmin_id,
                    e,
                )

    if records:
        # Batch upsert; supabase handles on_conflict via PostgREST
        for i in range(0, len(records), 10):
            batch = records[i : i + 10]
            await sb.table("activities").upsert(
                batch, on_conflict="garmin_activity_id"
            ).execute()

    files_synced = 0
    if file_records:
        activity_map_res = await sb.table("activities").select("id,garmin_activity_id").eq(
            "user_id", user_id
        ).in_("garmin_activity_id", [record["garmin_activity_id"] for record in file_records]).execute()
        activity_id_by_garmin_id = {
            int(row["garmin_activity_id"]): row["id"]
            for row in (activity_map_res.data or [])
            if row.get("garmin_activity_id") and row.get("id")
        }
        for record in file_records:
            record["activity_id"] = activity_id_by_garmin_id.get(record["garmin_activity_id"])
        try:
            for i in range(0, len(file_records), 20):
                batch = file_records[i : i + 20]
                await sb.table("activity_files").upsert(
                    batch,
                    on_conflict="user_id,garmin_activity_id,file_format",
                ).execute()
                files_synced += len(batch)
        except APIError as exc:
            logger.warning("Skipping activity file persistence because activity_files write failed: %s", exc)

    await sb.table("users").update({
        "garmin_last_sync_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", user_id).execute()

    logger.info("Synced %d activities and %d activity files for user %s", len(records), files_synced, user_id)
    return len(records), files_synced


async def sync_daily_health(user_id: str, sb: AsyncClient, days_back: int = 90) -> int:
    client = await get_garmin_client(user_id, sb)
    from datetime import date, timedelta as td

    end_date = date.today()
    start_date = end_date - td(days=days_back)
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    # Pre-fetch bulk endpoints that don't support per-day queries
    # Steps: get_daily_steps works; get_stats/get_steps_data return 403
    steps_by_date: dict[str, int] = {}
    try:
        daily_steps = client.get_daily_steps(start_str, end_str)
        for item in (daily_steps or []):
            if isinstance(item, dict):
                cal_date = item.get("calendarDate")
                total = _to_int(item.get("totalSteps"))
                if cal_date and total and total > 0:
                    steps_by_date[cal_date] = total
    except Exception as e:
        logger.warning("Could not fetch bulk daily steps for user %s: %s", user_id, e)

    # Calories: /usersummary-service/stats/calories/daily/{start}/{end}
    # This endpoint has a 28-day limit — chunk it the same way get_daily_steps does
    calories_by_date: dict[str, int] = {}
    try:
        from datetime import timedelta as _td
        chunk_start = start_date
        while chunk_start <= end_date:
            chunk_end = min(chunk_start + _td(days=27), end_date)
            cal_resp = client.connectapi(
                f"/usersummary-service/stats/calories/daily"
                f"/{chunk_start.isoformat()}/{chunk_end.isoformat()}"
            )
            for item in (cal_resp or []):
                if isinstance(item, dict):
                    cal_date = item.get("calendarDate")
                    values = item.get("values") or {}
                    total = _to_int(values.get("totalCalories"))
                    if cal_date and total and total > 0:
                        calories_by_date[cal_date] = total
            chunk_start = chunk_end + _td(days=1)
    except Exception as e:
        logger.warning("Could not fetch bulk daily calories for user %s: %s", user_id, e)

    records: list[dict] = []
    current = start_date
    while current <= end_date:
        date_str = current.strftime("%Y-%m-%d")
        row: dict[str, Any] = {"user_id": user_id, "date": date_str}

        # Steps and calories from pre-fetched bulk data
        if date_str in steps_by_date:
            row["steps"] = steps_by_date[date_str]
        if date_str in calories_by_date:
            row["daily_calories"] = calories_by_date[date_str]

        try:
            hrv_data = client.get_hrv_data(date_str)
            if hrv_data:
                hrv_summary = hrv_data.get("hrvSummary") or {}
                status_raw = (hrv_summary.get("status") or "").lower()
                row["hrv_status"] = _HRV_STATUS_MAP.get(status_raw, "NO_DATA")
                last_night = hrv_summary.get("lastNightAvg") or hrv_summary.get("lastNight")
                row["hrv_last_night"] = float(last_night) if last_night else None
        except Exception:
            pass

        try:
            battery_data = client.get_body_battery(date_str)
            if battery_data and isinstance(battery_data, list):
                item = battery_data[0]
                # New API structure: top-level 'charged' field = daily high
                # Fallback: derive from bodyBatteryValuesArray [[timestamp, value], ...]
                charged = _to_int(item.get("charged"))
                if charged and charged > 0:
                    row["body_battery_high"] = charged
                    drained = _to_int(item.get("drained"))
                    if drained is not None:
                        row["body_battery_low"] = max(0, charged - drained)
                else:
                    vals_array = item.get("bodyBatteryValuesArray") or []
                    values = [v[1] for v in vals_array if isinstance(v, (list, tuple)) and len(v) > 1]
                    if values:
                        row["body_battery_high"] = max(int(v) for v in values)
                        row["body_battery_low"] = min(int(v) for v in values)
        except Exception:
            pass

        try:
            stress_data = client.get_stress_data(date_str)
            if stress_data:
                avg = stress_data.get("avgStressLevel") or stress_data.get("averageStressLevel")
                row["stress_avg"] = int(avg) if avg else None
        except Exception:
            pass

        try:
            sleep_data = client.get_sleep_data(date_str)
            if sleep_data:
                daily = sleep_data.get("dailySleepDTO") or sleep_data
                row["sleep_score"] = _to_int(
                    daily.get("sleepScores", {}).get("overall", {}).get("value")
                    or daily.get("sleepScore")
                )
                row["resting_hr"] = _to_int(
                    sleep_data.get("restingHeartRate")
                    or daily.get("restingHeartRate")
                    or daily.get("avgHeartRate")
                )
                row["sleep_duration_seconds"] = _to_int(daily.get("sleepTimeSeconds"))
                row["deep_sleep_seconds"] = _to_int(daily.get("deepSleepSeconds"))
                row["rem_sleep_seconds"] = _to_int(daily.get("remSleepSeconds"))
                row["light_sleep_seconds"] = _to_int(daily.get("lightSleepSeconds"))
        except Exception:
            pass

        try:
            respiration_data = client.get_respiration_data(date_str)
            if respiration_data:
                avg_resp = (
                    _to_float(respiration_data.get("avgSleepRespirationValue"))
                    or _to_float(respiration_data.get("avgWakingRespirationValue"))
                )
                if avg_resp and avg_resp > 0:
                    row["respiration_avg"] = avg_resp
        except Exception:
            pass

        try:
            morning_readiness = client.get_morning_training_readiness(date_str)
            if morning_readiness:
                payload = morning_readiness[0] if isinstance(morning_readiness, list) else morning_readiness
                score = _to_int(payload.get("score") or payload.get("trainingReadinessScore"))
                if score and score > 0:
                    row["morning_readiness_score"] = score
        except Exception:
            pass

        try:
            spo2_data = client.get_spo2_data(date_str)
            if spo2_data:
                avg_spo2 = _to_float(
                    spo2_data.get("averageSpO2")
                    or spo2_data.get("avgSpO2")
                    or spo2_data.get("averageSpo2")
                )
                if avg_spo2 and avg_spo2 > 0:
                    row["spo2_avg"] = avg_spo2
        except Exception:
            pass

        if len(row) > 2:
            records.append(row)
        current += td(days=1)

    if records:
        for i in range(0, len(records), 50):
            batch = records[i : i + 50]
            try:
                await sb.table("daily_health").upsert(
                    batch, on_conflict="user_id,date"
                ).execute()
            except Exception as e:
                logger.warning("Failed to upsert health batch: %s", e)

    logger.info("Synced %d days of health data for user %s", len(records), user_id)
    return len(records)
