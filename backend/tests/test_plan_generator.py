"""Unit tests for plan_generator service."""

import json
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.plan_generator import (
    VALID_DISCIPLINES,
    build_plan_context,
    parse_plan_response,
    _safe_avg,
)
from app.models import GoalRow


# ---------------------------------------------------------------------------
# parse_plan_response tests
# ---------------------------------------------------------------------------


class TestParsePlanResponse:
    """Tests for parse_plan_response — JSON parsing with fallback handling."""

    def _make_valid_plan(self, **overrides) -> dict:
        """Build a minimal valid plan dict."""
        plan = {
            "plan_name": "Test Plan — 12 Weeks",
            "phases": [
                {"name": "Base", "weeks": [1, 2, 3], "focus": "Aerobic", "weekly_tss_range": [200, 300]},
            ],
            "weekly_hours_distribution": {
                "swim": 0.15, "bike": 0.35, "run": 0.30,
                "strength": 0.12, "mobility": 0.08,
            },
            "recovery_week_pattern": [3, 1],
            "weeks": [
                {
                    "week_number": 1,
                    "phase": "Base",
                    "target_tss": 250,
                    "workouts": [
                        {
                            "day": 0,
                            "discipline": "RUN",
                            "name": "Easy Run",
                            "builder_type": "endurance",
                            "duration_minutes": 45,
                            "estimated_tss": 35,
                            "content": {
                                "type": "easy",
                                "warmup": {"duration_min": 5, "zone": "Z1", "description": "Jog"},
                                "main": [{"duration_min": 35, "zone": "Z2", "description": "Steady"}],
                                "cooldown": {"duration_min": 5, "zone": "Z1", "description": "Walk"},
                                "target_tss": 35,
                                "notes": "Easy pace",
                            },
                            "description": "Easy aerobic run",
                        },
                    ],
                },
            ],
        }
        plan.update(overrides)
        return plan

    def test_valid_json_parsed_correctly(self):
        plan = self._make_valid_plan()
        result = parse_plan_response(json.dumps(plan))
        assert result["plan_name"] == "Test Plan — 12 Weeks"
        assert len(result["weeks"]) == 1
        assert result["weeks"][0]["workouts"][0]["discipline"] == "RUN"

    def test_markdown_fenced_json_parsed(self):
        plan = self._make_valid_plan()
        text = f"```json\n{json.dumps(plan)}\n```"
        result = parse_plan_response(text)
        assert result["plan_name"] == "Test Plan — 12 Weeks"
        assert len(result["weeks"]) == 1

    def test_json_with_surrounding_text(self):
        plan = self._make_valid_plan()
        text = f"Here is the plan:\n{json.dumps(plan)}\nEnd of plan."
        result = parse_plan_response(text)
        assert result["plan_name"] == "Test Plan — 12 Weeks"

    def test_completely_invalid_text_returns_defaults(self):
        result = parse_plan_response("This is not JSON at all")
        assert result["plan_name"] == "Training Plan"
        assert result["phases"] == []
        assert result["weeks"] == []
        assert isinstance(result["weekly_hours_distribution"], dict)
        assert isinstance(result["recovery_week_pattern"], list)

    def test_empty_string_returns_defaults(self):
        result = parse_plan_response("")
        assert result["plan_name"] == "Training Plan"
        assert result["weeks"] == []

    def test_missing_plan_name_gets_default(self):
        plan = self._make_valid_plan()
        del plan["plan_name"]
        result = parse_plan_response(json.dumps(plan))
        assert result["plan_name"] == "Training Plan"

    def test_missing_phases_gets_default(self):
        plan = self._make_valid_plan()
        del plan["phases"]
        result = parse_plan_response(json.dumps(plan))
        assert result["phases"] == []

    def test_missing_weekly_hours_distribution_gets_default(self):
        plan = self._make_valid_plan()
        del plan["weekly_hours_distribution"]
        result = parse_plan_response(json.dumps(plan))
        assert "swim" in result["weekly_hours_distribution"]
        assert "bike" in result["weekly_hours_distribution"]

    def test_missing_recovery_week_pattern_gets_default(self):
        plan = self._make_valid_plan()
        del plan["recovery_week_pattern"]
        result = parse_plan_response(json.dumps(plan))
        assert result["recovery_week_pattern"] == [3, 1]

    def test_invalid_discipline_mapped_to_valid(self):
        plan = self._make_valid_plan()
        plan["weeks"][0]["workouts"][0]["discipline"] = "CYCLING"
        result = parse_plan_response(json.dumps(plan))
        assert result["weeks"][0]["workouts"][0]["discipline"] == "RIDE_ROAD"

    def test_bike_discipline_mapped(self):
        plan = self._make_valid_plan()
        plan["weeks"][0]["workouts"][0]["discipline"] = "BIKE"
        result = parse_plan_response(json.dumps(plan))
        assert result["weeks"][0]["workouts"][0]["discipline"] == "RIDE_ROAD"

    def test_yoga_discipline_mapped(self):
        plan = self._make_valid_plan()
        plan["weeks"][0]["workouts"][0]["discipline"] = "yoga"
        result = parse_plan_response(json.dumps(plan))
        assert result["weeks"][0]["workouts"][0]["discipline"] == "YOGA"

    def test_all_valid_disciplines_accepted(self):
        for disc in VALID_DISCIPLINES:
            plan = self._make_valid_plan()
            plan["weeks"][0]["workouts"][0]["discipline"] = disc
            result = parse_plan_response(json.dumps(plan))
            assert result["weeks"][0]["workouts"][0]["discipline"] == disc

    def test_workout_missing_fields_get_defaults(self):
        plan = self._make_valid_plan()
        # Strip workout to bare minimum
        plan["weeks"][0]["workouts"] = [{"discipline": "SWIM"}]
        result = parse_plan_response(json.dumps(plan))
        workout = result["weeks"][0]["workouts"][0]
        assert workout["day"] == 0
        assert workout["name"] == "SWIM Workout"
        assert workout["builder_type"] == "endurance"
        assert workout["duration_minutes"] == 30
        assert workout["estimated_tss"] == 30
        assert isinstance(workout["content"], dict)
        assert workout["description"] == "SWIM Workout"

    def test_week_missing_fields_get_defaults(self):
        plan = self._make_valid_plan()
        plan["weeks"] = [{"workouts": []}]
        result = parse_plan_response(json.dumps(plan))
        week = result["weeks"][0]
        assert week["week_number"] == 1
        assert week["phase"] == "Base"
        assert week["target_tss"] == 200


