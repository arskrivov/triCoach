from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from postgrest.exceptions import APIError
from supabase import AsyncClient

from app.config import settings
from app.models import ActivityRow, DailyHealthRow, UserRow, WorkoutRow
from app.services.activity_aggregation import (
    activity_summary_by_discipline as _activity_summary_by_discipline,
    completion_rate_this_week as _completion_rate_this_week,
    planned_summary as _planned_summary,
    prompt_activity_key as _prompt_activity_key,
    upcoming_workout_payload as _upcoming_workout_payload,
)
from app.services.date_utils import (
    activity_local_date as _activity_local_date,
    date_range as _date_range,
    parse_date as _parse_date,
    parse_datetime as _parse_datetime,
    to_float as _to_float,
    to_zoneinfo as _to_zoneinfo,
)
from app.services.fitness import activity_training_load, get_fitness_timeline, load_direction as _load_direction
from app.services.metrics import (
    avg as _avg,
    extract_health_value as _extract_health_value,
    metric_direction as _metric_direction,
)


@dataclass
class _MetricDefinition:
    key: str
    label: str
    unit: str
    higher_is_better: bool


RECOVERY_METRICS = (
    _MetricDefinition("sleep_score", "Sleep score", "", True),
    _MetricDefinition("sleep_duration_hours", "Sleep duration", "h", True),
    _MetricDefinition("hrv_last_night", "HRV", "ms", True),
    _MetricDefinition("resting_hr", "Resting HR", "", False),
    _MetricDefinition("respiration_sleep", "Sleep respiration", "", False),
    _MetricDefinition("stress_avg", "Stress", "", False),
    _MetricDefinition("pulse_ox_avg", "SpO2", "", True),
    _MetricDefinition("body_battery_high", "Body Battery high", "", True),
    _MetricDefinition("morning_training_readiness_score", "Morning readiness", "", True),
)

BRIEFING_READY_HOUR = 6





def _recovery_status(metrics: list[dict[str, Any]]) -> tuple[str, str]:
    positives = 0
    negatives = 0
    for metric in metrics:
        direction = metric["direction_vs_7d"]
        if direction == "up":
            positives += 1
        elif direction == "down":
            negatives += 1

    if negatives >= 3:
        return "strained", "Recovery is lagging behind your recent baseline."
    if positives >= 3:
        return "strong", "Recovery markers are trending well versus your recent baseline."
    return "steady", "Recovery is broadly stable with mixed signals."


def _activity_status(last_7d_tss: float, previous_7d_tss: float, readiness: float | None) -> tuple[str, str]:
    if last_7d_tss <= 0:
        return "idle", "No meaningful training load has been recorded in the last 7 days."
    load_change = last_7d_tss - previous_7d_tss
    if readiness is not None and readiness < 50 and load_change > 0:
        return "overreaching", "Load has risen while recovery signals are soft."
    if load_change > 80:
        return "building", "Training load is ramping up versus the previous week."
    if load_change < -80:
        return "lighter", "Training load is materially lighter than the previous week."
    return "steady", "Training load is stable versus the previous week."


def _heuristic_briefing(overview: dict[str, Any], local_date: date, local_time: datetime) -> dict[str, Any]:
    recovery = overview["recovery"]
    activity = overview["activity"]
    last_night = recovery["last_night"]
    recommendations: list[str] = []

    if recovery["status"] == "strained":
        recommendations.append("Keep intensity capped today and bias toward easy aerobic work or mobility.")
    elif recovery["status"] == "strong":
        recommendations.append("Recovery supports quality work today if it matches your plan.")
    else:
        recommendations.append("Train as planned, but keep an eye on how you feel in the warm-up.")

    if (last_night.get("sleep_score") or 0) < 75:
        recommendations.append("Protect tonight's sleep window and reduce late-day stimulants or screen spillover.")
    if (last_night.get("respiration_sleep") or 0) >= 16:
        recommendations.append("Watch hydration, alcohol, and late heavy meals because respiration was elevated overnight.")
    if activity["planned"]["upcoming_count"] == 0:
        recommendations.append("Schedule the next key workout so your week has structure.")
    elif activity["planned"]["completion_rate_this_week"] is not None and activity["planned"]["completion_rate_this_week"] < 0.5:
        recommendations.append("Prioritize plan compliance over adding extra unplanned sessions.")

    return {
        "source": "heuristic",
        "generated_for_date": local_date.isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ai_enabled": bool(settings.openai_api_key),
        "sleep_analysis": recovery["headline"],
        "activity_analysis": activity["headline"],
        "recommendations": recommendations[:4],
        "caution": "Hold back if HRV, sleep, and readiness all soften together." if recovery["status"] == "strained" else None,
    }


