"""Date and timezone utility functions for the dashboard service.

These helpers are extracted from dashboard.py to keep that module focused
on orchestration logic. They are pure functions with no side effects.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def to_float(value: Any) -> float | None:
    """Convert any value to float, returning None on failure.

    Args:
        value: Any value to convert.

    Returns:
        Float representation of value, or None if conversion fails.
    """
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def to_zoneinfo(timezone_name: str | None) -> ZoneInfo:
    """Parse a timezone name string into a ZoneInfo object.

    Falls back to UTC if the timezone name is missing or invalid.

    Args:
        timezone_name: IANA timezone name (e.g. "America/New_York").

    Returns:
        ZoneInfo object for the given timezone, or UTC on failure.
    """
    if not timezone_name:
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def date_range(days: int, tz: ZoneInfo) -> tuple[date, date]:
    """Calculate a date range ending today in the given timezone.

    Args:
        days: Number of days to include in the range.
        tz: Timezone to use when determining "today".

    Returns:
        Tuple of (start_date, end_date) where end_date is today.
    """
    today = datetime.now(tz).date()
    return today - timedelta(days=days - 1), today


def parse_date(value: str | None) -> date | None:
    """Parse an ISO date string (YYYY-MM-DD) into a date object.

    Args:
        value: ISO date string, or None.

    Returns:
        Parsed date, or None if value is missing or invalid.
    """
    if not value:
        return None
    return date.fromisoformat(value[:10])


def parse_datetime(value: str | None) -> datetime | None:
    """Parse an ISO datetime string into a datetime object.

    Handles both offset-aware strings and the 'Z' UTC suffix.

    Args:
        value: ISO datetime string, or None.

    Returns:
        Parsed datetime, or None if value is missing or invalid.
    """
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def activity_local_date(start_time: str | None, tz: ZoneInfo) -> date | None:
    """Convert an activity's UTC start_time string to a local calendar date.

    Args:
        start_time: ISO datetime string for the activity start (UTC).
        tz: User's local timezone.

    Returns:
        Local calendar date of the activity, or None if start_time is missing.
    """
    parsed = parse_datetime(start_time)
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(tz).date()
