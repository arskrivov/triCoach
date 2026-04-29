"""Property-based tests for the AI Coach briefing pipeline.

Uses Hypothesis to verify correctness properties defined in the design document.
Each test is tagged with the property number and the requirements it validates.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from hypothesis import given, settings, strategies as st

from app.models import ActivityRow, DailyHealthRow
from app.services.dashboard import _build_daily_prompt_digest, _format_health_for_prompt


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

# Strategy for generating arbitrary DailyHealthRow instances with random metric values.
daily_health_row_strategy = st.builds(
    DailyHealthRow,
    id=st.just("test-id"),
    user_id=st.just("test-user"),
    date=st.just("2024-01-15"),
    resting_hr=st.one_of(st.none(), st.integers(min_value=30, max_value=120)),
    hrv_last_night=st.one_of(st.none(), st.floats(min_value=1.0, max_value=200.0, allow_nan=False, allow_infinity=False)),
    sleep_score=st.one_of(st.none(), st.integers(min_value=0, max_value=100)),
    sleep_duration_seconds=st.one_of(st.none(), st.integers(min_value=0, max_value=43200)),
    stress_avg=st.one_of(st.none(), st.integers(min_value=0, max_value=100)),
    spo2_avg=st.one_of(st.none(), st.floats(min_value=80.0, max_value=100.0, allow_nan=False, allow_infinity=False)),
    respiration_avg=st.one_of(st.none(), st.floats(min_value=8.0, max_value=30.0, allow_nan=False, allow_infinity=False)),
    morning_readiness_score=st.one_of(st.none(), st.integers(min_value=0, max_value=100)),
    steps=st.one_of(st.none(), st.integers(min_value=0, max_value=50000)),
    daily_calories=st.one_of(st.none(), st.integers(min_value=0, max_value=10000)),
)


# ---------------------------------------------------------------------------
# Property 1: Today's health entry nulls partial metrics but preserves
#              recovery metrics
# Feature: ai-coach-insights, Property 1: Today's health entry nulls partial
#          metrics but preserves recovery metrics
# **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
# ---------------------------------------------------------------------------


class TestProperty1TodayHealthNullsPartialMetrics:
    """For any DailyHealthRow, _format_health_for_prompt(health, is_today=True)
    returns steps=None and daily_calories=None while preserving recovery metrics.
    _format_health_for_prompt(health, is_today=False) preserves all fields."""

    @given(health=daily_health_row_strategy)
    @settings(max_examples=100)
    def test_is_today_true_nulls_steps_and_calories(self, health: DailyHealthRow):
        """When is_today=True, steps and daily_calories must be None."""
        result = _format_health_for_prompt(health, is_today=True)
        assert result["steps"] is None, f"steps should be None for today, got {result['steps']}"
        assert result["daily_calories"] is None, f"daily_calories should be None for today, got {result['daily_calories']}"

    @given(health=daily_health_row_strategy)
    @settings(max_examples=100)
    def test_is_today_true_preserves_recovery_metrics(self, health: DailyHealthRow):
        """When is_today=True, recovery metrics are preserved from the input row."""
        result = _format_health_for_prompt(health, is_today=True)

        # Recovery metrics should match the input (via _to_float conversion)
        def _expected_float(val):
            if val is None:
                return None
            try:
                return float(val)
            except (TypeError, ValueError):
                return None

        assert result["sleep_score"] == _expected_float(health.sleep_score)
        if health.sleep_duration_seconds:
            assert result["sleep_hours"] == round(health.sleep_duration_seconds / 3600, 1)
        else:
            assert result["sleep_hours"] is None
        assert result["hrv_ms"] == _expected_float(health.hrv_last_night)
        assert result["resting_hr"] == _expected_float(health.resting_hr)
        assert result["readiness"] == _expected_float(health.morning_readiness_score)
        assert result["stress"] == _expected_float(health.stress_avg)
        assert result["spo2"] == _expected_float(health.spo2_avg)
        assert result["respiration"] == _expected_float(health.respiration_avg)

    @given(health=daily_health_row_strategy)
    @settings(max_examples=100)
    def test_is_today_false_preserves_all_fields(self, health: DailyHealthRow):
        """When is_today=False (default), all fields including steps and
        daily_calories are preserved from the input row."""
        result = _format_health_for_prompt(health, is_today=False)

        def _expected_float(val):
            if val is None:
                return None
            try:
                return float(val)
            except (TypeError, ValueError):
                return None

        assert result["steps"] == _expected_float(health.steps)
        assert result["daily_calories"] == _expected_float(health.daily_calories)
        assert result["sleep_score"] == _expected_float(health.sleep_score)
        assert result["hrv_ms"] == _expected_float(health.hrv_last_night)
        assert result["resting_hr"] == _expected_float(health.resting_hr)
        assert result["readiness"] == _expected_float(health.morning_readiness_score)
        assert result["stress"] == _expected_float(health.stress_avg)
        assert result["spo2"] == _expected_float(health.spo2_avg)
        assert result["respiration"] == _expected_float(health.respiration_avg)


# ---------------------------------------------------------------------------
# Shared strategies for digest-level tests
# ---------------------------------------------------------------------------

# Strategy for generating a random date within a reasonable range.
_date_strategy = st.dates(min_value=date(2023, 1, 8), max_value=date(2025, 12, 31))

# Strategy for generating a list of DailyHealthRow instances covering a 7-day
# window around a given date.  The date field is set by the test to match the
# window, so we use a placeholder here.
_health_row_for_date_strategy = st.builds(
    DailyHealthRow,
    id=st.just("test-id"),
    user_id=st.just("test-user"),
    date=st.just("placeholder"),  # overridden per-day in the test
    resting_hr=st.one_of(st.none(), st.integers(min_value=30, max_value=120)),
    hrv_last_night=st.one_of(
        st.none(),
        st.floats(min_value=1.0, max_value=200.0, allow_nan=False, allow_infinity=False),
    ),
    sleep_score=st.one_of(st.none(), st.integers(min_value=0, max_value=100)),
    sleep_duration_seconds=st.one_of(st.none(), st.integers(min_value=0, max_value=43200)),
    stress_avg=st.one_of(st.none(), st.integers(min_value=0, max_value=100)),
    spo2_avg=st.one_of(
        st.none(),
        st.floats(min_value=80.0, max_value=100.0, allow_nan=False, allow_infinity=False),
    ),
    respiration_avg=st.one_of(
        st.none(),
        st.floats(min_value=8.0, max_value=30.0, allow_nan=False, allow_infinity=False),
    ),
    morning_readiness_score=st.one_of(st.none(), st.integers(min_value=0, max_value=100)),
    steps=st.one_of(st.none(), st.integers(min_value=0, max_value=50000)),
    daily_calories=st.one_of(st.none(), st.integers(min_value=0, max_value=10000)),
)


def _health_rows_for_window(local_date: date, draw) -> list[DailyHealthRow]:
    """Draw 0-7 health rows with dates in the 7-day window ending at *local_date*."""
    rows: list[DailyHealthRow] = []
    for days_ago in range(6, -1, -1):
        include = draw(st.booleans())
        if include:
            row = draw(_health_row_for_date_strategy)
            day_str = (local_date - timedelta(days=days_ago)).isoformat()
            rows.append(row.model_copy(update={"date": day_str}))
    return rows


# Strategy for generating simple ActivityRow instances within a 7-day window.
def _activities_for_window(local_date: date, draw) -> list[ActivityRow]:
    """Draw 0-5 activities with start_time in the 7-day window."""
    count = draw(st.integers(min_value=0, max_value=5))
    activities: list[ActivityRow] = []
    for _ in range(count):
        days_ago = draw(st.integers(min_value=0, max_value=6))
        day = local_date - timedelta(days=days_ago)
        activities.append(
            ActivityRow(
                id="act-test",
                user_id="test-user",
                discipline="RUN",
                start_time=f"{day.isoformat()}T08:00:00+00:00",
                duration_seconds=draw(st.integers(min_value=600, max_value=7200)),
                distance_meters=draw(
                    st.floats(min_value=1000.0, max_value=42000.0, allow_nan=False, allow_infinity=False)
                ),
            )
        )
    return activities


# ---------------------------------------------------------------------------
# Property 4: Recency weights are present, sum to 1.0, and weight yesterday
#              highest
# Feature: ai-coach-insights, Property 4: Recency weights are present, sum
#          to 1.0, and weight yesterday highest
# **Validates: Requirements 3.1, 3.2**
# ---------------------------------------------------------------------------


class TestProperty4RecencyWeights:
    """For any 7-day digest produced by _build_daily_prompt_digest, every entry
    has a recency_weight float, all weights sum to 1.0 (±0.01), and yesterday's
    entry has weight ≥ 0.25."""

    @given(data=st.data())
    @settings(max_examples=100)
    def test_recency_weights_present_and_sum_to_one(self, data):
        """Every digest entry has recency_weight and all 7 sum to ~1.0."""
        local_date = data.draw(_date_strategy)
        health_rows = _health_rows_for_window(local_date, data.draw)
        activities = _activities_for_window(local_date, data.draw)
        tz = ZoneInfo("UTC")

        digest = _build_daily_prompt_digest(local_date, health_rows, activities, tz)

        assert len(digest) == 7, f"Expected 7 entries, got {len(digest)}"
        for entry in digest:
            assert "recency_weight" in entry, f"Missing recency_weight in entry {entry['date']}"
            assert isinstance(entry["recency_weight"], float), (
                f"recency_weight should be float, got {type(entry['recency_weight'])}"
            )

        total_weight = sum(entry["recency_weight"] for entry in digest)
        assert abs(total_weight - 1.0) <= 0.01, (
            f"Weights should sum to ~1.0, got {total_weight}"
        )

    @given(data=st.data())
    @settings(max_examples=100)
    def test_yesterday_weight_at_least_025(self, data):
        """Yesterday's entry (index 5, days_ago=1) has weight ≥ 0.25."""
        local_date = data.draw(_date_strategy)
        health_rows = _health_rows_for_window(local_date, data.draw)
        activities = _activities_for_window(local_date, data.draw)
        tz = ZoneInfo("UTC")

        digest = _build_daily_prompt_digest(local_date, health_rows, activities, tz)

        yesterday = local_date - timedelta(days=1)
        yesterday_entry = next(
            (e for e in digest if e["date"] == yesterday.isoformat()), None
        )
        assert yesterday_entry is not None, "Yesterday's entry not found in digest"
        assert yesterday_entry["recency_weight"] >= 0.25, (
            f"Yesterday's weight should be >= 0.25, got {yesterday_entry['recency_weight']}"
        )


