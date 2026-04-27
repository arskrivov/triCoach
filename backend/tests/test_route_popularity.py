"""Unit tests for route_popularity.py service functions.

Tests cover:
- hash_segment: consistency and direction-independence
- _calculate_time_decay_weight: all time decay brackets
- extract_and_store_segments: minimum distance filtering (500m)
- get_segment_popularity: time decay application

Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.route_popularity import (
    MIN_ACTIVITY_DISTANCE_METERS,
    SEGMENT_RESOLUTION_METERS,
    TIME_DECAY_90_DAYS,
    TIME_DECAY_180_DAYS,
    WEIGHT_RECENT,
    WEIGHT_MEDIUM,
    WEIGHT_OLD,
    _calculate_time_decay_weight,
    _calculate_total_distance,
    _haversine_distance,
    _round_coordinate,
    hash_segment,
    extract_and_store_segments,
    get_segment_popularity,
)


# ---------------------------------------------------------------------------
# hash_segment tests - Requirement 3.1, 3.3
# ---------------------------------------------------------------------------


class TestHashSegment:
    """Tests for segment hashing consistency and direction-independence."""

    def test_same_coordinates_produce_same_hash(self):
        """Segment hashing produces consistent results for same coordinates."""
        lat1, lng1 = 48.1234, 11.5678
        lat2, lng2 = 48.1244, 11.5688

        hash1 = hash_segment(lat1, lng1, lat2, lng2)
        hash2 = hash_segment(lat1, lng1, lat2, lng2)

        assert hash1 == hash2
        assert len(hash1) == 16  # First 16 chars of SHA-256

    def test_direction_independence_a_to_b_equals_b_to_a(self):
        """Segment hashing is direction-independent (A→B == B→A)."""
        lat1, lng1 = 48.1234, 11.5678
        lat2, lng2 = 48.1244, 11.5688

        hash_a_to_b = hash_segment(lat1, lng1, lat2, lng2)
        hash_b_to_a = hash_segment(lat2, lng2, lat1, lng1)

        assert hash_a_to_b == hash_b_to_a

    def test_direction_independence_with_different_coordinates(self):
        """Direction independence works for various coordinate pairs."""
        test_cases = [
            # (lat1, lng1, lat2, lng2)
            (40.7128, -74.0060, 40.7138, -74.0070),  # NYC area
            (51.5074, -0.1278, 51.5084, -0.1288),    # London area
            (-33.8688, 151.2093, -33.8698, 151.2103),  # Sydney area
        ]

        for lat1, lng1, lat2, lng2 in test_cases:
            hash_forward = hash_segment(lat1, lng1, lat2, lng2)
            hash_reverse = hash_segment(lat2, lng2, lat1, lng1)
            assert hash_forward == hash_reverse, f"Failed for coords: {lat1},{lng1} -> {lat2},{lng2}"

    def test_different_coordinates_produce_different_hashes(self):
        """Different segments produce different hashes."""
        hash1 = hash_segment(48.1234, 11.5678, 48.1244, 11.5688)
        hash2 = hash_segment(48.2234, 11.6678, 48.2244, 11.6688)

        assert hash1 != hash2

    def test_coordinates_rounded_to_4_decimal_places(self):
        """Coordinates are rounded to 4 decimal places (~11m precision)."""
        # These should produce the same hash due to rounding
        # 48.12344 rounds to 48.1234, 48.12346 rounds to 48.1235 - different!
        # Use values that round to the same 4 decimal places
        hash1 = hash_segment(48.12341, 11.56781, 48.12441, 11.56881)
        hash2 = hash_segment(48.12344, 11.56784, 48.12444, 11.56884)

        assert hash1 == hash2

    def test_hash_is_deterministic_across_calls(self):
        """Hash function is deterministic - same input always gives same output."""
        coords = (48.1234, 11.5678, 48.1244, 11.5688)
        hashes = [hash_segment(*coords) for _ in range(10)]

        assert all(h == hashes[0] for h in hashes)

    def test_hash_format_is_hexadecimal(self):
        """Hash output is a valid hexadecimal string."""
        result = hash_segment(48.1234, 11.5678, 48.1244, 11.5688)

        # Should be valid hex
        int(result, 16)  # Raises ValueError if not valid hex
        assert len(result) == 16


# ---------------------------------------------------------------------------
# _calculate_time_decay_weight tests - Requirement 3.4
# ---------------------------------------------------------------------------


class TestCalculateTimeDecayWeight:
    """Tests for time decay weight calculations."""

    def test_recent_activity_within_90_days_returns_100_percent(self):
        """Activities within 90 days get 100% weight."""
        now = datetime.now(timezone.utc)
        
        # Test at various points within 90 days
        test_days = [0, 1, 30, 60, 89, 90]
        
        for days_ago in test_days:
            timestamp = (now - timedelta(days=days_ago)).isoformat()
            weight = _calculate_time_decay_weight(timestamp)
            assert weight == WEIGHT_RECENT, f"Failed for {days_ago} days ago"

    def test_medium_age_91_to_180_days_returns_50_percent(self):
        """Activities 91-180 days old get 50% weight."""
        now = datetime.now(timezone.utc)
        
        # Test at various points in the 91-180 day range
        test_days = [91, 100, 120, 150, 179, 180]
        
        for days_ago in test_days:
            timestamp = (now - timedelta(days=days_ago)).isoformat()
            weight = _calculate_time_decay_weight(timestamp)
            assert weight == WEIGHT_MEDIUM, f"Failed for {days_ago} days ago"

    def test_old_activity_over_180_days_returns_25_percent(self):
        """Activities older than 180 days get 25% weight."""
        now = datetime.now(timezone.utc)
        
        # Test at various points beyond 180 days
        test_days = [181, 200, 365, 730]
        
        for days_ago in test_days:
            timestamp = (now - timedelta(days=days_ago)).isoformat()
            weight = _calculate_time_decay_weight(timestamp)
            assert weight == WEIGHT_OLD, f"Failed for {days_ago} days ago"

    def test_boundary_at_90_days_is_recent(self):
        """Exactly 90 days old is still considered recent (100%)."""
        now = datetime.now(timezone.utc)
        timestamp = (now - timedelta(days=90)).isoformat()
        
        weight = _calculate_time_decay_weight(timestamp)
        
        assert weight == WEIGHT_RECENT

    def test_boundary_at_91_days_is_medium(self):
        """91 days old transitions to medium weight (50%)."""
        now = datetime.now(timezone.utc)
        timestamp = (now - timedelta(days=91)).isoformat()
        
        weight = _calculate_time_decay_weight(timestamp)
        
        assert weight == WEIGHT_MEDIUM

    def test_boundary_at_180_days_is_medium(self):
        """Exactly 180 days old is still medium weight (50%)."""
        now = datetime.now(timezone.utc)
        timestamp = (now - timedelta(days=180)).isoformat()
        
        weight = _calculate_time_decay_weight(timestamp)
        
        assert weight == WEIGHT_MEDIUM

    def test_boundary_at_181_days_is_old(self):
        """181 days old transitions to old weight (25%)."""
        now = datetime.now(timezone.utc)
        timestamp = (now - timedelta(days=181)).isoformat()
        
        weight = _calculate_time_decay_weight(timestamp)
        
        assert weight == WEIGHT_OLD

    def test_handles_z_suffix_timestamp(self):
        """Handles timestamps with Z suffix (UTC indicator)."""
        now = datetime.now(timezone.utc)
        timestamp = (now - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
        
        weight = _calculate_time_decay_weight(timestamp)
        
        assert weight == WEIGHT_RECENT

    def test_handles_timezone_offset_timestamp(self):
        """Handles timestamps with timezone offset."""
        now = datetime.now(timezone.utc)
        timestamp = (now - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S+00:00")
        
        weight = _calculate_time_decay_weight(timestamp)
        
        assert weight == WEIGHT_RECENT

    def test_invalid_timestamp_returns_medium_weight(self):
        """Invalid timestamps default to medium weight (50%)."""
        invalid_timestamps = [
            "not-a-timestamp",
            "2024-13-45T99:99:99",  # Invalid date/time
            "",
        ]
        
        for timestamp in invalid_timestamps:
            weight = _calculate_time_decay_weight(timestamp)
            assert weight == WEIGHT_MEDIUM, f"Failed for invalid timestamp: {timestamp}"


# ---------------------------------------------------------------------------
# Minimum distance filtering tests - Requirement 3.5
# ---------------------------------------------------------------------------


class TestMinimumDistanceFiltering:
    """Tests for minimum distance filtering (500m requirement)."""

    def test_min_activity_distance_constant_is_500m(self):
        """Verify the minimum distance constant is 500 meters."""
        assert MIN_ACTIVITY_DISTANCE_METERS == 500

    def test_haversine_distance_calculation(self):
        """Haversine distance calculation is reasonably accurate."""
        # Two points approximately 100m apart
        lat1, lng1 = 48.1234, 11.5678
        lat2, lng2 = 48.1243, 11.5678  # ~100m north
        
        distance = _haversine_distance(lat1, lng1, lat2, lng2)
        
        # Should be approximately 100m (within 10% tolerance)
        assert 90 < distance < 110

    def test_calculate_total_distance_with_multiple_points(self):
        """Total distance calculation sums all segment distances."""
        # Create a simple path with known distances
        points = [
            (48.1234, 11.5678),
            (48.1243, 11.5678),  # ~100m north
            (48.1252, 11.5678),  # ~100m more north
        ]
        
        total = _calculate_total_distance(points)
        
        # Should be approximately 200m
        assert 180 < total < 220

    def test_calculate_total_distance_with_single_point_returns_zero(self):
        """Single point has zero distance."""
        points = [(48.1234, 11.5678)]
        
        total = _calculate_total_distance(points)
        
        assert total == 0.0

    def test_calculate_total_distance_with_empty_list_returns_zero(self):
        """Empty point list has zero distance."""
        total = _calculate_total_distance([])
        
        assert total == 0.0


@pytest.mark.asyncio
class TestExtractAndStoreSegmentsFiltering:
    """Tests for extract_and_store_segments minimum distance filtering."""

    async def test_activity_under_500m_not_processed(self):
        """Activities under 500m are not processed."""
        # Create a mock Supabase client
        mock_sb = MagicMock()
        
        # Create a short polyline (less than 500m)
        # This polyline represents a very short path
        short_polyline = "_p~iF~ps|U"  # Very short encoded polyline
        
        with patch("app.services.route_popularity._decode_polyline") as mock_decode:
            # Return points that are less than 500m apart
            mock_decode.return_value = [
                (48.1234, 11.5678),
                (48.1238, 11.5682),  # ~50m away
            ]
            
            result = await extract_and_store_segments(
                activity_id="test-activity",
                polyline=short_polyline,
                discipline="RUN",
                sb=mock_sb,
            )
        
        # Should return 0 segments processed
        assert result == 0
        # Database should not be called
        mock_sb.table.assert_not_called()

    async def test_activity_over_500m_is_processed(self):
        """Activities over 500m are processed correctly."""
        # Create a mock Supabase client with proper chained method mocking
        mock_sb = MagicMock()
        
        # Mock the chained query builder pattern: sb.table().select().eq().eq().execute()
        mock_execute = AsyncMock(return_value=MagicMock(data=[]))
        mock_eq2 = MagicMock()
        mock_eq2.execute = mock_execute
        mock_eq1 = MagicMock()
        mock_eq1.eq.return_value = mock_eq2
        mock_select = MagicMock()
        mock_select.eq.return_value = mock_eq1
        
        # Mock insert chain: sb.table().insert().execute()
        mock_insert_execute = AsyncMock(return_value=MagicMock())
        mock_insert = MagicMock()
        mock_insert.execute = mock_insert_execute
        
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_table.insert.return_value = mock_insert
        mock_sb.table.return_value = mock_table
        
        with patch("app.services.route_popularity._decode_polyline") as mock_decode:
            # Return points that form a path > 500m
            # Create points approximately 100m apart, 6 points = ~500m
            mock_decode.return_value = [
                (48.1234, 11.5678),
                (48.1243, 11.5678),  # ~100m
                (48.1252, 11.5678),  # ~200m
                (48.1261, 11.5678),  # ~300m
                (48.1270, 11.5678),  # ~400m
                (48.1279, 11.5678),  # ~500m
                (48.1288, 11.5678),  # ~600m
            ]
            
            result = await extract_and_store_segments(
                activity_id="test-activity",
                polyline="valid_polyline",
                discipline="RUN",
                sb=mock_sb,
            )
        
        # Should process segments (at least 1)
        assert result > 0

    async def test_empty_polyline_returns_zero(self):
        """Empty polyline returns 0 segments."""
        mock_sb = MagicMock()
        
        result = await extract_and_store_segments(
            activity_id="test-activity",
            polyline="",
            discipline="RUN",
            sb=mock_sb,
        )
        
        assert result == 0

    async def test_none_polyline_returns_zero(self):
        """None polyline returns 0 segments."""
        mock_sb = MagicMock()
        
        result = await extract_and_store_segments(
            activity_id="test-activity",
            polyline=None,
            discipline="RUN",
            sb=mock_sb,
        )
        
        assert result == 0

    async def test_single_point_polyline_returns_zero(self):
        """Polyline with single point returns 0 segments."""
        mock_sb = MagicMock()
        
        with patch("app.services.route_popularity._decode_polyline") as mock_decode:
            mock_decode.return_value = [(48.1234, 11.5678)]
            
            result = await extract_and_store_segments(
                activity_id="test-activity",
                polyline="single_point",
                discipline="RUN",
                sb=mock_sb,
            )
        
        assert result == 0


# ---------------------------------------------------------------------------
# get_segment_popularity tests - Requirement 3.4
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetSegmentPopularity:
    """Tests for get_segment_popularity with time decay application."""

    async def test_empty_segment_list_returns_empty_dict(self):
        """Empty segment hash list returns empty dictionary."""
        mock_sb = MagicMock()
        
        result = await get_segment_popularity([], "RUN", mock_sb)
        
        assert result == {}

    async def test_applies_recent_weight_to_recent_segments(self):
        """Recent segments (≤90 days) get 100% weight."""
        mock_sb = MagicMock()
        
        now = datetime.now(timezone.utc)
        recent_timestamp = (now - timedelta(days=30)).isoformat()
        
        # Mock the chained query builder: sb.table().select().in_().eq().execute()
        mock_execute = AsyncMock(return_value=MagicMock(data=[
            {
                "segment_hash": "hash1",
                "usage_count": 100,
                "last_used_at": recent_timestamp,
            }
        ]))
        mock_eq = MagicMock()
        mock_eq.execute = mock_execute
        mock_in = MagicMock()
        mock_in.eq.return_value = mock_eq
        mock_select = MagicMock()
        mock_select.in_.return_value = mock_in
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_sb.table.return_value = mock_table
        
        result = await get_segment_popularity(["hash1"], "RUN", mock_sb)
        
        # 100 * 1.0 = 100
        assert result["hash1"] == 100

    async def test_applies_medium_weight_to_medium_age_segments(self):
        """Medium age segments (91-180 days) get 50% weight."""
        mock_sb = MagicMock()
        
        now = datetime.now(timezone.utc)
        medium_timestamp = (now - timedelta(days=120)).isoformat()
        
        # Mock the chained query builder
        mock_execute = AsyncMock(return_value=MagicMock(data=[
            {
                "segment_hash": "hash1",
                "usage_count": 100,
                "last_used_at": medium_timestamp,
            }
        ]))
        mock_eq = MagicMock()
        mock_eq.execute = mock_execute
        mock_in = MagicMock()
        mock_in.eq.return_value = mock_eq
        mock_select = MagicMock()
        mock_select.in_.return_value = mock_in
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_sb.table.return_value = mock_table
        
        result = await get_segment_popularity(["hash1"], "RUN", mock_sb)
        
        # 100 * 0.5 = 50
        assert result["hash1"] == 50

    async def test_applies_old_weight_to_old_segments(self):
        """Old segments (>180 days) get 25% weight."""
        mock_sb = MagicMock()
        
        now = datetime.now(timezone.utc)
        old_timestamp = (now - timedelta(days=200)).isoformat()
        
        # Mock the chained query builder
        mock_execute = AsyncMock(return_value=MagicMock(data=[
            {
                "segment_hash": "hash1",
                "usage_count": 100,
                "last_used_at": old_timestamp,
            }
        ]))
        mock_eq = MagicMock()
        mock_eq.execute = mock_execute
        mock_in = MagicMock()
        mock_in.eq.return_value = mock_eq
        mock_select = MagicMock()
        mock_select.in_.return_value = mock_in
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_sb.table.return_value = mock_table
        
        result = await get_segment_popularity(["hash1"], "RUN", mock_sb)
        
        # 100 * 0.25 = 25
        assert result["hash1"] == 25

    async def test_weighted_count_is_rounded_to_integer(self):
        """Weighted counts are rounded to integers."""
        mock_sb = MagicMock()
        
        now = datetime.now(timezone.utc)
        medium_timestamp = (now - timedelta(days=120)).isoformat()
        
        # Mock the chained query builder
        mock_execute = AsyncMock(return_value=MagicMock(data=[
            {
                "segment_hash": "hash1",
                "usage_count": 99,  # 99 * 0.5 = 49.5 -> rounds to 50
                "last_used_at": medium_timestamp,
            }
        ]))
        mock_eq = MagicMock()
        mock_eq.execute = mock_execute
        mock_in = MagicMock()
        mock_in.eq.return_value = mock_eq
        mock_select = MagicMock()
        mock_select.in_.return_value = mock_in
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_sb.table.return_value = mock_table
        
        result = await get_segment_popularity(["hash1"], "RUN", mock_sb)
        
        # 99 * 0.5 = 49.5, rounded to 50
        assert result["hash1"] == 50
        assert isinstance(result["hash1"], int)

    async def test_multiple_segments_with_different_ages(self):
        """Multiple segments with different ages get appropriate weights."""
        mock_sb = MagicMock()
        
        now = datetime.now(timezone.utc)
        
        # Mock the chained query builder
        mock_execute = AsyncMock(return_value=MagicMock(data=[
            {
                "segment_hash": "recent",
                "usage_count": 100,
                "last_used_at": (now - timedelta(days=30)).isoformat(),
            },
            {
                "segment_hash": "medium",
                "usage_count": 100,
                "last_used_at": (now - timedelta(days=120)).isoformat(),
            },
            {
                "segment_hash": "old",
                "usage_count": 100,
                "last_used_at": (now - timedelta(days=200)).isoformat(),
            },
        ]))
        mock_eq = MagicMock()
        mock_eq.execute = mock_execute
        mock_in = MagicMock()
        mock_in.eq.return_value = mock_eq
        mock_select = MagicMock()
        mock_select.in_.return_value = mock_in
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_sb.table.return_value = mock_table
        
        result = await get_segment_popularity(
            ["recent", "medium", "old"], "RUN", mock_sb
        )
        
        assert result["recent"] == 100  # 100 * 1.0
        assert result["medium"] == 50   # 100 * 0.5
        assert result["old"] == 25      # 100 * 0.25


# ---------------------------------------------------------------------------
# Coordinate rounding tests - Requirement 3.3
# ---------------------------------------------------------------------------


class TestCoordinateRounding:
    """Tests for coordinate rounding to 4 decimal places."""

    def test_round_coordinate_to_4_decimal_places(self):
        """Coordinates are rounded to 4 decimal places."""
        assert _round_coordinate(48.12345678) == 48.1235
        assert _round_coordinate(11.56784321) == 11.5678
        assert _round_coordinate(-33.86881234) == -33.8688

    def test_round_coordinate_preserves_4_decimal_places(self):
        """Coordinates with 4 or fewer decimals are preserved."""
        assert _round_coordinate(48.1234) == 48.1234
        assert _round_coordinate(48.123) == 48.123
        assert _round_coordinate(48.0) == 48.0


# ---------------------------------------------------------------------------
# Segment resolution tests - Requirement 3.3
# ---------------------------------------------------------------------------


class TestSegmentResolution:
    """Tests for segment resolution constant."""

    def test_segment_resolution_is_100m(self):
        """Segment resolution constant is 100 meters."""
        assert SEGMENT_RESOLUTION_METERS == 100


# ---------------------------------------------------------------------------
# Time decay constants tests - Requirement 3.4
# ---------------------------------------------------------------------------


class TestTimeDecayConstants:
    """Tests for time decay threshold constants."""

    def test_time_decay_thresholds(self):
        """Time decay thresholds are correctly defined."""
        assert TIME_DECAY_90_DAYS == 90
        assert TIME_DECAY_180_DAYS == 180

    def test_weight_constants(self):
        """Weight constants are correctly defined."""
        assert WEIGHT_RECENT == 1.0    # 100%
        assert WEIGHT_MEDIUM == 0.5    # 50%
        assert WEIGHT_OLD == 0.25      # 25%