def _format_health_for_prompt(health: DailyHealthRow | None) -> dict[str, Any]:
    """Format a single day's health data into the AI prompt structure.

    Args:
        health: DailyHealthRow for the day, or None if no data.

    Returns:
        Dict with health metrics formatted for the AI prompt.
    """
    return {
        "sleep_score": _to_float(health.sleep_score) if health else None,
        "sleep_hours": round((health.sleep_duration_seconds or 0) / 3600, 1)
        if health and health.sleep_duration_seconds
        else None,
        "hrv_ms": _to_float(health.hrv_last_night) if health else None,
        "resting_hr": _to_float(health.resting_hr) if health else None,
        "readiness": _to_float(health.morning_readiness_score) if health else None,
        "stress": _to_float(health.stress_avg) if health else None,
        "spo2": _to_float(health.spo2_avg) if health else None,
        "respiration": _to_float(health.respiration_avg) if health else None,
        "steps": _to_float(health.steps) if health else None,
        "daily_calories": _to_float(health.daily_calories) if health else None,
    }


def _aggregate_training_for_prompt(
    activities_7d: list[ActivityRow],
    tz: ZoneInfo,
) -> dict[str, dict[str, Any]]:
    """Aggregate 7 days of activities into a per-date training summary for the AI prompt.

    Args:
        activities_7d: Activities from the last 7 days.
        tz: User's local timezone for date conversion.

    Returns:
        Dict keyed by ISO date string, each containing sessions, distance_km,
        duration_hours, tss, and by_discipline breakdown.
    """
    training_by_date: dict[str, dict[str, Any]] = {}
    for activity in activities_7d:
        activity_date = _activity_local_date(activity.start_time, tz)
        if activity_date is None:
            continue
        iso_date = activity_date.isoformat()
        entry = training_by_date.setdefault(
            iso_date,
            {
                "sessions": 0,
                "distance_km": 0.0,
                "duration_hours": 0.0,
                "tss": 0.0,
                "by_discipline": {},
            },
        )
        entry["sessions"] += 1
        entry["distance_km"] += (activity.distance_meters or 0) / 1000
        entry["duration_hours"] += (activity.duration_seconds or 0) / 3600
        entry["tss"] += activity_training_load(activity.model_dump()) or 0

        discipline = _prompt_activity_key(activity.discipline)
        discipline_entry = entry["by_discipline"].setdefault(
            discipline,
            {"sessions": 0, "distance_km": 0.0, "duration_hours": 0.0},
        )
        discipline_entry["sessions"] += 1
        discipline_entry["distance_km"] += (activity.distance_meters or 0) / 1000
        discipline_entry["duration_hours"] += (activity.duration_seconds or 0) / 3600
    return training_by_date