# ---------------------------------------------------------------------------
# Strategy for planned workout dicts
# ---------------------------------------------------------------------------

_planned_workout_strategy = st.fixed_dictionaries(
    {
        "name": st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=("L", "N", "Z"))),
        "discipline": st.sampled_from(["SWIM", "RUN", "RIDE_ROAD", "RIDE_GRAVEL", "STRENGTH", "YOGA", "MOBILITY", "OTHER"]),
        "scheduled_date": st.dates(min_value=date(2023, 1, 1), max_value=date(2025, 12, 31)).map(lambda d: d.isoformat()),
        "estimated_duration_seconds": st.integers(min_value=0, max_value=14400),
        "estimated_tss": st.one_of(
            st.none(),
            st.floats(min_value=0.0, max_value=500.0, allow_nan=False, allow_infinity=False),
        ),
        "description": st.one_of(st.none(), st.text(min_size=0, max_size=100)),
    }
)


# ---------------------------------------------------------------------------
# Property 3: Planned workouts round-trip through the AI prompt
# Feature: ai-coach-insights, Property 3: Planned workouts round-trip through
#          the AI prompt
# **Validates: Requirements 2.1, 2.2**
# ---------------------------------------------------------------------------

import json as _json

from app.services.dashboard import _build_ai_prompt


