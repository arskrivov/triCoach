"""Unit tests for extracted dashboard utility modules.

These tests cover date_utils, metrics, activity_aggregation, and the
load_direction function moved to fitness.py. All tests are pure unit tests
with no database or network dependencies.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest

from app.services.date_utils import (
    activity_local_date,
    date_range,
    parse_date,
    parse_datetime,
    to_float,
    to_zoneinfo,
)
from app.services.fitness import load_direction
from app.services.metrics import avg, extract_health_value, metric_direction


# ---------------------------------------------------------------------------
# date_utils tests
# ---------------------------------------------------------------------------


class TestToFloat:
    def test_converts_int(self):
        assert to_float(42) == 42.0

    def test_converts_string(self):
        assert to_float("3.14") == 3.14

    def test_returns_none_for_none(self):
        assert to_float(None) is None

    def test_returns_none_for_invalid_string(self):
        assert to_float("not-a-number") is None

    def test_returns_none_for_empty_string(self):
        assert to_float("") is None

    def test_converts_zero(self):
        assert to_float(0) == 0.0

    def test_converts_negative(self):
        assert to_float(-5.5) == -5.5


class TestToZoneinfo:
    def test_valid_timezone(self):
        tz = to_zoneinfo("America/New_York")
        assert tz.key == "America/New_York"

    def test_utc_timezone(self):
        tz = to_zoneinfo("UTC")
        assert tz.key == "UTC"

    def test_none_returns_utc(self):
        tz = to_zoneinfo(None)
        assert tz.key == "UTC"

    def test_empty_string_returns_utc(self):
        tz = to_zoneinfo("")
        assert tz.key == "UTC"

    def test_invalid_timezone_returns_utc(self):
        tz = to_zoneinfo("Not/ATimezone")
        assert tz.key == "UTC"


class TestDateRange:
    def test_returns_correct_range(self):
        tz = ZoneInfo("UTC")
        start, end = date_range(7, tz)
        assert (end - start).days == 6  # 7 days inclusive

    def test_end_is_today(self):
        tz = ZoneInfo("UTC")
        _, end = date_range(30, tz)
        today = datetime.now(tz).date()
        assert end == today

    def test_single_day_range(self):
        tz = ZoneInfo("UTC")
        start, end = date_range(1, tz)
        assert start == end


class TestParseDate:
    def test_parses_iso_date(self):
        result = parse_date("2024-01-15")
        assert result == date(2024, 1, 15)

    def test_parses_datetime_string(self):
        # Should extract just the date portion
        result = parse_date("2024-01-15T10:30:00")
        assert result == date(2024, 1, 15)

    def test_returns_none_for_none(self):
        assert parse_date(None) is None

    def test_returns_none_for_empty_string(self):
        assert parse_date("") is None


class TestParseDatetime:
    def test_parses_iso_datetime(self):
        result = parse_datetime("2024-01-15T10:30:00+00:00")
        assert result is not None
        assert result.year == 2024
        assert result.month == 1
        assert result.day == 15

    def test_parses_z_suffix(self):
        result = parse_datetime("2024-01-15T10:30:00Z")
        assert result is not None
        assert result.tzinfo is not None

    def test_returns_none_for_none(self):
        assert parse_datetime(None) is None

    def test_returns_none_for_empty_string(self):
        assert parse_datetime("") is None

    def test_returns_none_for_invalid_string(self):
        assert parse_datetime("not-a-date") is None


class TestActivityLocalDate:
    def test_converts_utc_to_local(self):
        # 2024-01-15 23:00 UTC = 2024-01-15 in UTC, but 2024-01-16 in UTC+2
        tz = ZoneInfo("Europe/Helsinki")  # UTC+2 in winter
        result = activity_local_date("2024-01-15T23:00:00Z", tz)
        assert result == date(2024, 1, 16)

    def test_same_date_in_utc(self):
        tz = ZoneInfo("UTC")
        result = activity_local_date("2024-01-15T10:00:00Z", tz)
        assert result == date(2024, 1, 15)

    def test_returns_none_for_none(self):
        tz = ZoneInfo("UTC")
        assert activity_local_date(None, tz) is None

    def test_handles_naive_datetime(self):
        # Naive datetime should be treated as UTC
        tz = ZoneInfo("UTC")
        result = activity_local_date("2024-01-15T10:00:00", tz)
        assert result == date(2024, 1, 15)


# ---------------------------------------------------------------------------
# metrics tests
# ---------------------------------------------------------------------------


class TestAvg:
    def test_calculates_average(self):
        assert avg([1.0, 2.0, 3.0]) == 2.0

    def test_rounds_to_one_decimal(self):
        assert avg([1.0, 2.0]) == 1.5

    def test_returns_none_for_empty_list(self):
        assert avg([]) is None

    def test_single_value(self):
        assert avg([5.5]) == 5.5


class TestMetricDirection:
    def test_up_when_higher_is_better_and_improved(self):
        assert metric_direction(80.0, 70.0, higher_is_better=True) == "up"

    def test_down_when_higher_is_better_and_declined(self):
        assert metric_direction(60.0, 70.0, higher_is_better=True) == "down"

    def test_up_when_lower_is_better_and_declined(self):
        # Lower resting HR is better; if HR went down, that's "up" (positive)
        assert metric_direction(55.0, 65.0, higher_is_better=False) == "up"

    def test_down_when_lower_is_better_and_increased(self):
        assert metric_direction(75.0, 65.0, higher_is_better=False) == "down"

    def test_stable_within_threshold(self):
        # 3% of 70 = 2.1, so delta of 1.0 is within threshold
        assert metric_direction(71.0, 70.0, higher_is_better=True) == "stable"

    def test_unknown_when_current_is_none(self):
        assert metric_direction(None, 70.0, higher_is_better=True) == "unknown"

    def test_unknown_when_baseline_is_none(self):
        assert metric_direction(70.0, None, higher_is_better=True) == "unknown"

    def test_unknown_when_both_none(self):
        assert metric_direction(None, None, higher_is_better=True) == "unknown"

    def test_minimum_absolute_threshold(self):
        # Even if 3% of baseline is < 1.0, minimum threshold is 1.0
        # baseline=5, 3% = 0.15, but min threshold = 1.0
        # delta = 0.5 < 1.0, so should be stable
        assert metric_direction(5.5, 5.0, higher_is_better=True) == "stable"


class TestExtractHealthValue:
    def _make_health_row(self, **kwargs):
        """Create a mock DailyHealthRow with specified field values."""
        row = MagicMock()
        row.sleep_score = kwargs.get("sleep_score", None)
        row.sleep_duration_seconds = kwargs.get("sleep_duration_seconds", None)
        row.hrv_last_night = kwargs.get("hrv_last_night", None)
        row.resting_hr = kwargs.get("resting_hr", None)
        row.stress_avg = kwargs.get("stress_avg", None)
        row.body_battery_high = kwargs.get("body_battery_high", None)
        row.respiration_avg = kwargs.get("respiration_avg", None)
        row.spo2_avg = kwargs.get("spo2_avg", None)
        row.morning_readiness_score = kwargs.get("morning_readiness_score", None)
        row.steps = kwargs.get("steps", None)
        row.daily_calories = kwargs.get("daily_calories", None)
        return row

    def test_sleep_score(self):
        row = self._make_health_row(sleep_score=85)
        assert extract_health_value(row, "sleep_score") == 85.0

    def test_sleep_duration_hours_conversion(self):
        row = self._make_health_row(sleep_duration_seconds=28800)  # 8 hours
        assert extract_health_value(row, "sleep_duration_hours") == 8.0

    def test_sleep_duration_hours_none_when_no_data(self):
        row = self._make_health_row(sleep_duration_seconds=None)
        assert extract_health_value(row, "sleep_duration_hours") is None

    def test_hrv_last_night(self):
        row = self._make_health_row(hrv_last_night=65.5)
        assert extract_health_value(row, "hrv_last_night") == 65.5

    def test_resting_hr(self):
        row = self._make_health_row(resting_hr=52)
        assert extract_health_value(row, "resting_hr") == 52.0

    def test_respiration_sleep_maps_to_respiration_avg(self):
        row = self._make_health_row(respiration_avg=14.5)
        assert extract_health_value(row, "respiration_sleep") == 14.5

    def test_pulse_ox_maps_to_spo2_avg(self):
        row = self._make_health_row(spo2_avg=98.0)
        assert extract_health_value(row, "pulse_ox_avg") == 98.0

    def test_morning_readiness_maps_to_morning_readiness_score(self):
        row = self._make_health_row(morning_readiness_score=72)
        assert extract_health_value(row, "morning_training_readiness_score") == 72.0

    def test_unknown_key_returns_none(self):
        row = self._make_health_row()
        assert extract_health_value(row, "nonexistent_key") is None

    def test_returns_none_when_field_is_none(self):
        row = self._make_health_row(sleep_score=None)
        assert extract_health_value(row, "sleep_score") is None


# ---------------------------------------------------------------------------
# fitness.load_direction tests
# ---------------------------------------------------------------------------


class TestLoadDirection:
    def test_fatigued_when_tsb_very_negative(self):
        assert load_direction({"tsb": -35.0}) == "fatigued"

    def test_fatigued_at_boundary(self):
        assert load_direction({"tsb": -30.1}) == "fatigued"

    def test_training_when_tsb_moderately_negative(self):
        assert load_direction({"tsb": -20.0}) == "training"

    def test_training_at_lower_boundary(self):
        assert load_direction({"tsb": -10.1}) == "training"

    def test_balanced_when_tsb_near_zero(self):
        assert load_direction({"tsb": 0.0}) == "balanced"

    def test_balanced_at_upper_boundary(self):
        assert load_direction({"tsb": 9.9}) == "balanced"

    def test_fresh_when_tsb_positive(self):
        assert load_direction({"tsb": 15.0}) == "fresh"

    def test_fresh_at_boundary(self):
        assert load_direction({"tsb": 10.1}) == "fresh"

    def test_unknown_when_none(self):
        assert load_direction(None) == "unknown"

    def test_unknown_when_tsb_is_none(self):
        assert load_direction({"tsb": None}) == "unknown"

    def test_unknown_when_empty_dict(self):
        assert load_direction({}) == "unknown"

    def test_exact_boundary_minus_30(self):
        # TSB == -30 is NOT < -30, so should be "training"
        assert load_direction({"tsb": -30.0}) == "training"

    def test_exact_boundary_minus_10(self):
        # TSB == -10 is NOT < -10, so should be "balanced"
        assert load_direction({"tsb": -10.0}) == "balanced"

    def test_exact_boundary_plus_10(self):
        # TSB == 10 is NOT > 10, so should be "balanced"
        assert load_direction({"tsb": 10.0}) == "balanced"