def _build_daily_prompt_digest(
    local_date: date,
    health_rows_7d: list[DailyHealthRow],
    activities_7d: list[ActivityRow],
    tz: ZoneInfo,
) -> list[dict[str, Any]]:
    health_by_date = {row.date: row for row in health_rows_7d}
    training_by_date = _aggregate_training_for_prompt(activities_7d, tz)
    empty_training: dict[str, Any] = {
        "sessions": 0,
        "distance_km": 0.0,
        "duration_hours": 0.0,
        "tss": 0.0,
        "by_discipline": {},
    }

    digest: list[dict[str, Any]] = []
    for days_ago in range(6, -1, -1):
        day = local_date - timedelta(days=days_ago)
        iso_date = day.isoformat()
        health = health_by_date.get(iso_date)
        training = training_by_date.get(iso_date, empty_training)
        digest.append(
            {
                "date": iso_date,
                "health": _format_health_for_prompt(health),
                "training": {
                    "sessions": training["sessions"],
                    "distance_km": round(training["distance_km"], 1),
                    "duration_hours": round(training["duration_hours"], 1),
                    "tss": round(training["tss"], 1),
                    "by_discipline": {
                        key: {
                            "sessions": value["sessions"],
                            "distance_km": round(value["distance_km"], 1),
                            "duration_hours": round(value["duration_hours"], 1),
                        }
                        for key, value in sorted(training["by_discipline"].items())
                    },
                },
            }
        )
    return digest


def _build_ai_prompt(
    timezone_name: str,
    local_date: date,
    health_rows_7d: list[DailyHealthRow],
    activities_7d: list[ActivityRow],
    goals: list[dict[str, Any]],
    fitness: dict[str, Any],
) -> str:
    prompt = {
        "date": local_date.isoformat(),
        "timezone": timezone_name,
        "daily_digest_7d": _build_daily_prompt_digest(local_date, health_rows_7d, activities_7d, _to_zoneinfo(timezone_name)),
        "fitness": {
            "ctl": fitness.get("ctl"),
            "atl": fitness.get("atl"),
            "tsb": fitness.get("tsb"),
            "direction": fitness.get("direction"),
        },
        "goals": [
            {"description": g.get("description"), "sport": g.get("sport"), "target_date": g.get("target_date")}
            for g in goals[:3]
        ],
    }
    return json.dumps(prompt, ensure_ascii=True, default=str)


def _parse_ai_briefing(text: str, fallback: dict[str, Any]) -> dict[str, Any]:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return fallback
    if not isinstance(parsed, dict):
        return fallback
    recommendations = parsed.get("recommendations")
    if not isinstance(recommendations, list):
        recommendations = fallback["recommendations"]
    return {
        **fallback,
        "source": "ai",
        "sleep_analysis": str(parsed.get("sleep_analysis") or fallback["sleep_analysis"]),
        "activity_analysis": str(parsed.get("activity_analysis") or fallback["activity_analysis"]),
        "recommendations": [str(item) for item in recommendations][:4],
        "caution": parsed.get("caution") or fallback["caution"],
    }