class TestProperty3PlannedWorkoutsRoundTrip:
    """For any list of planned workout dicts (including the empty list),
    calling _build_ai_prompt with that list and then parsing the resulting
    JSON produces a planned_workouts_today array with only the fields the
    model actually needs."""

    @given(planned=st.lists(_planned_workout_strategy, min_size=0, max_size=5))
    @settings(max_examples=100)
    def test_planned_workouts_present_in_prompt(self, planned: list[dict[str, Any]]):
        """planned_workouts_today in the prompt JSON is sanitized."""
        prompt_json = _build_ai_prompt(
            timezone_name="UTC",
            local_date=date(2024, 6, 15),
            health_rows_7d=[],
            activities_7d=[],
            goals=[],
            fitness={},
            planned_workouts=planned,
        )
        parsed = _json.loads(prompt_json)
        assert "planned_workouts_today" in parsed, "planned_workouts_today key missing from prompt"
        expected = [
            {
                "discipline": item["discipline"],
                "estimated_duration_seconds": item["estimated_duration_seconds"],
                "estimated_tss": item["estimated_tss"],
            }
            for item in planned
        ]
        assert parsed["planned_workouts_today"] == expected, (
            f"Expected {expected}, got {parsed['planned_workouts_today']}"
        )

    @given(data=st.data())
    @settings(max_examples=50)
    def test_none_planned_workouts_produces_empty_list(self, data):
        """When planned_workouts is None, planned_workouts_today is an empty list."""
        prompt_json = _build_ai_prompt(
            timezone_name="UTC",
            local_date=date(2024, 6, 15),
            health_rows_7d=[],
            activities_7d=[],
            goals=[],
            fitness={},
            planned_workouts=None,
        )
        parsed = _json.loads(prompt_json)
        assert "planned_workouts_today" in parsed, "planned_workouts_today key missing from prompt"
        assert parsed["planned_workouts_today"] == [], (
            f"Expected empty list for None input, got {parsed['planned_workouts_today']}"
        )


