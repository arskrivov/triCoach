"""Unit tests for dashboard.py helper functions.

Tests cover _recovery_status, _activity_status, _heuristic_briefing,
and _today_data_signature. All tests are pure unit tests with no database
or network dependencies.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from unittest.mock import MagicMock

import pytest

# Import private helpers directly for unit testing
from app.services.dashboard import (
    BRIEFING_SYSTEM_PROMPT,
    _activity_status,
    _recovery_status,
    _today_data_signature,
)


# ---------------------------------------------------------------------------
# _recovery_status tests
# ---------------------------------------------------------------------------


def _make_metrics(directions: list[str]) -> list[dict]:
    """Build a minimal metrics list with the given direction_vs_7d values."""
    return [{"direction_vs_7d": d} for d in directions]


class TestRecoveryStatus:
    def test_strained_when_3_or_more_down(self):
        metrics = _make_metrics(["down", "down", "down", "stable", "up"])
        status, headline = _recovery_status(metrics)
        assert status == "strained"
        assert "lagging" in headline.lower()

    def test_strained_at_exactly_3_down(self):
        metrics = _make_metrics(["down", "down", "down"])
        status, _ = _recovery_status(metrics)
        assert status == "strained"

    def test_strong_when_3_or_more_up(self):
        metrics = _make_metrics(["up", "up", "up", "stable"])
        status, headline = _recovery_status(metrics)
        assert status == "strong"
        assert "trending well" in headline.lower()

    def test_strong_at_exactly_3_up(self):
        metrics = _make_metrics(["up", "up", "up"])
        status, _ = _recovery_status(metrics)
        assert status == "strong"

    def test_steady_when_mixed_signals(self):
        metrics = _make_metrics(["up", "down", "stable", "stable", "up"])
        status, headline = _recovery_status(metrics)
        assert status == "steady"
        assert "stable" in headline.lower()

    def test_steady_when_all_stable(self):
        metrics = _make_metrics(["stable"] * 9)
        status, _ = _recovery_status(metrics)
        assert status == "steady"

    def test_steady_when_empty_metrics(self):
        status, _ = _recovery_status([])
        assert status == "steady"

    def test_strong_takes_priority_over_strained_when_more_ups(self):
        # 3 up, 2 down → strong (positives checked after negatives)
        metrics = _make_metrics(["up", "up", "up", "down", "down"])
        status, _ = _recovery_status(metrics)
        # negatives=2 < 3, positives=3 >= 3 → strong
        assert status == "strong"

    def test_strained_takes_priority_when_3_down_and_3_up(self):
        # 3 down, 3 up → strained (negatives checked first)
        metrics = _make_metrics(["down", "down", "down", "up", "up", "up"])
        status, _ = _recovery_status(metrics)
        assert status == "strained"

    def test_unknown_direction_ignored(self):
        # "unknown" should not count as up or down
        metrics = _make_metrics(["unknown", "unknown", "unknown", "stable"])
        status, _ = _recovery_status(metrics)
        assert status == "steady"


# ---------------------------------------------------------------------------
# _activity_status tests
# ---------------------------------------------------------------------------


class TestActivityStatus:
    def test_idle_when_no_tss(self):
        status, headline = _activity_status(0.0, 50.0, None)
        assert status == "idle"
        assert "no meaningful" in headline.lower()

    def test_idle_when_negative_tss(self):
        status, _ = _activity_status(-5.0, 50.0, None)
        assert status == "idle"

    def test_overreaching_when_load_up_and_readiness_low(self):
        status, headline = _activity_status(200.0, 100.0, 40.0)
        assert status == "overreaching"
        assert "soft" in headline.lower()

    def test_not_overreaching_when_readiness_ok(self):
        # readiness >= 50 → not overreaching even if load increased
        status, _ = _activity_status(200.0, 100.0, 60.0)
        assert status == "building"

    def test_not_overreaching_when_load_did_not_increase(self):
        # load_change <= 0 → not overreaching even if readiness is low
        status, _ = _activity_status(100.0, 200.0, 30.0)
        assert status == "lighter"

    def test_building_when_load_up_more_than_80(self):
        status, headline = _activity_status(200.0, 100.0, None)
        assert status == "building"
        assert "ramping up" in headline.lower()

    def test_building_at_exactly_81_increase(self):
        status, _ = _activity_status(181.0, 100.0, None)
        assert status == "building"

    def test_lighter_when_load_down_more_than_80(self):
        status, headline = _activity_status(50.0, 200.0, None)
        assert status == "lighter"
        assert "lighter" in headline.lower()

    def test_lighter_at_exactly_81_decrease(self):
        status, _ = _activity_status(100.0, 181.0, None)
        assert status == "lighter"

    def test_steady_when_load_change_within_80(self):
        status, headline = _activity_status(150.0, 100.0, None)
        assert status == "steady"
        assert "stable" in headline.lower()

    def test_steady_when_no_change(self):
        status, _ = _activity_status(100.0, 100.0, None)
        assert status == "steady"

    def test_overreaching_requires_positive_load_change(self):
        # readiness < 50 but load_change == 0 → not overreaching
        status, _ = _activity_status(100.0, 100.0, 30.0)
        assert status == "steady"


# ---------------------------------------------------------------------------
# _today_data_signature tests
# ---------------------------------------------------------------------------


def _make_activity_row(**kwargs):
    """Create a mock ActivityRow."""
    row = MagicMock()
    row.garmin_activity_id = kwargs.get("garmin_activity_id", 12345)
    row.discipline = kwargs.get("discipline", "RUN")
    row.start_time = kwargs.get("start_time", "2024-01-15T08:00:00Z")
    row.duration_seconds = kwargs.get("duration_seconds", 3600)
    row.distance_meters = kwargs.get("distance_meters", 10000)
    row.tss = kwargs.get("tss", None)
    row.model_dump = lambda: {
        "garmin_activity_id": row.garmin_activity_id,
        "discipline": row.discipline,
        "start_time": row.start_time,
        "duration_seconds": row.duration_seconds,
        "distance_meters": row.distance_meters,
        "tss": row.tss,
    }
    return row


def _make_health_row(**kwargs):
    """Create a mock DailyHealthRow."""
    row = MagicMock()
    row.date = kwargs.get("date", "2024-01-15")
    row.sleep_score = kwargs.get("sleep_score", 80)
    row.sleep_duration_seconds = kwargs.get("sleep_duration_seconds", 28800)
    row.hrv_last_night = kwargs.get("hrv_last_night", 65.0)
    row.resting_hr = kwargs.get("resting_hr", 52)
    row.respiration_avg = kwargs.get("respiration_avg", 14.5)
    row.stress_avg = kwargs.get("stress_avg", 25)
    row.spo2_avg = kwargs.get("spo2_avg", 98.0)
    row.morning_readiness_score = kwargs.get("morning_readiness_score", 72)
    row.body_battery_high = kwargs.get("body_battery_high", 85)
    row.steps = kwargs.get("steps", 8000)
    row.daily_calories = kwargs.get("daily_calories", 2200)
    return row


class TestTodayDataSignature:
    def test_returns_none_when_no_data(self):
        result = _today_data_signature(None, [], date(2024, 1, 15), "UTC")
        assert result is None

    def test_returns_hash_when_health_present(self):
        health = _make_health_row()
        result = _today_data_signature(health, [], date(2024, 1, 15), "UTC")
        assert result is not None
        assert len(result) == 64  # SHA256 hex digest

    def test_returns_hash_when_activities_present(self):
        activity = _make_activity_row()
        result = _today_data_signature(None, [activity], date(2024, 1, 15), "UTC")
        assert result is not None
        assert len(result) == 64

    def test_same_data_produces_same_hash(self):
        health = _make_health_row()
        activity = _make_activity_row()
        today = date(2024, 1, 15)
        result1 = _today_data_signature(health, [activity], today, "UTC")
        result2 = _today_data_signature(health, [activity], today, "UTC")
        assert result1 == result2

    def test_different_date_produces_different_hash(self):
        health = _make_health_row()
        result1 = _today_data_signature(health, [], date(2024, 1, 15), "UTC")
        result2 = _today_data_signature(health, [], date(2024, 1, 16), "UTC")
        assert result1 != result2

    def test_different_timezone_produces_different_hash(self):
        health = _make_health_row()
        result1 = _today_data_signature(health, [], date(2024, 1, 15), "UTC")
        result2 = _today_data_signature(health, [], date(2024, 1, 15), "America/New_York")
        assert result1 != result2

    def test_different_health_data_produces_different_hash(self):
        health1 = _make_health_row(sleep_score=80)
        health2 = _make_health_row(sleep_score=90)
        result1 = _today_data_signature(health1, [], date(2024, 1, 15), "UTC")
        result2 = _today_data_signature(health2, [], date(2024, 1, 15), "UTC")
        assert result1 != result2

    def test_different_activities_produce_different_hash(self):
        health = _make_health_row()
        activity1 = _make_activity_row(duration_seconds=3600)
        activity2 = _make_activity_row(duration_seconds=7200)
        result1 = _today_data_signature(health, [activity1], date(2024, 1, 15), "UTC")
        result2 = _today_data_signature(health, [activity2], date(2024, 1, 15), "UTC")
        assert result1 != result2

    def test_activity_order_does_not_affect_hash(self):
        """Activities are sorted by start_time before hashing."""
        health = _make_health_row()
        activity1 = _make_activity_row(start_time="2024-01-15T08:00:00Z", garmin_activity_id=1)
        activity2 = _make_activity_row(start_time="2024-01-15T10:00:00Z", garmin_activity_id=2)
        result1 = _today_data_signature(health, [activity1, activity2], date(2024, 1, 15), "UTC")
        result2 = _today_data_signature(health, [activity2, activity1], date(2024, 1, 15), "UTC")
        assert result1 == result2


# ---------------------------------------------------------------------------
# BRIEFING_SYSTEM_PROMPT content tests (Task 4.6)
# ---------------------------------------------------------------------------


class TestBriefingSystemPrompt:
    """Verify the system prompt contains key phrases required by the spec."""

    def test_triathlon_persona(self):
        """Prompt establishes a triathlon-focused coaching persona."""
        prompt_lower = BRIEFING_SYSTEM_PROMPT.lower()
        assert "triathlon" in prompt_lower
        assert "swim" in prompt_lower
        assert "bike" in prompt_lower
        assert "run" in prompt_lower
        assert "strength" in prompt_lower
        assert "mobility" in prompt_lower

    def test_cross_discipline_impact(self):
        """Prompt includes cross-discipline impact awareness."""
        prompt_lower = BRIEFING_SYSTEM_PROMPT.lower()
        assert "cross-discipline" in prompt_lower
        # Specific examples from requirements
        assert "squat" in prompt_lower or "strength work" in prompt_lower
        assert "swim volume" in prompt_lower or "shoulder" in prompt_lower
        assert "mobility" in prompt_lower
        assert "injury risk" in prompt_lower

    def test_evidence_based_science(self):
        """Prompt grounds advice in evidence-based science."""
        prompt_lower = BRIEFING_SYSTEM_PROMPT.lower()
        assert "evidence-based" in prompt_lower
        assert "zone 2" in prompt_lower
        assert "hrv" in prompt_lower
        assert "sleep architecture" in prompt_lower
        assert "periodisation" in prompt_lower or "periodization" in prompt_lower

    def test_four_recommendations(self):
        """Prompt requires exactly 4 recommendations."""
        prompt_lower = BRIEFING_SYSTEM_PROMPT.lower()
        assert "exactly 4" in prompt_lower
        assert "recovery" in prompt_lower
        assert "training" in prompt_lower

    def test_mandatory_caution(self):
        """Prompt requires a mandatory non-null caution field."""
        prompt_lower = BRIEFING_SYSTEM_PROMPT.lower()
        assert "caution" in prompt_lower
        assert "never null" in prompt_lower or "mandatory" in prompt_lower

    def test_no_generic_filler(self):
        """Prompt prohibits generic wellness filler."""
        prompt_lower = BRIEFING_SYSTEM_PROMPT.lower()
        assert "stay hydrated" in prompt_lower  # listed as prohibited example
        assert "listen to your body" in prompt_lower  # listed as prohibited example
        # The prompt should contain these as examples of what NOT to say
        assert "generic" in prompt_lower or "filler" in prompt_lower

    def test_recency_weighting(self):
        """Prompt instructs the model to use recency weights."""
        prompt_lower = BRIEFING_SYSTEM_PROMPT.lower()
        assert "recency_weight" in prompt_lower
        assert "yesterday" in prompt_lower
        assert "primary signal" in prompt_lower

    def test_planned_workouts(self):
        """Prompt instructs the model to factor in planned workouts."""
        prompt_lower = BRIEFING_SYSTEM_PROMPT.lower()
        assert "planned_workouts_today" in prompt_lower
        assert "planned" in prompt_lower
        assert "scheduled" in prompt_lower

    def test_interpretive_analysis_style(self):
        """Prompt requires interpretive analysis, not just number listing."""
        prompt_lower = BRIEFING_SYSTEM_PROMPT.lower()
        assert "physiological" in prompt_lower
        assert "significance" in prompt_lower
        assert "connect" in prompt_lower
        assert "data point" in prompt_lower

    def test_coherence_rule(self):
        """Prompt requires internal coherence across recommendations and caution."""
        prompt_lower = BRIEFING_SYSTEM_PROMPT.lower()
        assert "coherent" in prompt_lower or "coherence" in prompt_lower
        assert "contradict" in prompt_lower
