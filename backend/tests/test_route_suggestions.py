"""Unit tests for route_suggestions.py — Tasks 5.2 & 5.3.

Tests cover:
- _calculate_distance_match_score: distance proximity scoring
- _calculate_elevation_match_score: elevation proximity scoring
- _calculate_quality_score: discipline-specific surface quality
- _calculate_popularity_score: normalised popularity
- _passes_discipline_filter: discipline-specific surface filtering
- _extract_route_segment_hashes: GeoJSON segment extraction
- get_route_suggestions: end-to-end ranking with mocked DB

Requirements: 2.2, 2.3, 2.4, 2.6, 2.7
"""

from __future__ import annotations

import math
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.route_suggestions import (
    WEIGHT_DISTANCE,
    WEIGHT_ELEVATION,
    WEIGHT_POPULARITY,
    WEIGHT_QUALITY,
    RouteSuggestion,
    _calculate_distance_match_score,
    _calculate_elevation_match_score,
    _calculate_popularity_label,
    _calculate_popularity_score,
    _calculate_quality_score,
    _extract_route_segment_hashes,
    _passes_discipline_filter,
    get_route_suggestions,
)


# ---------------------------------------------------------------------------
# Scoring weight constants
# ---------------------------------------------------------------------------


class TestScoringWeights:
    """Verify the scoring weights match requirement 2.7."""

    def test_weights_sum_to_one(self):
        total = WEIGHT_POPULARITY + WEIGHT_QUALITY + WEIGHT_DISTANCE + WEIGHT_ELEVATION
        assert math.isclose(total, 1.0)

    def test_individual_weights(self):
        assert WEIGHT_POPULARITY == 0.40
        assert WEIGHT_QUALITY == 0.30
        assert WEIGHT_DISTANCE == 0.20
        assert WEIGHT_ELEVATION == 0.10


# ---------------------------------------------------------------------------
# _calculate_distance_match_score
# ---------------------------------------------------------------------------


class TestDistanceMatchScore:
    """Tests for distance match scoring."""

    def test_perfect_match_returns_one(self):
        assert _calculate_distance_match_score(10000, 10000) == 1.0

    def test_double_distance_returns_low_score(self):
        score = _calculate_distance_match_score(20000, 10000)
        # deviation = 1.0, exp(-3) ≈ 0.05
        assert score < 0.1

    def test_half_distance_returns_low_score(self):
        score = _calculate_distance_match_score(5000, 10000)
        assert score < 0.3

    def test_close_match_returns_high_score(self):
        # 10% deviation -> exp(-0.3) ≈ 0.74
        score = _calculate_distance_match_score(11000, 10000)
        assert score > 0.7

    def test_zero_target_returns_zero(self):
        assert _calculate_distance_match_score(10000, 0) == 0.0

    def test_zero_route_distance_returns_zero(self):
        assert _calculate_distance_match_score(0, 10000) == 0.0

    def test_negative_values_return_zero(self):
        assert _calculate_distance_match_score(-1000, 10000) == 0.0
        assert _calculate_distance_match_score(10000, -1000) == 0.0


# ---------------------------------------------------------------------------
# _calculate_elevation_match_score
# ---------------------------------------------------------------------------


class TestElevationMatchScore:
    """Tests for elevation match scoring."""

    def test_perfect_match_returns_one(self):
        assert _calculate_elevation_match_score(500, 500) == 1.0

    def test_none_target_returns_neutral(self):
        assert _calculate_elevation_match_score(500, None) == 0.5

    def test_none_route_elevation_returns_neutral(self):
        assert _calculate_elevation_match_score(None, 500) == 0.5

    def test_zero_target_returns_neutral(self):
        assert _calculate_elevation_match_score(500, 0) == 0.5

    def test_zero_route_elevation_returns_neutral(self):
        assert _calculate_elevation_match_score(0, 500) == 0.5

    def test_close_match_returns_high_score(self):
        score = _calculate_elevation_match_score(550, 500)
        assert score > 0.7

    def test_large_deviation_returns_low_score(self):
        score = _calculate_elevation_match_score(1000, 500)
        assert score < 0.2


# ---------------------------------------------------------------------------
# _calculate_quality_score
# ---------------------------------------------------------------------------


