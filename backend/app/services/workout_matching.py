"""Helpers for matching planned workouts to completed activities."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date
from typing import Any
from zoneinfo import ZoneInfo

from app.services.date_utils import activity_local_date, parse_date

COMMUTE_EVENT_TYPES = {
    "commute",
    "commuting",
    "transport",
    "transportation",
}


def _value(item: Any, key: str) -> Any:
    if isinstance(item, Mapping):
        return item.get(key)
    return getattr(item, key, None)


def _normalize(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def is_commute_activity(activity: Any) -> bool:
    """Return True when an activity is clearly marked as a commute."""
    type_key = _normalize(_value(activity, "garmin_type_key"))
    if "commute" in type_key:
        return True

    event_type = _normalize(_value(activity, "garmin_event_type"))
    if event_type in COMMUTE_EVENT_TYPES or "commute" in event_type:
        return True

    name = _normalize(_value(activity, "name"))
    return "commute" in name


def matched_activity_date(activity: Any, tz: ZoneInfo | None = None) -> date | None:
    start_time = _value(activity, "start_time")
    if tz is not None:
        return activity_local_date(start_time, tz)
    return parse_date(start_time)


def workout_matches_activity(
    workout: Any,
    activity: Any,
    *,
    tz: ZoneInfo | None = None,
) -> bool:
    scheduled = parse_date(_value(workout, "scheduled_date"))
    if scheduled is None:
        return False

    workout_discipline = str(_value(workout, "discipline") or "").upper()
    activity_discipline = str(_value(activity, "discipline") or "").upper()
    if workout_discipline != activity_discipline:
        return False

    if workout_discipline in {"RIDE_ROAD", "RIDE_GRAVEL"} and is_commute_activity(activity):
        return False

    activity_date = matched_activity_date(activity, tz=tz)
    if activity_date is None:
        return False

    return abs((activity_date - scheduled).days) <= 1


def match_workouts_to_activities(
    workouts: Sequence[Any],
    activities: Sequence[Any],
    *,
    tz: ZoneInfo | None = None,
) -> dict[str, Any]:
    """Match each workout to at most one best candidate activity.

    Matching is exact by discipline, within ±1 day, and excludes commute rides
    from satisfying planned cycling workouts.
    """
    matches: dict[str, Any] = {}
    used_activity_indices: set[int] = set()

    for workout in workouts:
        workout_id = str(_value(workout, "id") or "")
        scheduled = parse_date(_value(workout, "scheduled_date"))
        if not workout_id or scheduled is None:
            continue

        candidates: list[tuple[int, str, int, Any]] = []
        for idx, activity in enumerate(activities):
            if idx in used_activity_indices:
                continue
            if not workout_matches_activity(workout, activity, tz=tz):
                continue

            activity_date = matched_activity_date(activity, tz=tz)
            if activity_date is None:
                continue

            candidates.append((
                abs((activity_date - scheduled).days),
                str(_value(activity, "start_time") or ""),
                idx,
                activity,
            ))

        if not candidates:
            continue

        _, _, chosen_idx, chosen_activity = min(candidates)
        matches[workout_id] = chosen_activity
        used_activity_indices.add(chosen_idx)

    return matches