# ---------------------------------------------------------------------------
# Property 8: Heuristic briefing always produces exactly 2 recommendations
#              and a non-null caution
# Feature: ai-coach-insights, Property 8: Heuristic briefing always produces
#          exactly 2 recommendations and a non-null caution
# **Validates: Requirements 4.7, 7.1, 7.4**
# ---------------------------------------------------------------------------

from datetime import datetime, timezone as _tz

from app.services.dashboard import _heuristic_briefing

# Strategy for generating overview dicts with varying recovery and activity statuses.
_recovery_status_strategy = st.sampled_from(["strained", "strong", "steady"])
_activity_status_strategy = st.sampled_from(["idle", "overreaching", "building", "lighter", "steady"])


def _build_overview(draw) -> dict[str, Any]:
    """Draw a random overview dict with valid recovery and activity sections."""
    recovery_status = draw(_recovery_status_strategy)
    activity_status = draw(_activity_status_strategy)

    # Recovery headline varies by status
    headlines = {
        "strained": "Recovery is lagging behind your recent baseline.",
        "strong": "Recovery markers are trending well versus your recent baseline.",
        "steady": "Recovery is broadly stable with mixed signals.",
    }

    # Last night metrics — all optional
    last_night: dict[str, Any] = {
        "sleep_score": draw(st.one_of(st.none(), st.integers(min_value=0, max_value=100))),
        "sleep_duration_hours": draw(st.one_of(st.none(), st.floats(min_value=0.0, max_value=14.0, allow_nan=False, allow_infinity=False))),
        "hrv_last_night": draw(st.one_of(st.none(), st.floats(min_value=1.0, max_value=200.0, allow_nan=False, allow_infinity=False))),
        "resting_hr": draw(st.one_of(st.none(), st.integers(min_value=30, max_value=120))),
        "respiration_sleep": draw(st.one_of(st.none(), st.floats(min_value=8.0, max_value=30.0, allow_nan=False, allow_infinity=False))),
        "stress_avg": draw(st.one_of(st.none(), st.integers(min_value=0, max_value=100))),
        "pulse_ox_avg": draw(st.one_of(st.none(), st.floats(min_value=80.0, max_value=100.0, allow_nan=False, allow_infinity=False))),
        "morning_training_readiness_score": draw(st.one_of(st.none(), st.integers(min_value=0, max_value=100))),
    }

    # Activity headline varies by status
    activity_headlines = {
        "idle": "No meaningful training load has been recorded in the last 7 days.",
        "overreaching": "Load has risen while recovery signals are soft.",
        "building": "Training load is ramping up versus the previous week.",
        "lighter": "Training load is materially lighter than the previous week.",
        "steady": "Training load is stable versus the previous week.",
    }

    upcoming_count = draw(st.integers(min_value=0, max_value=10))
    completion_rate = draw(st.one_of(
        st.none(),
        st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
    ))

    return {
        "recovery": {
            "status": recovery_status,
            "headline": headlines[recovery_status],
            "last_night": last_night,
        },
        "activity": {
            "status": activity_status,
            "headline": activity_headlines[activity_status],
            "planned": {
                "upcoming_count": upcoming_count,
                "completion_rate_this_week": completion_rate,
            },
        },
    }