# ---------------------------------------------------------------------------
# _safe_avg tests
# ---------------------------------------------------------------------------


class TestSafeAvg:
    def test_normal_values(self):
        assert _safe_avg([10, 20, 30]) == 20.0

    def test_empty_list(self):
        assert _safe_avg([]) == 0.0

    def test_all_none(self):
        assert _safe_avg([None, None]) == 0.0

    def test_mixed_none_and_values(self):
        assert _safe_avg([10, None, 30]) == 20.0


@pytest.mark.asyncio
async def test_build_plan_context_includes_athlete_notes(monkeypatch):
    profile = SimpleNamespace(
        ftp_watts=None,
        threshold_pace_sec_per_km=None,
        swim_css_sec_per_100m=None,
        max_hr=None,
        resting_hr=None,
        weight_kg=None,
        squat_1rm_kg=None,
        deadlift_1rm_kg=None,
        bench_1rm_kg=None,
        overhead_press_1rm_kg=None,
        weekly_training_hours=8,
        notes="Right knee pain: avoid heavy plyometrics and downhill running.",
    )

    async def fake_profile(*_args, **_kwargs):
        return profile

    async def fake_fitness_timeline(*_args, **_kwargs):
        return []

    monkeypatch.setattr("app.services.plan_generator.get_effective_athlete_profile", fake_profile)
    monkeypatch.setattr("app.services.plan_generator.get_fitness_timeline", fake_fitness_timeline)

    def _chain(data):
        result = MagicMock()
        result.data = data

        query = MagicMock()
        query.select.return_value = query
        query.eq.return_value = query
        query.gte.return_value = query
        query.order.return_value = query
        query.execute = AsyncMock(return_value=result)
        return query

    sb = MagicMock()
    sb.table.side_effect = lambda _name: _chain([])

    goal = GoalRow(
        id="goal-1",
        user_id="user-1",
        description="Spring Half Marathon",
        target_date=(date.today() + timedelta(days=70)).isoformat(),
        sport="RUN",
        is_active=True,
    )

    context = await build_plan_context("user-1", goal, sb)

    assert "Athlete notes: Right knee pain: avoid heavy plyometrics and downhill running." in context