class TestQualityScore:
    """Tests for discipline-specific quality scoring."""

    def test_run_no_surface_data_returns_high_default(self):
        assert _calculate_quality_score("RUN", None) == 0.7

    def test_run_with_surface_data_returns_high(self):
        assert _calculate_quality_score("RUN", {"asphalt": 50, "trail": 50}) == 0.8

    def test_ride_road_no_surface_returns_moderate(self):
        assert _calculate_quality_score("RIDE_ROAD", None) == 0.5

    def test_ride_road_fully_paved(self):
        score = _calculate_quality_score("RIDE_ROAD", {"asphalt": 100})
        assert score == 1.0

    def test_ride_road_90_percent_paved(self):
        score = _calculate_quality_score("RIDE_ROAD", {"asphalt": 80, "paved": 10, "gravel": 10})
        assert math.isclose(score, 0.9, abs_tol=0.01)

    def test_ride_road_mostly_gravel_scores_low(self):
        score = _calculate_quality_score("RIDE_ROAD", {"gravel": 80, "asphalt": 20})
        assert score < 0.3

    def test_ride_gravel_with_gravel_surface(self):
        score = _calculate_quality_score("RIDE_GRAVEL", {"gravel": 70, "asphalt": 30})
        # (70*0.7 + 30*0.3) / 100 = (49+9)/100 = 0.58
        assert 0.5 < score < 0.7

    def test_ride_gravel_no_surface_returns_moderate(self):
        assert _calculate_quality_score("RIDE_GRAVEL", None) == 0.5


# ---------------------------------------------------------------------------
# _calculate_popularity_score
# ---------------------------------------------------------------------------


class TestPopularityScore:
    """Tests for normalised popularity scoring."""

    def test_most_popular_returns_one(self):
        assert _calculate_popularity_score(100, 100) == 1.0

    def test_half_popular_returns_half(self):
        assert _calculate_popularity_score(50, 100) == 0.5

    def test_zero_usage_returns_zero(self):
        assert _calculate_popularity_score(0, 100) == 0.0

    def test_zero_max_returns_zero(self):
        assert _calculate_popularity_score(50, 0) == 0.0

    def test_capped_at_one(self):
        # Edge case: usage exceeds max (shouldn't happen, but be safe)
        assert _calculate_popularity_score(150, 100) == 1.0


# ---------------------------------------------------------------------------
# _calculate_popularity_label
# ---------------------------------------------------------------------------


class TestPopularityLabel:
    """Tests for human-readable popularity label calculation (Req 2.5)."""

    def test_popular_label_for_high_popularity(self):
        """Routes with popularity_score >= 0.80 and usage > 0 get '🔥 Popular'."""
        label = _calculate_popularity_label(
            usage_count_90d=50, popularity_score=0.90, combined_score=0.85,
        )
        assert label == "🔥 Popular"

    def test_popular_label_at_threshold(self):
        """Exactly at the 0.80 popularity threshold."""
        label = _calculate_popularity_label(
            usage_count_90d=80, popularity_score=0.80, combined_score=0.60,
        )
        assert label == "🔥 Popular"

    def test_recommended_label_for_high_combined_score(self):
        """Routes with high combined score but low popularity get '⭐ Recommended'."""
        label = _calculate_popularity_label(
            usage_count_90d=5, popularity_score=0.30, combined_score=0.75,
        )
        assert label == "⭐ Recommended"

    def test_recommended_at_threshold(self):
        """Exactly at the 0.70 combined score threshold."""
        label = _calculate_popularity_label(
            usage_count_90d=0, popularity_score=0.0, combined_score=0.70,
        )
        assert label == "⭐ Recommended"

    def test_no_label_for_low_scores(self):
        """Routes with low popularity and low combined score get None."""
        label = _calculate_popularity_label(
            usage_count_90d=2, popularity_score=0.10, combined_score=0.40,
        )
        assert label is None

    def test_no_label_below_both_thresholds(self):
        """Just below both thresholds returns None."""
        label = _calculate_popularity_label(
            usage_count_90d=10, popularity_score=0.79, combined_score=0.69,
        )
        assert label is None

    def test_popular_takes_precedence_over_recommended(self):
        """When both conditions are met, '🔥 Popular' wins."""
        label = _calculate_popularity_label(
            usage_count_90d=100, popularity_score=0.95, combined_score=0.90,
        )
        assert label == "🔥 Popular"

    def test_zero_usage_with_high_popularity_score_returns_none_or_recommended(self):
        """Zero usage count should not get Popular label even if score is high."""
        label = _calculate_popularity_label(
            usage_count_90d=0, popularity_score=1.0, combined_score=0.50,
        )
        # usage_count_90d == 0 means the route isn't actually popular
        assert label is None

    def test_custom_thresholds(self):
        """Custom thresholds can be passed."""
        label = _calculate_popularity_label(
            usage_count_90d=10,
            popularity_score=0.50,
            combined_score=0.40,
            popularity_threshold=0.50,
            combined_score_threshold=0.40,
        )
        assert label == "🔥 Popular"


