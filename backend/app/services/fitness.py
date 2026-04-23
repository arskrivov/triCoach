"""ATL / CTL / TSB fitness timeline calculation."""

from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from supabase import AsyncClient


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_zoneinfo(timezone_name: str | None) -> ZoneInfo:
    if not timezone_name:
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _activity_local_date(start_time: str | None, tz: ZoneInfo) -> date | None:
    parsed = _parse_datetime(start_time)
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(tz).date()


def activity_training_load(row: dict[str, Any]) -> float | None:
    direct = _to_float(row.get("tss"))
    if direct is not None:
        return direct

    discipline = str(row.get("discipline") or "")
    duration_seconds = _to_float(row.get("duration_seconds"))
    if not duration_seconds or duration_seconds <= 0:
        return None

    hours = duration_seconds / 3600
    if discipline == "RUN":
        return round(hours * 45, 1)
    if discipline in {"RIDE_ROAD", "RIDE_GRAVEL"}:
        return round(hours * 35, 1)
    if discipline == "SWIM":
        return round(hours * 40, 1)
    if discipline == "STRENGTH":
        return round(hours * 25, 1)
    return round(hours * 20, 1)


async def get_fitness_timeline(
    user_id: str,
    sb: AsyncClient,
    days: int = 120,
    timezone_name: str | None = None,
) -> list[dict]:
    tz = _to_zoneinfo(timezone_name)
    today = datetime.now(tz).date()
    start = today - timedelta(days=days + 42)  # extra 42 days for CTL warm-up
    query_start = start - timedelta(days=1)

    res = await sb.table("activities").select(
        "start_time,tss,discipline,duration_seconds"
    ).eq("user_id", user_id).gte(
        "start_time", query_start.isoformat()
    ).execute()

    daily_tss: dict[date, float] = {}
    for row in res.data or []:
        load = activity_training_load(row)
        if load is None:
            continue
        d = _activity_local_date(row.get("start_time"), tz)
        if d is None or d < start:
            continue
        daily_tss[d] = daily_tss.get(d, 0) + load

    # TrainingPeaks defines CTL/ATL using time constants of 42 and 7 days.
    ctl_k = 1 / 42
    atl_k = 1 / 7
    ctl = 0.0
    atl = 0.0
    previous_ctl = 0.0
    previous_atl = 0.0
    timeline = []

    current = today - timedelta(days=days + 42)
    output_start = today - timedelta(days=days)

    while current <= today:
        tss = daily_tss.get(current, 0.0)
        tsb = previous_ctl - previous_atl
        ctl = ctl + ctl_k * (tss - ctl)
        atl = atl + atl_k * (tss - atl)
        if current >= output_start:
            timeline.append({
                "date": current.isoformat(),
                "ctl": round(ctl, 1),
                "atl": round(atl, 1),
                "tsb": round(tsb, 1),
                "daily_tss": round(tss, 1),
            })
        previous_ctl = ctl
        previous_atl = atl
        current += timedelta(days=1)

    return timeline


def load_direction(latest_point: dict[str, Any] | None) -> str:
    """Determine the fitness direction label from the latest TSB value.

    Uses standard endurance training thresholds:
    - TSB < -30: fatigued (heavy accumulated fatigue)
    - TSB < -10: training (productive training stress)
    - TSB > +10: fresh (well-recovered, ready to race)
    - Otherwise: balanced

    Args:
        latest_point: The most recent FitnessPoint dict (with a "tsb" key),
                      or None if no fitness data is available.

    Returns:
        One of "unknown", "fatigued", "training", "fresh", or "balanced".
    """
    if not latest_point:
        return "unknown"
    tsb = latest_point.get("tsb")
    if tsb is None:
        return "unknown"
    if tsb < -30:
        return "fatigued"
    if tsb < -10:
        return "training"
    if tsb > 10:
        return "fresh"
    return "balanced"
