"""Integration tests for build_dashboard_overview.

Tests verify the API response structure remains correct after refactoring.
All Supabase calls are mocked so no database is required.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.dashboard import build_dashboard_overview


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(user_id: str = "user-123") -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.garmin_last_sync_at = "2024-01-15T08:00:00Z"
    return user


def _make_supabase_response(data: list) -> MagicMock:
    """Create a mock Supabase query response."""
    res = MagicMock()
    res.data = data
    return res


def _make_supabase_client(
    activities: list | None = None,
    health: list | None = None,
    workouts: list | None = None,
    goals: list | None = None,
    briefings: list | None = None,
    training_plans: list | None = None,
) -> MagicMock:
    """Create a mock Supabase async client that returns the given data."""
    sb = MagicMock()

    # Build a chainable query mock that returns the right data per table
    def make_query_chain(data):
        chain = MagicMock()
        chain.select = MagicMock(return_value=chain)
        chain.eq = MagicMock(return_value=chain)
        chain.gte = MagicMock(return_value=chain)
        chain.lte = MagicMock(return_value=chain)
        chain.order = MagicMock(return_value=chain)
        chain.limit = MagicMock(return_value=chain)
        chain.single = MagicMock(return_value=chain)
        chain.upsert = MagicMock(return_value=chain)
        chain.execute = AsyncMock(return_value=_make_supabase_response(data or []))
        return chain

    def table_side_effect(table_name: str):
        if table_name == "activities":
            return make_query_chain(activities)
        if table_name == "daily_health":
            return make_query_chain(health)
        if table_name == "workouts":
            return make_query_chain(workouts)
        if table_name == "goals":
            return make_query_chain(goals)
        if table_name == "daily_briefings":
            return make_query_chain(briefings)
        if table_name == "training_plans":
            return make_query_chain(training_plans)
        return make_query_chain([])

    sb.table = MagicMock(side_effect=table_side_effect)
    return sb


def _make_activity_dict(
    user_id: str = "user-123",
    discipline: str = "RUN",
    start_time: str = "2024-01-15T08:00:00Z",
    duration_seconds: int = 3600,
    distance_meters: int = 10000,
) -> dict:
    return {
        "id": "act-1",
        "user_id": user_id,
        "garmin_activity_id": 12345,
        "discipline": discipline,
        "name": "Morning Run",
        "start_time": start_time,
        "duration_seconds": duration_seconds,
        "distance_meters": distance_meters,
        "elevation_gain_meters": 50,
        "avg_hr": 145,
        "avg_pace_sec_per_km": 330,
        "avg_power_watts": None,
        "tss": 60.0,
        "total_sets": None,
        "total_volume_kg": None,
        "session_type": None,
        "calories": 500,
        "created_at": "2024-01-15T09:00:00Z",
        "updated_at": "2024-01-15T09:00:00Z",
    }


def _make_health_dict(
    user_id: str = "user-123",
    date_str: str = "2024-01-15",
) -> dict:
    return {
        "id": "health-1",
        "user_id": user_id,
        "date": date_str,
        "sleep_score": 80,
        "sleep_duration_seconds": 28800,
        "hrv_last_night": 65.0,
        "resting_hr": 52,
        "respiration_avg": 14.5,
        "stress_avg": 25,
        "spo2_avg": 98.0,
        "morning_readiness_score": 72,
        "body_battery_high": 85,
        "steps": 8000,
        "daily_calories": 2200,
        "created_at": "2024-01-15T10:00:00Z",
        "updated_at": "2024-01-15T10:00:00Z",
    }


def _make_workout_dict(
    user_id: str = "user-123",
    workout_id: str = "workout-1",
    discipline: str = "RUN",
    scheduled_date: str = "2024-01-15",
    plan_id: str | None = "active-plan",
) -> dict:
    return {
        "id": workout_id,
        "user_id": user_id,
        "name": "Workout",
        "discipline": discipline,
        "builder_type": "endurance",
        "description": "Planned session",
        "content": {},
        "estimated_duration_seconds": 3600,
        "estimated_tss": 50,
        "scheduled_date": scheduled_date,
        "plan_id": plan_id,
        "plan_week": 1,
        "plan_day": 1,
        "is_template": False,
        "created_at": "2024-01-15T08:00:00Z",
        "updated_at": "2024-01-15T08:00:00Z",
    }


def _make_plan_dict(plan_id: str = "active-plan", status: str = "active") -> dict:
    return {
        "id": plan_id,
        "status": status,
        "created_at": "2024-01-15T08:00:00Z",
    }


# ---------------------------------------------------------------------------
# Integration tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dashboard_overview_structure_with_data():
    """Verify the response structure when data is present."""
    user = _make_user()
    activity = _make_activity_dict()
    health = _make_health_dict()
    sb = _make_supabase_client(
        activities=[activity],
        health=[health],
        workouts=[],
        goals=[],
        briefings=[],
    )

    with patch("app.services.dashboard.get_fitness_timeline", new_callable=AsyncMock) as mock_fitness:
        mock_fitness.return_value = [
            {"date": "2024-01-15", "ctl": 45.0, "atl": 50.0, "tsb": -5.0, "daily_tss": 60.0}
        ]
        result = await build_dashboard_overview(user, sb, timezone_name="UTC")

    # Top-level keys
    assert "generated_at" in result
    assert "timezone" in result
    assert "last_sync_at" in result
    assert "recovery" in result
    assert "activity" in result
    assert "briefing" in result
    assert "recent_activities" in result
    assert "upcoming_workouts" in result
    assert "fitness_timeline" in result

    # Recovery structure
    recovery = result["recovery"]
    assert "status" in recovery
    assert recovery["status"] in ("strong", "strained", "steady")
    assert "headline" in recovery
    assert "last_night" in recovery
    assert "metrics" in recovery
    assert "sparkline" in recovery
    assert len(recovery["sparkline"]) == 30  # Always 30 days
    assert all(metric["key"] != "body_battery_high" for metric in recovery["metrics"])
    assert all("body_battery" not in point for point in recovery["sparkline"])

    # Activity structure
    activity_data = result["activity"]
    assert "status" in activity_data
    assert activity_data["status"] in ("idle", "overreaching", "building", "lighter", "steady")
    assert "headline" in activity_data
    assert "movement" in activity_data
    assert "last_7d" in activity_data
    assert "previous_7d" in activity_data
    assert "last_30d" in activity_data
    assert "fitness" in activity_data
    assert "planned" in activity_data

    # Fitness structure
    fitness = activity_data["fitness"]
    assert "ctl" in fitness
    assert "atl" in fitness
    assert "tsb" in fitness
    assert "direction" in fitness
    assert fitness["direction"] in ("unknown", "fatigued", "training", "fresh", "balanced")

    # Recent activities
    assert isinstance(result["recent_activities"], list)
    if result["recent_activities"]:
        act = result["recent_activities"][0]
        assert "id" in act
        assert "discipline" in act
        assert "start_time" in act


@pytest.mark.asyncio
async def test_dashboard_overview_with_no_data():
    """Verify the response structure when user has no activities or health data."""
    user = _make_user()
    sb = _make_supabase_client(
        activities=[],
        health=[],
        workouts=[],
        goals=[],
        briefings=[],
    )

    with patch("app.services.dashboard.get_fitness_timeline", new_callable=AsyncMock) as mock_fitness:
        mock_fitness.return_value = []
        result = await build_dashboard_overview(user, sb, timezone_name="UTC")

    # Should still return valid structure
    assert result["recovery"]["status"] == "steady"
    assert result["activity"]["status"] == "idle"
    assert result["recent_activities"] == []
    assert result["upcoming_workouts"] == []
    assert result["fitness_timeline"] == []
    assert result["briefing"] is None  # No data → no briefing

    # last_night should have all None values
    last_night = result["recovery"]["last_night"]
    assert last_night["date"] is None
    assert last_night["sleep_score"] is None

    # Fitness should have all None values
    fitness = result["activity"]["fitness"]
    assert fitness["ctl"] is None
    assert fitness["atl"] is None
    assert fitness["tsb"] is None
    assert fitness["direction"] == "unknown"


@pytest.mark.asyncio
async def test_dashboard_timezone_handling():
    """Verify timezone is reflected in the response."""
    user = _make_user()
    sb = _make_supabase_client(activities=[], health=[], workouts=[], goals=[], briefings=[])

    with patch("app.services.dashboard.get_fitness_timeline", new_callable=AsyncMock) as mock_fitness:
        mock_fitness.return_value = []

        result_utc = await build_dashboard_overview(user, sb, timezone_name="UTC")
        result_ny = await build_dashboard_overview(user, sb, timezone_name="America/New_York")

    assert result_utc["timezone"] == "UTC"
    assert result_ny["timezone"] == "America/New_York"


@pytest.mark.asyncio
async def test_dashboard_recent_activities_limited_to_6():
    """Verify recent_activities is capped at 6 items."""
    user = _make_user()
    # Create 10 activities
    activities = [
        _make_activity_dict(start_time=f"2024-01-{15 - i:02d}T08:00:00Z")
        for i in range(10)
    ]
    # Give each a unique id
    for i, act in enumerate(activities):
        act["id"] = f"act-{i}"

    sb = _make_supabase_client(
        activities=activities,
        health=[],
        workouts=[],
        goals=[],
        briefings=[],
    )

    with patch("app.services.dashboard.get_fitness_timeline", new_callable=AsyncMock) as mock_fitness:
        mock_fitness.return_value = []
        result = await build_dashboard_overview(user, sb, timezone_name="UTC")

    assert len(result["recent_activities"]) <= 6


@pytest.mark.asyncio
async def test_dashboard_sparkline_always_30_days():
    """Verify health sparkline always contains exactly 30 data points."""
    user = _make_user()
    # Only 3 days of health data
    health = [_make_health_dict(date_str=f"2024-01-{15 - i:02d}") for i in range(3)]

    sb = _make_supabase_client(
        activities=[],
        health=health,
        workouts=[],
        goals=[],
        briefings=[],
    )

    with patch("app.services.dashboard.get_fitness_timeline", new_callable=AsyncMock) as mock_fitness:
        mock_fitness.return_value = []
        result = await build_dashboard_overview(user, sb, timezone_name="UTC")

    assert len(result["recovery"]["sparkline"]) == 30


@pytest.mark.asyncio
async def test_dashboard_briefing_receives_only_same_day_planned_workouts():
    """Verify briefing generation receives only workouts scheduled for the local date."""
    user = _make_user()
    today = date.today().isoformat()
    workouts = [
        _make_workout_dict(workout_id="w-today", discipline="RUN", scheduled_date=today),
        _make_workout_dict(workout_id="w-future", discipline="SWIM", scheduled_date="2099-01-01"),
    ]
    sb = _make_supabase_client(
        activities=[],
        health=[],
        workouts=workouts,
        goals=[],
        briefings=[],
        training_plans=[_make_plan_dict(plan_id="active-plan")],
    )

    with (
        patch("app.services.dashboard.get_fitness_timeline", new_callable=AsyncMock) as mock_fitness,
        patch("app.services.dashboard._resolve_briefing", new_callable=AsyncMock) as mock_briefing,
    ):
        mock_fitness.return_value = []
        mock_briefing.return_value = None
        await build_dashboard_overview(user, sb, timezone_name="UTC")

    planned_workouts = mock_briefing.await_args.kwargs["planned_workouts"]
    assert planned_workouts == [{
        "id": "w-today",
        "discipline": "RUN",
        "scheduled_date": today,
        "estimated_duration_seconds": 3600,
        "estimated_tss": 50,
    }]


@pytest.mark.asyncio
async def test_dashboard_uses_active_plan_workouts_only_for_upcoming_and_briefing():
    """Archived-plan and orphan workouts should not leak into the dashboard briefing."""
    user = _make_user()
    today = date.today().isoformat()
    workouts = [
        _make_workout_dict(workout_id="w-active", discipline="MOBILITY", scheduled_date=today, plan_id="active-plan"),
        _make_workout_dict(workout_id="w-archived", discipline="RUN", scheduled_date=today, plan_id="archived-plan"),
        _make_workout_dict(workout_id="w-orphan", discipline="RUN", scheduled_date=today, plan_id=None),
    ]
    sb = _make_supabase_client(
        activities=[],
        health=[],
        workouts=workouts,
        goals=[],
        briefings=[],
        training_plans=[_make_plan_dict(plan_id="active-plan")],
    )

    with (
        patch("app.services.dashboard.get_fitness_timeline", new_callable=AsyncMock) as mock_fitness,
        patch("app.services.dashboard._resolve_briefing", new_callable=AsyncMock) as mock_briefing,
    ):
        mock_fitness.return_value = []
        mock_briefing.return_value = None
        result = await build_dashboard_overview(user, sb, timezone_name="UTC")

    assert [workout["id"] for workout in result["upcoming_workouts"]] == ["w-active"]
    planned_workouts = mock_briefing.await_args.kwargs["planned_workouts"]
    assert planned_workouts == [{
        "id": "w-active",
        "discipline": "MOBILITY",
        "scheduled_date": today,
        "estimated_duration_seconds": 3600,
        "estimated_tss": 50,
    }]