# ---------------------------------------------------------------------------
# _passes_discipline_filter
# ---------------------------------------------------------------------------


class TestPassesDisciplineFilter:
    """Tests for discipline-specific surface filtering (Req 2.2, 2.3, 2.4, 2.6)."""

    # -- RIDE_ROAD: ≥90% paved required --

    def test_ride_road_fully_paved_passes(self):
        """100% asphalt passes RIDE_ROAD filter."""
        assert _passes_discipline_filter("RIDE_ROAD", {"asphalt": 100}) is True

    def test_ride_road_90_pct_paved_passes(self):
        """Exactly 90% paved passes RIDE_ROAD filter."""
        assert _passes_discipline_filter("RIDE_ROAD", {"asphalt": 80, "paved": 10, "gravel": 10}) is True

    def test_ride_road_mixed_paved_types_passes(self):
        """Mix of asphalt + paved + concrete totalling ≥90% passes."""
        assert _passes_discipline_filter("RIDE_ROAD", {"asphalt": 50, "paved": 30, "concrete": 15, "gravel": 5}) is True

    def test_ride_road_below_90_pct_paved_fails(self):
        """80% paved fails RIDE_ROAD filter."""
        assert _passes_discipline_filter("RIDE_ROAD", {"asphalt": 80, "gravel": 20}) is False

    def test_ride_road_mostly_gravel_fails(self):
        """Mostly gravel fails RIDE_ROAD filter."""
        assert _passes_discipline_filter("RIDE_ROAD", {"gravel": 70, "asphalt": 30}) is False

    def test_ride_road_no_surface_data_fails(self):
        """No surface data means we can't confirm paved — exclude."""
        assert _passes_discipline_filter("RIDE_ROAD", None) is False

    def test_ride_road_empty_surface_data_fails(self):
        """Empty surface breakdown — exclude."""
        assert _passes_discipline_filter("RIDE_ROAD", {}) is False

    def test_ride_road_zero_total_fails(self):
        """All-zero surface breakdown — exclude."""
        assert _passes_discipline_filter("RIDE_ROAD", {"asphalt": 0, "gravel": 0}) is False

    # -- RIDE_ROAD with unknown surface (Req 2.6) --

    def test_ride_road_small_unknown_treated_as_paved(self):
        """<10% unknown + enough paved passes (unknown counted as potentially paved)."""
        # 85% asphalt + 8% unknown = 93% effective paved → passes
        assert _passes_discipline_filter("RIDE_ROAD", {"asphalt": 85, "unknown": 8, "gravel": 7}) is True

    def test_ride_road_small_unknown_still_not_enough_paved(self):
        """<10% unknown but still not enough paved even with unknown counted."""
        # 75% asphalt + 5% unknown = 80% effective paved → fails
        assert _passes_discipline_filter("RIDE_ROAD", {"asphalt": 75, "unknown": 5, "gravel": 20}) is False

    def test_ride_road_large_unknown_not_counted_as_paved(self):
        """≥10% unknown is NOT treated as paved."""
        # 82% asphalt + 12% unknown = 82% effective paved (unknown not counted) → fails
        assert _passes_discipline_filter("RIDE_ROAD", {"asphalt": 82, "unknown": 12, "gravel": 6}) is False

    def test_ride_road_exactly_10_pct_unknown_not_counted(self):
        """Exactly 10% unknown is NOT treated as paved (boundary)."""
        # 85% asphalt + 10% unknown → unknown NOT counted → 85% paved → fails
        assert _passes_discipline_filter("RIDE_ROAD", {"asphalt": 85, "unknown": 10, "gravel": 5}) is False

    def test_ride_road_9_pct_unknown_counted(self):
        """9% unknown IS treated as paved (just under boundary)."""
        # 82% asphalt + 9% unknown = 91% effective paved → passes
        assert _passes_discipline_filter("RIDE_ROAD", {"asphalt": 82, "unknown": 9, "gravel": 9}) is True

    # -- RIDE_GRAVEL: no strict filtering --

    def test_ride_gravel_always_passes(self):
        """RIDE_GRAVEL has no strict surface filter."""
        assert _passes_discipline_filter("RIDE_GRAVEL", {"gravel": 80, "dirt": 20}) is True

    def test_ride_gravel_no_surface_data_passes(self):
        assert _passes_discipline_filter("RIDE_GRAVEL", None) is True

    def test_ride_gravel_fully_paved_passes(self):
        assert _passes_discipline_filter("RIDE_GRAVEL", {"asphalt": 100}) is True

    # -- RUN: no strict filtering --

    def test_run_always_passes(self):
        """RUN has no strict surface filter — all surfaces acceptable."""
        assert _passes_discipline_filter("RUN", {"trail": 50, "asphalt": 30, "grass": 20}) is True

    def test_run_no_surface_data_passes(self):
        assert _passes_discipline_filter("RUN", None) is True

    def test_run_park_paths_pass(self):
        """Park paths and pedestrian areas are fine for running."""
        assert _passes_discipline_filter("RUN", {"path": 60, "pedestrian": 40}) is True


