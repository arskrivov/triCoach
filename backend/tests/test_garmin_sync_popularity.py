"""Unit tests for popularity extraction integration in garmin_sync.sync_activities.

Tests verify that extract_and_store_segments is called for endurance activities
with polylines, and that failures don't block the sync.

Validates: Requirements 3.1, 3.5
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.garmin_sync import sync_activities

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

USER_ID = "user-pop-test-123"


def _make_garmin_client(activities: list[dict] | None = None) -> MagicMock:
    """Create a mock Garmin client that returns the given activities."""
    client = MagicMock()
    client.get_activities_by_date = MagicMock(return_value=activities or [])
    client.get_activity = MagicMock(return_value=None)
    client.get_activity_details = MagicMock(return_value=None)
    client.get_activity_splits = MagicMock(return_value=None)
    client.get_activity_hr_in_timezones = MagicMock(return_value=None)
    client.get_activity_weather = MagicMock(return_value=None)
    client.get_activity_exercise_sets = MagicMock(return_value=None)
    client.download_activity = MagicMock(return_value=b"")
    client.ActivityDownloadFormat = MagicMock()
    client.ActivityDownloadFormat.ORIGINAL = MagicMock(name="ORIGINAL")
    client.ActivityDownloadFormat.GPX = MagicMock(name="GPX")
    return client


def _make_sb() -> MagicMock:
    """Create a mock Supabase client with chainable table methods."""
    sb = MagicMock()

    def _chain(data=None):
        chain = MagicMock()
        chain.select = MagicMock(return_value=chain)
        chain.eq = MagicMock(return_value=chain)
        chain.in_ = MagicMock(return_value=chain)
        chain.limit = MagicMock(return_value=chain)
        chain.upsert = MagicMock(return_value=chain)
        chain.update = MagicMock(return_value=chain)
        resp = MagicMock()
        resp.data = data or []
        chain.execute = AsyncMock(return_value=resp)
        return chain

    sb.table = MagicMock(side_effect=lambda name: _chain())
    return sb


def _make_activity_summary(
    activity_id: int,
    type_key: str = "running",
    distance: float = 5000.0,
) -> dict:
    """Create a minimal Garmin activity summary."""
    return {
        "activityId": activity_id,
        "activityType": {"typeKey": type_key},
        "startTimeLocal": "2024-06-01T08:00:00",
        "duration": 1800,
        "calories": 300,
        "distance": distance,
        "activityName": f"Activity {activity_id}",
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("app.services.garmin_sync.extract_and_store_segments", new_callable=AsyncMock)
@patch("app.services.garmin_sync.get_garmin_client", new_callable=AsyncMock)
@patch("app.services.garmin_sync._has_activity_files_table", new_callable=AsyncMock)
async def test_popularity_extraction_called_for_endurance_with_polyline(
    mock_has_files_table,
    mock_get_client,
    mock_extract,
):
    """extract_and_store_segments is called for endurance activities with a polyline."""
    mock_has_files_table.return_value = False

    activities = [_make_activity_summary(1001, "running", 5000.0)]
    mock_get_client.return_value = _make_garmin_client(activities)

    # Mock _parse_endurance to include a polyline in the record
    with patch(
        "app.services.garmin_sync._parse_endurance",
        return_value={
            "distance_meters": 5000.0,
            "polyline": "encoded_polyline_data",
            "avg_hr": 150,
        },
    ):
        mock_extract.return_value = 42
        sb = _make_sb()
        count, files = await sync_activities(USER_ID, sb)

    mock_extract.assert_awaited_once_with(
        activity_id="1001",
        polyline="encoded_polyline_data",
        discipline="RUN",
        sb=sb,
    )


@pytest.mark.asyncio
@patch("app.services.garmin_sync.extract_and_store_segments", new_callable=AsyncMock)
@patch("app.services.garmin_sync.get_garmin_client", new_callable=AsyncMock)
@patch("app.services.garmin_sync._has_activity_files_table", new_callable=AsyncMock)
async def test_popularity_extraction_skipped_for_non_endurance(
    mock_has_files_table,
    mock_get_client,
    mock_extract,
):
    """extract_and_store_segments is NOT called for strength activities."""
    mock_has_files_table.return_value = False

    activities = [_make_activity_summary(2001, "strength_training")]
    mock_get_client.return_value = _make_garmin_client(activities)

    sb = _make_sb()
    count, files = await sync_activities(USER_ID, sb)

    mock_extract.assert_not_awaited()


@pytest.mark.asyncio
@patch("app.services.garmin_sync.extract_and_store_segments", new_callable=AsyncMock)
@patch("app.services.garmin_sync.get_garmin_client", new_callable=AsyncMock)
@patch("app.services.garmin_sync._has_activity_files_table", new_callable=AsyncMock)
async def test_popularity_extraction_skipped_when_no_polyline(
    mock_has_files_table,
    mock_get_client,
    mock_extract,
):
    """extract_and_store_segments is NOT called when activity has no polyline."""
    mock_has_files_table.return_value = False

    activities = [_make_activity_summary(3001, "running", 5000.0)]
    mock_get_client.return_value = _make_garmin_client(activities)

    # _parse_endurance returns no polyline
    with patch(
        "app.services.garmin_sync._parse_endurance",
        return_value={"distance_meters": 5000.0, "polyline": None},
    ):
        sb = _make_sb()
        count, files = await sync_activities(USER_ID, sb)

    mock_extract.assert_not_awaited()


@pytest.mark.asyncio
@patch("app.services.garmin_sync.extract_and_store_segments", new_callable=AsyncMock)
@patch("app.services.garmin_sync.get_garmin_client", new_callable=AsyncMock)
@patch("app.services.garmin_sync._has_activity_files_table", new_callable=AsyncMock)
async def test_popularity_extraction_failure_does_not_block_sync(
    mock_has_files_table,
    mock_get_client,
    mock_extract,
):
    """If extract_and_store_segments raises, sync_activities still completes."""
    mock_has_files_table.return_value = False

    activities = [_make_activity_summary(4001, "running", 5000.0)]
    mock_get_client.return_value = _make_garmin_client(activities)

    with patch(
        "app.services.garmin_sync._parse_endurance",
        return_value={
            "distance_meters": 5000.0,
            "polyline": "encoded_polyline_data",
        },
    ):
        mock_extract.side_effect = RuntimeError("DB connection failed")
        sb = _make_sb()
        count, files = await sync_activities(USER_ID, sb)

    # Sync should still succeed despite extraction failure
    assert count == 1
    assert files == 0
