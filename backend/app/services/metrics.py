"""Metric calculation utility functions for the dashboard service.

These helpers are extracted from dashboard.py to keep that module focused
on orchestration logic. They are pure functions with no side effects.
"""

from __future__ import annotations

from statistics import mean
from typing import Any

from app.models import DailyHealthRow
from app.services.date_utils import to_float


def avg(values: list[float]) -> float | None:
    """Calculate the mean of a list of floats, rounded to one decimal place.

    Args:
        values: List of float values to average.

    Returns:
        Rounded mean, or None if the list is empty.
    """
    return round(mean(values), 1) if values else None


def extract_health_value(row: DailyHealthRow, key: str) -> float | None:
    """Extract a specific health metric value from a DailyHealthRow.

    Maps logical metric keys (as used in RECOVERY_METRICS) to the
    corresponding field on the row model, applying any unit conversions.

    Args:
        row: A DailyHealthRow instance from the database.
        key: Logical metric key (e.g. "sleep_score", "hrv_last_night").

    Returns:
        Float value for the metric, or None if unavailable.
    """
    if key == "sleep_score":
        return to_float(row.sleep_score)
    if key == "sleep_duration_hours":
        return round((row.sleep_duration_seconds or 0) / 3600, 2) if row.sleep_duration_seconds else None
    if key == "hrv_last_night":
        return to_float(row.hrv_last_night)
    if key == "resting_hr":
        return to_float(row.resting_hr)
    if key == "stress_avg":
        return to_float(row.stress_avg)
    if key == "body_battery_high":
        return to_float(row.body_battery_high)
    if key == "respiration_sleep":
        return to_float(row.respiration_avg)
    if key == "pulse_ox_avg":
        return to_float(row.spo2_avg)
    if key == "morning_training_readiness_score":
        return to_float(row.morning_readiness_score)
    if key == "steps":
        return to_float(row.steps)
    if key == "daily_calories":
        return to_float(row.daily_calories)
    return None


def metric_direction(
    current: float | None,
    baseline: float | None,
    higher_is_better: bool,
) -> str:
    """Determine the trend direction of a metric relative to its baseline.

    Uses a 3% relative threshold (minimum 1.0 absolute) to avoid flagging
    noise as a meaningful change.

    Args:
        current: Most recent value of the metric.
        baseline: Baseline value to compare against (e.g. 7-day average).
        higher_is_better: Whether an increase in value is a positive trend.

    Returns:
        "up" if trending positively, "down" if trending negatively,
        "stable" if within threshold, or "unknown" if data is missing.
    """
    if current is None or baseline is None:
        return "unknown"
    delta = current - baseline
    if abs(delta) < max(1.0, abs(baseline) * 0.03):
        return "stable"
    if higher_is_better:
        return "up" if delta > 0 else "down"
    return "down" if delta > 0 else "up"
