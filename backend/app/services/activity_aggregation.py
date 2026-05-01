"""Activity and workout aggregation utility functions for the dashboard service.

These helpers are extracted from dashboard.py to keep that module focused
on orchestration logic. They are pure functions with no side effects.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.models import ActivityRow, WorkoutRow
from app.services.date_utils import parse_date
from app.services.workout_matching import match_workouts_to_activities


def prompt_activity_key(discipline: str) -> str:
    """Map a discipline enum value to the key used in AI prompt digests.

    Args:
        discipline: Canonical discipline string (e.g. "SWIM", "RIDE_ROAD").

    Returns:
        Prompt key string: "swim", "bike", "run", "strength", "mobility", or "other".
    """
    if discipline == "SWIM":
        return "swim"
    if discipline in {"RIDE_ROAD", "RIDE_GRAVEL"}:
        return "bike"
    if discipline == "RUN":
        return "run"
    if discipline == "STRENGTH":
        return "strength"
    if discipline in {"YOGA", "MOBILITY"}:
        return "mobility"
    return "other"


def upcoming_workout_payload(workout: WorkoutRow) -> dict[str, Any] | None:
    """Format a WorkoutRow into the payload shape expected by the frontend.

    Returns None if the workout has no scheduled date (and therefore cannot
    appear in the upcoming workouts list).

    Args:
        workout: A WorkoutRow instance from the database.

    Returns:
        Dict with id, name, discipline, scheduled_date, estimated_duration_seconds,
        estimated_tss, and description fields, or None if no scheduled date.
    """
    content = workout.content if isinstance(workout.content, dict) else {}
    if content.get("type") == "skipped":
        return None

    # Skipped / cancelled workouts are sometimes persisted with zero duration
    # so they remain in plan history, but they should not count as upcoming.
    if workout.estimated_duration_seconds is not None and workout.estimated_duration_seconds <= 0:
        return None

    scheduled_date = workout.scheduled_date or content.get("scheduled_date")
    if not scheduled_date:
        return None
    return {
        "id": workout.id,
        "name": workout.name,
        "discipline": workout.discipline,
        "scheduled_date": scheduled_date,
        "estimated_duration_seconds": workout.estimated_duration_seconds,
        "estimated_tss": workout.estimated_tss,
        "description": workout.description,
    }


def completion_rate_this_week(
    activities: list[ActivityRow],
    workouts: list[dict[str, Any]],
    tz: ZoneInfo,
) -> float | None:
    """Calculate the workout completion rate for the current calendar week.

    A planned workout is considered completed if an activity of the same
    discipline occurred within ±1 day of the scheduled date.

    Args:
        activities: All recent ActivityRow instances for the user.
        workouts: List of upcoming workout payload dicts (with scheduled_date).
        tz: User's local timezone for determining the current week.

    Returns:
        Completion rate as a float between 0.0 and 1.0, or None if no
        workouts were planned this week.
    """
    today = datetime.now(tz).date()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    planned = [
        w for w in workouts
        if (scheduled := parse_date(w["scheduled_date"])) is not None
        and week_start <= scheduled <= week_end
    ]
    if not planned:
        return None

    completed = len(match_workouts_to_activities(planned, activities, tz=tz))
    return round(completed / len(planned), 2)


def planned_summary(
    workouts: list[WorkoutRow],
    activities: list[ActivityRow],
    tz: ZoneInfo,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Aggregate planned workout data for the dashboard response.

    Filters workouts to those scheduled today or in the future, sorts them
    by date, calculates the current week's completion rate, and returns
    both a summary dict and the first 6 upcoming workouts.

    Args:
        workouts: All non-template WorkoutRow instances for the user.
        activities: All recent ActivityRow instances for the user.
        tz: User's local timezone.

    Returns:
        Tuple of (planned_summary_dict, upcoming_workouts_list[:6]).
    """
    today = datetime.now(tz).date()
    upcoming = [
        item for workout in workouts
        if (item := upcoming_workout_payload(workout)) is not None
        and (parse_date(item["scheduled_date"]) or today) >= today
    ]
    upcoming.sort(key=lambda item: item["scheduled_date"])
    completion_rate = completion_rate_this_week(activities, upcoming, tz)
    return (
        {
            "upcoming_count": len(upcoming),
            "next_workout": upcoming[0] if upcoming else None,
            "completion_rate_this_week": completion_rate,
        },
        upcoming[:6],
    )


def activity_summary_by_discipline(items: list[ActivityRow]) -> dict[str, dict[str, Any]]:
    """Aggregate a list of activities into per-discipline summary statistics.

    Groups activities into five canonical disciplines: swim, bike, run,
    strength, and mobility. RIDE_ROAD and RIDE_GRAVEL are merged into "bike";
    YOGA and MOBILITY are merged into "mobility". Activities with unrecognised
    disciplines are ignored.

    Args:
        items: List of ActivityRow instances to aggregate.

    Returns:
        Dict keyed by discipline name, each containing sessions (int),
        distance_km (float), duration_hours (float), avg_calories (float|None),
        and avg_hr (int|None).
    """
    summary: dict[str, dict[str, Any]] = {
        "swim":     {"sessions": 0, "distance_km": 0.0, "duration_hours": 0.0, "_calories": [], "_hr": []},
        "bike":     {"sessions": 0, "distance_km": 0.0, "duration_hours": 0.0, "_calories": [], "_hr": []},
        "run":      {"sessions": 0, "distance_km": 0.0, "duration_hours": 0.0, "_calories": [], "_hr": []},
        "strength": {"sessions": 0, "distance_km": 0.0, "duration_hours": 0.0, "_calories": [], "_hr": []},
        "mobility": {"sessions": 0, "distance_km": 0.0, "duration_hours": 0.0, "_calories": [], "_hr": []},
    }
    for activity in items:
        key: str | None = None
        if activity.discipline == "SWIM":
            key = "swim"
        elif activity.discipline in {"RIDE_ROAD", "RIDE_GRAVEL"}:
            key = "bike"
        elif activity.discipline == "RUN":
            key = "run"
        elif activity.discipline == "STRENGTH":
            key = "strength"
        elif activity.discipline in {"YOGA", "MOBILITY"}:
            key = "mobility"
        if key is None:
            continue
        entry = summary[key]
        entry["sessions"] += 1
        entry["distance_km"] += (activity.distance_meters or 0) / 1000
        entry["duration_hours"] += (activity.duration_seconds or 0) / 3600
        if activity.calories:
            entry["_calories"].append(activity.calories)
        if activity.avg_hr:
            entry["_hr"].append(activity.avg_hr)

    for entry in summary.values():
        entry["distance_km"] = round(entry["distance_km"], 1)
        entry["duration_hours"] = round(entry["duration_hours"], 1)
        cal_list = entry.pop("_calories")
        hr_list = entry.pop("_hr")
        entry["avg_calories"] = round(sum(cal_list) / len(cal_list)) if cal_list else None
        entry["avg_hr"] = round(sum(hr_list) / len(hr_list)) if hr_list else None
    return summary