class TestProperty8HeuristicBriefingStructure:
    """For any overview dict with valid recovery and activity sections,
    _heuristic_briefing returns exactly 2 recommendations and a non-null,
    non-empty caution string."""

    @given(data=st.data())
    @settings(max_examples=100)
    def test_exactly_2_recommendations(self, data):
        """_heuristic_briefing always returns exactly 2 recommendations."""
        overview = _build_overview(data.draw)
        local_date = data.draw(_date_strategy)
        local_time = datetime.now(_tz.utc)

        result = _heuristic_briefing(overview, local_date, local_time)

        assert isinstance(result["recommendations"], list), (
            f"recommendations should be a list, got {type(result['recommendations'])}"
        )
        assert len(result["recommendations"]) == 2, (
            f"Expected exactly 2 recommendations, got {len(result['recommendations'])}: {result['recommendations']}"
        )

    @given(data=st.data())
    @settings(max_examples=100)
    def test_caution_non_null_non_empty(self, data):
        """_heuristic_briefing always returns a non-null, non-empty caution string."""
        overview = _build_overview(data.draw)
        local_date = data.draw(_date_strategy)
        local_time = datetime.now(_tz.utc)

        result = _heuristic_briefing(overview, local_date, local_time)

        assert result["caution"] is not None, "caution should never be None"
        assert isinstance(result["caution"], str), (
            f"caution should be a string, got {type(result['caution'])}"
        )
        assert len(result["caution"]) > 0, "caution should not be an empty string"


# ---------------------------------------------------------------------------
# Shared strategies for _parse_ai_briefing tests (Properties 5, 6, 7)
# ---------------------------------------------------------------------------

from app.services.dashboard import _parse_ai_briefing

# Strategy for generating a fallback dict with exactly 2 recommendations
# and a non-null caution, matching the heuristic output structure.
_fallback_recommendation_strategy = st.text(
    min_size=5, max_size=120,
    alphabet=st.characters(whitelist_categories=("L", "N", "Z", "P")),
)

_fallback_caution_strategy = st.text(
    min_size=5, max_size=120,
    alphabet=st.characters(whitelist_categories=("L", "N", "Z", "P")),
)


def _build_fallback(draw) -> dict[str, Any]:
    """Draw a fallback dict with exactly 2 recommendations and a non-null caution."""
    recs = [draw(_fallback_recommendation_strategy) for _ in range(2)]
    caution = draw(_fallback_caution_strategy)
    return {
        "source": "heuristic",
        "generated_for_date": "2024-06-15",
        "generated_at": "2024-06-15T12:00:00Z",
        "ai_enabled": True,
        "sleep_analysis": "Fallback sleep analysis.",
        "activity_analysis": "Fallback activity analysis.",
        "recommendations": recs,
        "caution": caution,
    }


# Strategy for generating a single recommendation string.
_ai_recommendation_strategy = st.text(
    min_size=1, max_size=120,
    alphabet=st.characters(whitelist_categories=("L", "N", "Z", "P")),
)


# ---------------------------------------------------------------------------
# Property 5: Parsed AI briefing always has exactly 2 recommendations
# Feature: ai-coach-insights, Property 5: Parsed AI briefing always has
#          exactly 2 recommendations
# **Validates: Requirements 4.6, 8.1, 8.2**
# ---------------------------------------------------------------------------


