"""Tests for the active training plan section in coach_context.py.

Verifies that _build_active_plan_section correctly:
- Returns None when no active plan exists
- Formats plan metadata (name, phase, week, hours)
- Lists this week's workouts with correct status (completed/upcoming)
- Handles edge cases (no workouts, unknown phase, missing plan_structure)
"""

from __future__ import annotations

import asyncio
from datetime import date, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.coach_context import _build_active_plan_section, _day_name


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_sb_client(
    plan_data: list[dict] | None = None,
    workout_data: list[dict] | None = None,
) -> AsyncMock:
    """Build a mock Supabase AsyncClient that returns plan and workout data."""
    sb = AsyncMock()

    # Chain: sb.table("training_plans").select("*").eq(...).eq(...).limit(1).execute()
    plan_result = MagicMock()
    plan_result.data = plan_data or []

    plan_chain = MagicMock()
    plan_chain.select.return_value = plan_chain
    plan_chain.eq.return_value = plan_chain
    plan_chain.limit.return_value = plan_chain
    plan_chain.execute = AsyncMock(return_value=plan_result)

    # Chain: sb.table("workouts").select("*").eq(...).eq(...).eq(...).order(...).execute()
    workout_result = MagicMock()
    workout_result.data = workout_data or []

    workout_chain = MagicMock()
    workout_chain.select.return_value = workout_chain
    workout_chain.eq.return_value = workout_chain
    workout_chain.order.return_value = workout_chain
    workout_chain.execute = AsyncMock(return_value=workout_result)

    def table_router(name: str):
        if name == "training_plans":
            return plan_chain
        if name == "workouts":
            return workout_chain
        # Fallback
        fallback = MagicMock()
        fallback.select.return_value = fallback
        fallback.eq.return_value = fallback
        fallback.limit.return_value = fallback
        fallback.order.return_value = fallback
        fallback.execute = AsyncMock(return_value=MagicMock(data=[]))
        return fallback

    sb.table = table_router
    return sb


def _make_plan(
    name: str = "Marathon Build",
    start_date: str = "2025-01-06",
    end_date: str = "2025-04-28",
    weekly_hours: float = 8.0,
    plan_structure: dict | None = None,
) -> dict:
    """Create a training plan dict matching TrainingPlanRow fields."""
    return {
        "id": "plan-001",
        "user_id": "user-001",
        "goal_id": "goal-001",
        "name": name,
        "status": "active",
        "race_date": "2025-05-01",
        "start_date": start_date,
        "end_date": end_date,
        "weekly_hours": weekly_hours,
        "plan_structure": plan_structure or {
            "total_weeks": 16,
            "phases": [
                {"name": "Base", "weeks": [1, 2, 3, 4, 5, 6], "focus": "Aerobic foundation"},
                {"name": "Build", "weeks": [7, 8, 9, 10, 11], "focus": "Race-specific intensity"},
                {"name": "Peak", "weeks": [12, 13, 14], "focus": "Race simulation"},
                {"name": "Taper", "weeks": [15, 16], "focus": "Volume reduction"},
            ],
        },
        "adjustments": [],
        "created_at": "2025-01-06T00:00:00Z",
        "updated_at": "2025-01-06T00:00:00Z",
    }


def _make_workout(
    name: str = "Easy Run",
    discipline: str = "RUN",
    plan_day: int = 0,
    duration_seconds: int = 2700,
    tss: float = 35.0,
    scheduled_date: str | None = None,
) -> dict:
    """Create a workout dict matching WorkoutRow fields."""
    return {
        "id": f"w-{plan_day}",
        "user_id": "user-001",
        "name": name,
        "discipline": discipline,
        "builder_type": "endurance",
        "description": f"{name} description",
        "content": {},
        "estimated_duration_seconds": duration_seconds,
        "estimated_tss": tss,
        "estimated_volume_kg": None,
        "garmin_workout_id": None,
        "is_template": False,
        "scheduled_date": scheduled_date,
        "plan_id": "plan-001",
        "plan_week": 3,
        "plan_day": plan_day,
        "created_at": "2025-01-06T00:00:00Z",
        "updated_at": "2025-01-06T00:00:00Z",
    }


# ---------------------------------------------------------------------------
# Tests for _day_name
# ---------------------------------------------------------------------------


class TestDayName:
    def test_all_days(self):
        assert _day_name(0) == "Monday"
        assert _day_name(1) == "Tuesday"
        assert _day_name(2) == "Wednesday"
        assert _day_name(3) == "Thursday"
        assert _day_name(4) == "Friday"
        assert _day_name(5) == "Saturday"
        assert _day_name(6) == "Sunday"

    def test_out_of_range(self):
        assert _day_name(7) == "Day 7"
        assert _day_name(-1) == "Day -1"


# ---------------------------------------------------------------------------
# Tests for _build_active_plan_section
# ---------------------------------------------------------------------------