# ---------------------------------------------------------------------------
# _extract_route_segment_hashes
# ---------------------------------------------------------------------------


class TestExtractRouteSegmentHashes:
    """Tests for GeoJSON segment hash extraction."""

    def test_linestring_feature(self):
        geojson = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [11.5678, 48.1234],
                    [11.5688, 48.1244],
                    [11.5698, 48.1254],
                ],
            },
        }
        hashes = _extract_route_segment_hashes(geojson)
        assert len(hashes) == 2

    def test_bare_linestring(self):
        geojson = {
            "type": "LineString",
            "coordinates": [
                [11.5678, 48.1234],
                [11.5688, 48.1244],
            ],
        }
        hashes = _extract_route_segment_hashes(geojson)
        assert len(hashes) == 1

    def test_none_geojson_returns_empty(self):
        assert _extract_route_segment_hashes(None) == []

    def test_empty_coordinates_returns_empty(self):
        geojson = {"type": "LineString", "coordinates": []}
        assert _extract_route_segment_hashes(geojson) == []

    def test_single_coordinate_returns_empty(self):
        geojson = {
            "type": "LineString",
            "coordinates": [[11.5678, 48.1234]],
        }
        assert _extract_route_segment_hashes(geojson) == []

    def test_feature_collection(self):
        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [11.5678, 48.1234],
                            [11.5688, 48.1244],
                        ],
                    },
                }
            ],
        }
        hashes = _extract_route_segment_hashes(geojson)
        assert len(hashes) == 1


# ---------------------------------------------------------------------------
# get_route_suggestions — integration with mocked DB
# ---------------------------------------------------------------------------