class TestProperty5ParsedBriefingExactly2Recommendations:
    """For any JSON with a recommendations array of any length and any fallback
    dict with 2 recommendations, _parse_ai_briefing returns exactly
    2 recommendations."""

    @given(data=st.data())
    @settings(max_examples=100)
    def test_any_length_recommendations_returns_exactly_2(self, data):
        """_parse_ai_briefing always returns exactly 2 recommendations
        regardless of how many the AI returned."""
        fallback = _build_fallback(data.draw)
        num_recs = data.draw(st.integers(min_value=0, max_value=10))
        ai_recs = [data.draw(_ai_recommendation_strategy) for _ in range(num_recs)]

        ai_response = _json.dumps({
            "sleep_analysis": "AI sleep analysis.",
            "activity_analysis": "AI activity analysis.",
            "recommendations": ai_recs,
            "caution": "AI caution sentence.",
        })

        result = _parse_ai_briefing(ai_response, fallback)

        assert isinstance(result["recommendations"], list), (
            f"recommendations should be a list, got {type(result['recommendations'])}"
        )
        assert len(result["recommendations"]) == 2, (
            f"Expected exactly 2 recommendations, got {len(result['recommendations'])} "
            f"(AI returned {num_recs})"
        )


# ---------------------------------------------------------------------------
# Property 6: Parsed AI briefing substitutes fallback caution when AI caution
#              is absent
# Feature: ai-coach-insights, Property 6: Parsed AI briefing substitutes
#          fallback caution when AI caution is absent
# **Validates: Requirements 8.3**
# ---------------------------------------------------------------------------


class TestProperty6FallbackCautionSubstitution:
    """For any valid JSON AI response where the caution field is null, empty
    string, or missing, and any fallback dict with a non-null caution,
    _parse_ai_briefing returns the fallback's caution value."""

    @given(data=st.data())
    @settings(max_examples=100)
    def test_null_caution_uses_fallback(self, data):
        """When AI returns caution=null, fallback caution is used."""
        fallback = _build_fallback(data.draw)
        ai_response = _json.dumps({
            "sleep_analysis": "AI sleep analysis.",
            "activity_analysis": "AI activity analysis.",
            "recommendations": ["r1", "r2"],
            "caution": None,
        })

        result = _parse_ai_briefing(ai_response, fallback)
        assert result["caution"] == fallback["caution"], (
            f"Expected fallback caution '{fallback['caution']}', got '{result['caution']}'"
        )

    @given(data=st.data())
    @settings(max_examples=100)
    def test_empty_string_caution_uses_fallback(self, data):
        """When AI returns caution='', fallback caution is used."""
        fallback = _build_fallback(data.draw)
        ai_response = _json.dumps({
            "sleep_analysis": "AI sleep analysis.",
            "activity_analysis": "AI activity analysis.",
            "recommendations": ["r1", "r2"],
            "caution": "",
        })

        result = _parse_ai_briefing(ai_response, fallback)
        assert result["caution"] == fallback["caution"], (
            f"Expected fallback caution '{fallback['caution']}', got '{result['caution']}'"
        )

    @given(data=st.data())
    @settings(max_examples=100)
    def test_missing_caution_uses_fallback(self, data):
        """When AI response has no caution key, fallback caution is used."""
        fallback = _build_fallback(data.draw)
        ai_response = _json.dumps({
            "sleep_analysis": "AI sleep analysis.",
            "activity_analysis": "AI activity analysis.",
            "recommendations": ["r1", "r2"],
        })

        result = _parse_ai_briefing(ai_response, fallback)
        assert result["caution"] == fallback["caution"], (
            f"Expected fallback caution '{fallback['caution']}', got '{result['caution']}'"
        )


# ---------------------------------------------------------------------------
# Property 7: Invalid JSON returns the fallback briefing
# Feature: ai-coach-insights, Property 7: Invalid JSON returns the fallback
#          briefing
# **Validates: Requirements 8.4**
# ---------------------------------------------------------------------------