class TestBuildActivePlanSection:
    def test_no_active_plan_returns_none(self):
        """When no active plan exists, returns None."""
        sb = _mock_sb_client(plan_data=[])
        result = asyncio.get_event_loop().run_until_complete(
            _build_active_plan_section("user-001", sb, date(2025, 1, 20))
        )
        assert result is None

    def test_active_plan_with_workouts(self):
        """When an active plan exists with workouts, returns formatted section."""
        # Plan starts 2025-01-06, today is 2025-01-22 → week 3
        plan = _make_plan(start_date="2025-01-06")
        workouts = [
            _make_workout("Easy Run", "RUN", plan_day=0, duration_seconds=2700, tss=35),
            _make_workout("Swim Drills", "SWIM", plan_day=1, duration_seconds=3600, tss=45),
            _make_workout("Strength", "STRENGTH", plan_day=3, duration_seconds=2700, tss=30),
        ]
        sb = _mock_sb_client(plan_data=[plan], workout_data=workouts)
        today = date(2025, 1, 22)  # Wednesday (weekday=2)

        result = asyncio.get_event_loop().run_until_complete(
            _build_active_plan_section("user-001", sb, today)
        )

        assert result is not None
        assert "## Active Training Plan" in result
        assert "Marathon Build" in result
        assert "Base" in result  # Week 3 is in Base phase
        assert "Week 3/16" in result
        assert "8.0h" in result
        assert "### This Week's Workouts" in result
        # Monday (day 0) and Tuesday (day 1) are before Wednesday → completed
        assert "Monday: RUN — Easy Run" in result
        assert "[completed]" in result
        # Thursday (day 3) is after Wednesday → upcoming
        assert "Thursday: STRENGTH — Strength" in result
        assert "[upcoming]" in result

    def test_active_plan_no_workouts(self):
        """When an active plan exists but no workouts this week, shows empty message."""
        plan = _make_plan(start_date="2025-01-06")
        sb = _mock_sb_client(plan_data=[plan], workout_data=[])
        today = date(2025, 1, 22)

        result = asyncio.get_event_loop().run_until_complete(
            _build_active_plan_section("user-001", sb, today)
        )

        assert result is not None
        assert "## Active Training Plan" in result
        assert "No workouts scheduled this week." in result

    def test_phase_detection_build(self):
        """Correctly identifies Build phase when current week is in Build range."""
        # Plan starts 2025-01-06, today is 2025-02-24 → week 8 (Build phase)
        plan = _make_plan(start_date="2025-01-06")
        sb = _mock_sb_client(plan_data=[plan], workout_data=[])
        today = date(2025, 2, 24)  # 49 days after start → week 8

        result = asyncio.get_event_loop().run_until_complete(
            _build_active_plan_section("user-001", sb, today)
        )

        assert "Build" in result
        assert "Week 8/16" in result

    def test_unknown_phase_when_week_not_in_any_phase(self):
        """Shows 'Unknown' phase when current week doesn't match any phase."""
        plan = _make_plan(
            start_date="2025-01-06",
            plan_structure={"total_weeks": 16, "phases": []},
        )
        sb = _mock_sb_client(plan_data=[plan], workout_data=[])
        today = date(2025, 1, 22)

        result = asyncio.get_event_loop().run_until_complete(
            _build_active_plan_section("user-001", sb, today)
        )

        assert "Unknown" in result

    def test_total_weeks_from_dates_when_missing_from_structure(self):
        """Calculates total_weeks from start/end dates when not in plan_structure."""
        plan = _make_plan(
            start_date="2025-01-06",
            end_date="2025-04-28",
            plan_structure={"phases": []},  # no total_weeks
        )
        sb = _mock_sb_client(plan_data=[plan], workout_data=[])
        today = date(2025, 1, 22)

        result = asyncio.get_event_loop().run_until_complete(
            _build_active_plan_section("user-001", sb, today)
        )

        # 2025-01-06 to 2025-04-28 = 112 days → 16 weeks
        assert "Week 3/17" in result

    def test_workout_status_uses_scheduled_date(self):
        """When workout has scheduled_date, uses it for status determination."""
        plan = _make_plan(start_date="2025-01-06")
        workouts = [
            _make_workout("Past Run", "RUN", plan_day=0, scheduled_date="2025-01-20"),
            _make_workout("Future Swim", "SWIM", plan_day=4, scheduled_date="2025-01-24"),
        ]
        sb = _mock_sb_client(plan_data=[plan], workout_data=workouts)
        today = date(2025, 1, 22)

        result = asyncio.get_event_loop().run_until_complete(
            _build_active_plan_section("user-001", sb, today)
        )

        lines = result.split("\n")
        past_line = [l for l in lines if "Past Run" in l][0]
        future_line = [l for l in lines if "Future Swim" in l][0]
        assert "[completed]" in past_line
        assert "[upcoming]" in future_line

    def test_duration_formatting(self):
        """Workout duration is shown in minutes."""
        plan = _make_plan(start_date="2025-01-06")
        workouts = [
            _make_workout("Long Run", "RUN", plan_day=5, duration_seconds=5400, tss=120),
        ]
        sb = _mock_sb_client(plan_data=[plan], workout_data=workouts)
        today = date(2025, 1, 22)

        result = asyncio.get_event_loop().run_until_complete(
            _build_active_plan_section("user-001", sb, today)
        )

        assert "90min" in result
        assert "TSS:120" in result