def _today_data_signature(
    today_health: DailyHealthRow | None,
    today_activities: list[ActivityRow],
    today: date,
    timezone_name: str,
) -> str | None:
    if today_health is None and not today_activities:
        return None

    signature_payload = {
        "briefing_date": today.isoformat(),
        "timezone": timezone_name,
        "health": {
            "date": today_health.date if today_health else None,
            "sleep_score": _extract_health_value(today_health, "sleep_score") if today_health else None,
            "sleep_duration_hours": _extract_health_value(today_health, "sleep_duration_hours") if today_health else None,
            "hrv_last_night": _extract_health_value(today_health, "hrv_last_night") if today_health else None,
            "resting_hr": _extract_health_value(today_health, "resting_hr") if today_health else None,
            "respiration_sleep": _extract_health_value(today_health, "respiration_sleep") if today_health else None,
            "stress_avg": _extract_health_value(today_health, "stress_avg") if today_health else None,
            "pulse_ox_avg": _extract_health_value(today_health, "pulse_ox_avg") if today_health else None,
            "morning_training_readiness_score": _extract_health_value(today_health, "morning_training_readiness_score") if today_health else None,
        },
        "activities": [
            {
                "garmin_activity_id": activity.garmin_activity_id,
                "discipline": activity.discipline,
                "start_time": activity.start_time,
                "duration_seconds": activity.duration_seconds,
                "distance_meters": activity.distance_meters,
                "tss": activity_training_load(activity.model_dump()),
            }
            for activity in sorted(
                today_activities,
                key=lambda item: (item.start_time, item.garmin_activity_id or 0),
            )
        ],
    }
    return hashlib.sha256(
        json.dumps(signature_payload, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()


async def _generate_briefing(
    overview: dict[str, Any],
    timezone_name: str,
    local_date: date,
    local_time: datetime,
    health_rows_7d: list[DailyHealthRow],
    activities_7d: list[ActivityRow],
    goals: list[dict[str, Any]],
) -> dict[str, Any]:
    fallback = _heuristic_briefing(overview, local_date, local_time)
    if not settings.openai_api_key:
        return fallback

    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.responses.create(
            model=settings.openai_analysis_model,
            instructions=(
                "You are a professional triathlon coach and sleep scientist. "
                "Analyze the athlete's data and return JSON only with keys: "
                "sleep_analysis (2-3 sentences on sleep quality and recovery trends, cite specific numbers), "
                "activity_analysis (2-3 sentences on training load and fitness direction, cite specific numbers), "
                "recommendations (list of 3-4 specific actionable items grounded in the metrics), "
                "caution (single sentence if something needs attention, otherwise null). "
                "No markdown. No prose outside JSON."
            ),
            input=_build_ai_prompt(
                timezone_name,
                local_date,
                health_rows_7d,
                activities_7d,
                goals,
                overview["activity"]["fitness"],
            ),
            max_output_tokens=600,
        )
        briefing = _parse_ai_briefing(response.output_text.strip(), fallback)
        briefing["generated_at"] = datetime.now(timezone.utc).isoformat()
        return briefing
    except Exception:
        return fallback


async def _resolve_briefing(
    overview: dict[str, Any],
    user: UserRow,
    sb: AsyncClient,
    timezone_name: str,
    local_date: date,
    local_time: datetime,
    today_health: DailyHealthRow | None,
    today_activities: list[ActivityRow],
    health_rows_7d: list[DailyHealthRow],
    activities_7d: list[ActivityRow],
    goals: list[dict[str, Any]],
    allow_generate: bool = False,
) -> dict[str, Any] | None:
    signature = _today_data_signature(today_health, today_activities, local_date, timezone_name)
    if signature is None:
        return None

    try:
        existing_res = await sb.table("daily_briefings").select(
            "briefing,data_signature"
        ).eq("user_id", user.id).eq("briefing_date", local_date.isoformat()).limit(1).execute()
    except APIError:
        if not allow_generate or local_time.time() < time(hour=BRIEFING_READY_HOUR):
            return None
        return await _generate_briefing(
            overview,
            timezone_name=timezone_name,
            local_date=local_date,
            local_time=local_time,
            health_rows_7d=health_rows_7d,
            activities_7d=activities_7d,
            goals=goals,
        )

    existing = existing_res.data[0] if existing_res.data else None
    if existing and existing.get("data_signature") == signature:
        return existing.get("briefing")

    if not allow_generate or local_time.time() < time(hour=BRIEFING_READY_HOUR):
        return existing.get("briefing") if existing else None

    briefing = await _generate_briefing(
        overview,
        timezone_name=timezone_name,
        local_date=local_date,
        local_time=local_time,
        health_rows_7d=health_rows_7d,
        activities_7d=activities_7d,
        goals=goals,
    )
    payload = {
        "user_id": user.id,
        "briefing_date": local_date.isoformat(),
        "data_signature": signature,
        "timezone": timezone_name,
        "briefing": briefing,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await sb.table("daily_briefings").upsert(
            payload,
            on_conflict="user_id,briefing_date",
        ).execute()
    except APIError:
        return briefing
    return briefing


# ---------------------------------------------------------------------------
# build_dashboard_overview helpers
# ---------------------------------------------------------------------------

def _aggregate_recovery_data(
    health_rows: list[DailyHealthRow],
    latest_health: DailyHealthRow | None,
    last_7_start: date,
    today: date,
) -> tuple[list[dict[str, Any]], str, str, dict[str, Any], list[dict[str, Any]]]:
    """Aggregate recovery metrics, sparkline, and last-night data.

    Args:
        health_rows: All health rows for the last 30 days (desc order).
        latest_health: The most recent DailyHealthRow, or None.
        last_7_start: Start date of the 7-day window.
        today: Today's local date.

    Returns:
        Tuple of (recovery_metrics, recovery_status, recovery_headline,
                  last_night_dict, health_sparkline_list).
    """
    recovery_metrics = []
    for metric in RECOVERY_METRICS:
        last_7_values = [
            value for row in health_rows if row.date >= last_7_start.isoformat()
            if (value := _extract_health_value(row, metric.key)) is not None
        ]
        last_30_values = [
            value for row in health_rows if (value := _extract_health_value(row, metric.key)) is not None
        ]
        current = _extract_health_value(latest_health, metric.key) if latest_health else None
        avg_7 = _avg(last_7_values)
        avg_30 = _avg(last_30_values)
        recovery_metrics.append({
            "key": metric.key,
            "label": metric.label,
            "unit": metric.unit,
            "current": current,
            "avg_7d": avg_7,
            "avg_30d": avg_30,
            "direction_vs_7d": _metric_direction(current, avg_7, metric.higher_is_better),
            "direction_vs_30d": _metric_direction(current, avg_30, metric.higher_is_better),
        })

    recovery_status, recovery_headline = _recovery_status(recovery_metrics)

    health_by_date = {row.date: row for row in health_rows}
    health_sparkline = []
    for days_ago in range(29, -1, -1):
        sparkline_date = (today - timedelta(days=days_ago)).isoformat()
        row = health_by_date.get(sparkline_date)
        health_sparkline.append({
            "date": sparkline_date,
            "sleep_score": row.sleep_score if row else None,
            "hrv": row.hrv_last_night if row else None,
            "resting_hr": row.resting_hr if row else None,
        })

    last_night = {
        "date": latest_health.date if latest_health else None,
        "sleep_score": _extract_health_value(latest_health, "sleep_score") if latest_health else None,
        "sleep_duration_hours": _extract_health_value(latest_health, "sleep_duration_hours") if latest_health else None,
        "hrv_last_night": _extract_health_value(latest_health, "hrv_last_night") if latest_health else None,
        "resting_hr": _extract_health_value(latest_health, "resting_hr") if latest_health else None,
        "respiration_sleep": _extract_health_value(latest_health, "respiration_sleep") if latest_health else None,
        "stress_avg": _extract_health_value(latest_health, "stress_avg") if latest_health else None,
        "pulse_ox_avg": _extract_health_value(latest_health, "pulse_ox_avg") if latest_health else None,
        "morning_training_readiness_score": _extract_health_value(latest_health, "morning_training_readiness_score") if latest_health else None,
    }

    return recovery_metrics, recovery_status, recovery_headline, last_night, health_sparkline


def _aggregate_activity_data(
    activities: list[ActivityRow],
    health_rows_7d: list[DailyHealthRow],
    last_7_activities: list[ActivityRow],
    prev_7_activities: list[ActivityRow],
    latest_fitness: dict[str, Any] | None,
    planned_summary_dict: dict[str, Any],
    readiness: float | None,
) -> tuple[str, str, dict[str, Any]]:
    """Aggregate activity metrics, discipline breakdown, and fitness data.

    Args:
        activities: All activities for the last 30 days.
        health_rows_7d: Health rows for the last 7 days.
        last_7_activities: Activities in the last 7 days.
        prev_7_activities: Activities in the previous 7-day window.
        latest_fitness: Most recent FitnessPoint dict, or None.
        planned_summary_dict: Pre-computed planned workout summary.
        readiness: Morning readiness score from last night, or None.

    Returns:
        Tuple of (activity_status, activity_headline, activity_dict).
    """
    def _sum_distance(items: list[ActivityRow]) -> float:
        return round(sum((a.distance_meters or 0) for a in items) / 1000, 1)

    def _sum_duration(items: list[ActivityRow]) -> float:
        return round(sum((a.duration_seconds or 0) for a in items) / 3600, 1)

    def _sum_tss(items: list[ActivityRow]) -> float:
        return round(sum(activity_training_load(a.model_dump()) or 0 for a in items), 1)

    last_7_tss = _sum_tss(last_7_activities)
    prev_7_tss = _sum_tss(prev_7_activities)
    activity_status, activity_headline = _activity_status(last_7_tss, prev_7_tss, readiness)

    discipline_breakdown: dict[str, int] = {}
    for activity in activities:
        discipline_breakdown[activity.discipline] = discipline_breakdown.get(activity.discipline, 0) + 1

    activity_dict = {
        "status": activity_status,
        "headline": activity_headline,
        "movement": {
            "steps_avg_7d": _avg([
                value for row in health_rows_7d
                if (value := _extract_health_value(row, "steps")) is not None
            ]),
            "daily_calories_avg_7d": _avg([
                value for row in health_rows_7d
                if (value := _extract_health_value(row, "daily_calories")) is not None
            ]),
        },
        "last_7d": {
            "sessions": len(last_7_activities),
            "distance_km": _sum_distance(last_7_activities),
            "duration_hours": _sum_duration(last_7_activities),
            "tss": last_7_tss,
            "by_discipline": _activity_summary_by_discipline(last_7_activities),
        },
        "previous_7d": {
            "sessions": len(prev_7_activities),
            "distance_km": _sum_distance(prev_7_activities),
            "duration_hours": _sum_duration(prev_7_activities),
            "tss": prev_7_tss,
            "by_discipline": _activity_summary_by_discipline(prev_7_activities),
        },
        "last_30d": {
            "sessions": len(activities),
            "distance_km": _sum_distance(activities),
            "duration_hours": _sum_duration(activities),
            "discipline_breakdown": discipline_breakdown,
        },
        "fitness": {
            "ctl": latest_fitness.get("ctl") if latest_fitness else None,
            "atl": latest_fitness.get("atl") if latest_fitness else None,
            "tsb": latest_fitness.get("tsb") if latest_fitness else None,
            "direction": _load_direction(latest_fitness),
        },
        "planned": planned_summary_dict,
    }
    return activity_status, activity_headline, activity_dict


def _aggregate_planned_data(
    workouts: list[WorkoutRow],
    activities: list[ActivityRow],
    tz: ZoneInfo,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Aggregate planned workout data for the dashboard response.

    Thin wrapper around planned_summary from activity_aggregation module,
    kept here to maintain a consistent naming pattern with the other
    _aggregate_* helpers.

    Args:
        workouts: All non-template WorkoutRow instances for the user.
        activities: All recent ActivityRow instances for the user.
        tz: User's local timezone.

    Returns:
        Tuple of (planned_summary_dict, upcoming_workouts_list[:6]).
    """
    return _planned_summary(workouts, activities, tz)


async def build_dashboard_overview(
    user: UserRow,
    sb: AsyncClient,
    timezone_name: str | None = None,
    allow_briefing_generation: bool = False,
) -> dict[str, Any]:
    tz = _to_zoneinfo(timezone_name)
    local_now = datetime.now(tz)
    last_30_start, today = _date_range(30, tz)
    last_7_start, _ = _date_range(7, tz)
    prev_7_start = today - timedelta(days=13)
    prev_7_end = today - timedelta(days=7)

    activities_res, health_res, workouts_res, goals_res = await asyncio.gather(
        sb.table("activities").select("*").eq("user_id", user.id).gte(
            "start_time", datetime.combine(last_30_start, time.min, tzinfo=timezone.utc).isoformat()
        ).order("start_time", desc=True).execute(),
        sb.table("daily_health").select("*").eq("user_id", user.id).gte(
            "date", last_30_start.isoformat()
        ).order("date", desc=True).execute(),
        sb.table("workouts").select("*").eq("user_id", user.id).eq(
            "is_template", False
        ).order("updated_at", desc=False).execute(),
        sb.table("goals").select("description,sport,target_date").eq("user_id", user.id).eq(
            "is_active", True
        ).execute(),
    )
    activities = [ActivityRow(**row) for row in (activities_res.data or [])]
    health_rows = [DailyHealthRow(**row) for row in (health_res.data or [])]
    workouts = [WorkoutRow(**row, scheduled_date=(row.get("content") or {}).get("scheduled_date")) for row in (workouts_res.data or [])]
    goals = goals_res.data or []

    latest_health = health_rows[0] if health_rows else None
    health_rows_7d = [row for row in health_rows if row.date >= last_7_start.isoformat()]

    # Aggregate recovery data
    recovery_metrics, recovery_status, recovery_headline, last_night, health_sparkline = _aggregate_recovery_data(
        health_rows, latest_health, last_7_start, today
    )

    # Filter activities by time windows
    last_7_activities = [a for a in activities if (_activity_local_date(a.start_time, tz) or today) >= last_7_start]
    prev_7_activities = [
        a for a in activities
        if prev_7_start <= (_activity_local_date(a.start_time, tz) or today) <= prev_7_end
    ]
    today_activities = [a for a in activities if _activity_local_date(a.start_time, tz) == today]
    today_health = next((row for row in health_rows if row.date == today.isoformat()), None)

    # Get fitness timeline and planned workout data
    fitness_timeline = await get_fitness_timeline(user.id, sb, days=90, timezone_name=timezone_name or "UTC")
    latest_fitness = fitness_timeline[-1] if fitness_timeline else None
    planned_summary_dict, upcoming_workouts = _aggregate_planned_data(workouts, activities, tz)

    # Aggregate activity data
    readiness = last_night.get("morning_training_readiness_score")
    activity_status, activity_headline, activity_dict = _aggregate_activity_data(
        activities,
        health_rows_7d,
        last_7_activities,
        prev_7_activities,
        latest_fitness,
        planned_summary_dict,
        readiness,
    )

    overview = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "timezone": timezone_name or "UTC",
        "last_sync_at": user.garmin_last_sync_at,
        "recovery": {
            "status": recovery_status,
            "headline": recovery_headline,
            "last_night": last_night,
            "metrics": recovery_metrics,
            "sparkline": health_sparkline,
        },
        "activity": activity_dict,
        "recent_activities": [
            {
                "id": activity.id,
                "garmin_activity_id": activity.garmin_activity_id,
                "discipline": activity.discipline,
                "name": activity.name,
                "start_time": activity.start_time,
                "duration_seconds": activity.duration_seconds,
                "calories": activity.calories,
                "distance_meters": activity.distance_meters,
                "elevation_gain_meters": activity.elevation_gain_meters,
                "avg_hr": activity.avg_hr,
                "avg_pace_sec_per_km": activity.avg_pace_sec_per_km,
                "avg_power_watts": activity.avg_power_watts,
                "tss": activity.tss,
                "total_sets": activity.total_sets,
                "total_volume_kg": activity.total_volume_kg,
                "session_type": activity.session_type,
            }
            for activity in activities[:6]
        ],
        "upcoming_workouts": upcoming_workouts,
        "fitness_timeline": fitness_timeline[-42:],
    }
    overview["briefing"] = await _resolve_briefing(
        overview,
        user=user,
        sb=sb,
        timezone_name=timezone_name or "UTC",
        local_date=local_now.date(),
        local_time=local_now,
        today_health=today_health,
        today_activities=today_activities,
        health_rows_7d=health_rows_7d,
        activities_7d=last_7_activities,
        goals=goals,
        allow_generate=allow_briefing_generation,
    )
    return overview