class TestProperty7InvalidJsonReturnsFallback:
    """For any string that is not valid JSON and any fallback dict,
    _parse_ai_briefing returns the fallback dict unchanged."""

    @given(data=st.data())
    @settings(max_examples=100)
    def test_non_json_string_returns_fallback(self, data):
        """_parse_ai_briefing returns the fallback for any non-JSON string."""
        fallback = _build_fallback(data.draw)
        # Generate a non-JSON string: use text that is guaranteed not to be valid JSON.
        # We prepend a non-JSON character to ensure it can't parse.
        raw_text = data.draw(st.text(min_size=0, max_size=200))
        non_json = "INVALID>>>" + raw_text

        result = _parse_ai_briefing(non_json, fallback)

        assert result is fallback, (
            "Expected _parse_ai_briefing to return the exact fallback dict for non-JSON input"
        )


# ---------------------------------------------------------------------------
# Property 2: Today's training sessions are preserved in the digest
# Feature: ai-coach-insights, Property 2: Today's training sessions are
#          preserved in the digest
# **Validates: Requirements 1.5**
# ---------------------------------------------------------------------------

from app.services.fitness import activity_training_load as _activity_training_load


def _activities_for_today(local_date: date, draw) -> list[ActivityRow]:
    """Draw 0-5 activities all with start_time on *local_date*."""
    count = draw(st.integers(min_value=0, max_value=5))
    activities: list[ActivityRow] = []
    for _ in range(count):
        discipline = draw(st.sampled_from(
            ["SWIM", "RUN", "RIDE_ROAD", "RIDE_GRAVEL", "STRENGTH", "YOGA", "MOBILITY", "OTHER"]
        ))
        duration = draw(st.integers(min_value=600, max_value=7200))
        distance = draw(
            st.floats(min_value=0.0, max_value=42000.0, allow_nan=False, allow_infinity=False)
        )
        tss = draw(st.one_of(
            st.none(),
            st.floats(min_value=0.0, max_value=500.0, allow_nan=False, allow_infinity=False),
        ))
        activities.append(
            ActivityRow(
                id="act-test",
                user_id="test-user",
                discipline=discipline,
                start_time=f"{local_date.isoformat()}T08:00:00+00:00",
                duration_seconds=duration,
                distance_meters=distance,
                tss=tss,
            )
        )
    return activities


class TestProperty2TrainingSessionsPreservedInDigest:
    """For any set of activities on today's date, the digest entry for today
    includes a training dict with correct aggregated values."""

    @given(data=st.data())
    @settings(max_examples=100)
    def test_today_training_aggregation(self, data):
        """Today's digest entry has sessions, distance_km, duration_hours,
        and tss matching the aggregated values of the input activities."""
        local_date = data.draw(_date_strategy)
        activities = _activities_for_today(local_date, data.draw)
        tz = ZoneInfo("UTC")

        digest = _build_daily_prompt_digest(local_date, [], activities, tz)

        # Find today's entry
        today_entry = next(
            (e for e in digest if e["date"] == local_date.isoformat()), None
        )
        assert today_entry is not None, "Today's entry not found in digest"

        training = today_entry["training"]

        # Compute expected values
        expected_sessions = len(activities)
        expected_distance_km = round(
            sum((a.distance_meters or 0) / 1000 for a in activities), 1
        )
        expected_duration_hours = round(
            sum((a.duration_seconds or 0) / 3600 for a in activities), 1
        )
        expected_tss = round(
            sum(_activity_training_load(a.model_dump()) or 0 for a in activities), 1
        )

        assert training["sessions"] == expected_sessions, (
            f"Expected {expected_sessions} sessions, got {training['sessions']}"
        )
        assert training["distance_km"] == expected_distance_km, (
            f"Expected distance_km={expected_distance_km}, got {training['distance_km']}"
        )
        assert training["duration_hours"] == expected_duration_hours, (
            f"Expected duration_hours={expected_duration_hours}, got {training['duration_hours']}"
        )
        # Use approximate comparison for TSS due to floating point rounding
        assert abs(training["tss"] - expected_tss) <= 0.15, (
            f"Expected tss≈{expected_tss}, got {training['tss']}"
        )