def _make_mock_sb(routes_data: list[dict], popularity_data: dict | None = None, prohibited_areas: list | None = None):
    """Build a mock Supabase client that returns the given routes."""
    mock_sb = MagicMock()

    # Mock routes query chain: sb.table("routes").select(...).eq(...).execute()
    mock_routes_execute = AsyncMock(return_value=MagicMock(data=routes_data))
    mock_routes_eq = MagicMock()
    mock_routes_eq.execute = mock_routes_execute
    mock_routes_select = MagicMock()
    mock_routes_select.eq.return_value = mock_routes_eq

    # Mock prohibited areas query chain
    mock_prohibited_execute = AsyncMock(return_value=MagicMock(data=[]))
    mock_prohibited_select = MagicMock()
    mock_prohibited_select.execute = mock_prohibited_execute

    # Mock popularity query chain: sb.table("route_segment_popularity").select(...).in_(...).eq(...).execute()
    pop_records = []
    if popularity_data:
        for h, count in popularity_data.items():
            pop_records.append({
                "segment_hash": h,
                "usage_count": count,
                "last_used_at": "2025-01-01T00:00:00+00:00",
            })
    mock_pop_execute = AsyncMock(return_value=MagicMock(data=pop_records))
    mock_pop_eq = MagicMock()
    mock_pop_eq.execute = mock_pop_execute
    mock_pop_in = MagicMock()
    mock_pop_in.eq.return_value = mock_pop_eq
    mock_pop_select = MagicMock()
    mock_pop_select.in_.return_value = mock_pop_in

    def table_side_effect(name: str):
        t = MagicMock()
        if name == "routes":
            t.select.return_value = mock_routes_select
        elif name == "route_segment_popularity":
            t.select.return_value = mock_pop_select
        elif name == "cycling_prohibited_areas":
            t.select.return_value = mock_prohibited_select
        return t

    mock_sb.table.side_effect = table_side_effect
    return mock_sb


def _sample_route(
    route_id: str = "r1",
    name: str = "Test Route",
    sport: str = "RUN",
    distance_meters: float = 10000,
    elevation_gain_meters: float | None = 200,
    surface_breakdown: dict | None = None,
) -> dict:
    return {
        "id": route_id,
        "name": name,
        "sport": sport,
        "distance_meters": distance_meters,
        "elevation_gain_meters": elevation_gain_meters,
        "geojson": {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [11.5678, 48.1234],
                    [11.5688, 48.1244],
                ],
            },
        },
        "surface_breakdown": surface_breakdown,
        "start_lat": 48.1234,
        "start_lng": 11.5678,
    }


@pytest.mark.asyncio
class TestGetRouteSuggestions:
    """End-to-end tests for the ranking algorithm."""

    async def test_returns_empty_for_no_routes(self):
        mock_sb = _make_mock_sb([])
        result = await get_route_suggestions(
            user_id="u1",
            discipline="RUN",
            target_distance_meters=10000,
            start_lat=48.1234,
            start_lng=11.5678,
            sb=mock_sb,
        )
        assert result == []

    async def test_returns_suggestions_sorted_by_combined_score(self):
        routes = [
            _sample_route("r1", "Close Match", distance_meters=10000),
            _sample_route("r2", "Far Match", distance_meters=50000),
        ]
        mock_sb = _make_mock_sb(routes)

        result = await get_route_suggestions(
            user_id="u1",
            discipline="RUN",
            target_distance_meters=10000,
            start_lat=48.1234,
            start_lng=11.5678,
            sb=mock_sb,
        )

        assert len(result) == 2
        # The closer distance match should rank higher
        assert result[0].route_id == "r1"
        assert result[0].combined_score >= result[1].combined_score

    async def test_limit_parameter_caps_results(self):
        routes = [_sample_route(f"r{i}", f"Route {i}") for i in range(5)]
        mock_sb = _make_mock_sb(routes)

        result = await get_route_suggestions(
            user_id="u1",
            discipline="RUN",
            target_distance_meters=10000,
            start_lat=48.1234,
            start_lng=11.5678,
            limit=2,
            sb=mock_sb,
        )

        assert len(result) == 2

    async def test_combined_score_uses_correct_weights(self):
        routes = [_sample_route("r1", "Route 1", distance_meters=10000)]
        mock_sb = _make_mock_sb(routes)

        result = await get_route_suggestions(
            user_id="u1",
            discipline="RUN",
            target_distance_meters=10000,
            start_lat=48.1234,
            start_lng=11.5678,
            sb=mock_sb,
        )

        assert len(result) == 1
        s = result[0]
        expected = round(
            WEIGHT_POPULARITY * s.popularity_score
            + WEIGHT_QUALITY * s.discipline_match_score
            + WEIGHT_DISTANCE * s.distance_match_score
            + WEIGHT_ELEVATION * s.elevation_match_score,
            4,
        )
        assert s.combined_score == expected

    async def test_none_sb_returns_empty(self):
        result = await get_route_suggestions(
            user_id="u1",
            discipline="RUN",
            target_distance_meters=10000,
            start_lat=48.1234,
            start_lng=11.5678,
            sb=None,
        )
        assert result == []

    async def test_cycling_routes_check_prohibited_areas(self):
        """Cycling routes that pass through prohibited areas are excluded."""
        routes = [
            _sample_route("r1", "Safe Route", sport="RIDE_ROAD",
                          surface_breakdown={"asphalt": 95, "gravel": 5}),
            _sample_route("r2", "Prohibited Route", sport="RIDE_ROAD",
                          surface_breakdown={"asphalt": 95, "gravel": 5}),
        ]
        mock_sb = _make_mock_sb(routes)

        # Patch check_route_prohibited_areas to flag r2
        async def mock_check(geojson, sb):
            return []  # No prohibited areas for any route

        with patch(
            "app.services.route_suggestions.check_route_prohibited_areas",
            side_effect=mock_check,
        ):
            result = await get_route_suggestions(
                user_id="u1",
                discipline="RIDE_ROAD",
                target_distance_meters=10000,
                start_lat=48.1234,
                start_lng=11.5678,
                sb=mock_sb,
            )

        # Both routes should be included (no prohibited areas)
        assert len(result) == 2

    async def test_cycling_excludes_prohibited_routes(self):
        """Routes through prohibited areas are filtered out for cycling."""
        routes = [
            _sample_route("r1", "Safe Route", sport="RIDE_ROAD",
                          surface_breakdown={"asphalt": 95, "gravel": 5}),
            _sample_route("r2", "Prohibited Route", sport="RIDE_ROAD",
                          surface_breakdown={"asphalt": 95, "gravel": 5}),
        ]
        mock_sb = _make_mock_sb(routes)

        call_count = 0

        async def mock_check(geojson, sb):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                # Second route is prohibited
                return [{"area_name": "No Cycling Park", "coordinates": {"lat": 48.0, "lng": 11.0}, "restriction_type": "no"}]
            return []

        with patch(
            "app.services.route_suggestions.check_route_prohibited_areas",
            side_effect=mock_check,
        ):
            result = await get_route_suggestions(
                user_id="u1",
                discipline="RIDE_ROAD",
                target_distance_meters=10000,
                start_lat=48.1234,
                start_lng=11.5678,
                sb=mock_sb,
            )

        assert len(result) == 1
        assert result[0].route_id == "r1"

    async def test_run_does_not_check_prohibited_areas(self):
        """Running routes skip prohibited area checks."""
        routes = [_sample_route("r1", "Run Route", sport="RUN")]
        mock_sb = _make_mock_sb(routes)

        with patch(
            "app.services.route_suggestions.check_route_prohibited_areas",
        ) as mock_check:
            result = await get_route_suggestions(
                user_id="u1",
                discipline="RUN",
                target_distance_meters=10000,
                start_lat=48.1234,
                start_lng=11.5678,
                sb=mock_sb,
            )

        mock_check.assert_not_called()
        assert len(result) == 1

    async def test_suggestion_dataclass_fields(self):
        """Verify all RouteSuggestion fields are populated."""
        routes = [_sample_route("r1", "Test", distance_meters=10000, elevation_gain_meters=200)]
        mock_sb = _make_mock_sb(routes)

        result = await get_route_suggestions(
            user_id="u1",
            discipline="RUN",
            target_distance_meters=10000,
            start_lat=48.1234,
            start_lng=11.5678,
            target_elevation_gain=200,
            sb=mock_sb,
        )

        assert len(result) == 1
        s = result[0]
        assert s.route_id == "r1"
        assert s.name == "Test"
        assert s.distance_meters == 10000
        assert s.elevation_gain_meters == 200
        assert 0.0 <= s.popularity_score <= 1.0
        assert 0.0 <= s.discipline_match_score <= 1.0
        assert 0.0 <= s.distance_match_score <= 1.0
        assert 0.0 <= s.elevation_match_score <= 1.0
        assert 0.0 <= s.combined_score <= 1.0
        assert isinstance(s.usage_count_90d, int)
        assert s.popularity_label is None or isinstance(s.popularity_label, str)

    # -- Discipline-specific surface filtering (Task 5.3) --

    async def test_ride_road_filters_out_unpaved_routes(self):
        """RIDE_ROAD excludes routes with <90% paved surface. (Req 2.3)"""
        routes = [
            _sample_route("r1", "Paved Route", sport="RIDE_ROAD",
                          surface_breakdown={"asphalt": 95, "gravel": 5}),
            _sample_route("r2", "Gravel Route", sport="RIDE_ROAD",
                          surface_breakdown={"gravel": 70, "asphalt": 30}),
        ]
        mock_sb = _make_mock_sb(routes)

        with patch(
            "app.services.route_suggestions.check_route_prohibited_areas",
            new_callable=AsyncMock,
            return_value=[],
        ):
            result = await get_route_suggestions(
                user_id="u1",
                discipline="RIDE_ROAD",
                target_distance_meters=10000,
                start_lat=48.1234,
                start_lng=11.5678,
                sb=mock_sb,
            )

        assert len(result) == 1
        assert result[0].route_id == "r1"

    async def test_ride_road_allows_small_unknown_surface(self):
        """RIDE_ROAD allows routes with <10% unknown surface. (Req 2.6)"""
        routes = [
            _sample_route("r1", "Mostly Paved + Unknown", sport="RIDE_ROAD",
                          surface_breakdown={"asphalt": 85, "unknown": 8, "gravel": 7}),
        ]
        mock_sb = _make_mock_sb(routes)

        with patch(
            "app.services.route_suggestions.check_route_prohibited_areas",
            new_callable=AsyncMock,
            return_value=[],
        ):
            result = await get_route_suggestions(
                user_id="u1",
                discipline="RIDE_ROAD",
                target_distance_meters=10000,
                start_lat=48.1234,
                start_lng=11.5678,
                sb=mock_sb,
            )

        assert len(result) == 1
        assert result[0].route_id == "r1"

    async def test_ride_road_excludes_no_surface_data(self):
        """RIDE_ROAD excludes routes with no surface data."""
        routes = [
            _sample_route("r1", "No Surface Data", sport="RIDE_ROAD",
                          surface_breakdown=None),
        ]
        mock_sb = _make_mock_sb(routes)

        with patch(
            "app.services.route_suggestions.check_route_prohibited_areas",
            new_callable=AsyncMock,
            return_value=[],
        ):
            result = await get_route_suggestions(
                user_id="u1",
                discipline="RIDE_ROAD",
                target_distance_meters=10000,
                start_lat=48.1234,
                start_lng=11.5678,
                sb=mock_sb,
            )

        assert len(result) == 0

    async def test_ride_gravel_no_surface_filtering(self):
        """RIDE_GRAVEL does not apply strict surface filtering."""
        routes = [
            _sample_route("r1", "Gravel Route", sport="RIDE_GRAVEL",
                          surface_breakdown={"gravel": 80, "dirt": 20}),
            _sample_route("r2", "Mixed Route", sport="RIDE_GRAVEL",
                          surface_breakdown={"asphalt": 50, "gravel": 50}),
        ]
        mock_sb = _make_mock_sb(routes)

        with patch(
            "app.services.route_suggestions.check_route_prohibited_areas",
            new_callable=AsyncMock,
            return_value=[],
        ):
            result = await get_route_suggestions(
                user_id="u1",
                discipline="RIDE_GRAVEL",
                target_distance_meters=10000,
                start_lat=48.1234,
                start_lng=11.5678,
                sb=mock_sb,
            )

        assert len(result) == 2

    async def test_run_no_surface_filtering(self):
        """RUN does not apply surface filtering — all surfaces acceptable. (Req 2.2)"""
        routes = [
            _sample_route("r1", "Trail Route", sport="RUN",
                          surface_breakdown={"trail": 60, "grass": 40}),
            _sample_route("r2", "Paved Route", sport="RUN",
                          surface_breakdown={"asphalt": 100}),
        ]
        mock_sb = _make_mock_sb(routes)

        result = await get_route_suggestions(
            user_id="u1",
            discipline="RUN",
            target_distance_meters=10000,
            start_lat=48.1234,
            start_lng=11.5678,
            sb=mock_sb,
        )

        assert len(result) == 2
