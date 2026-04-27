"""Integration tests for POST /routes/{route_id}/sync-garmin endpoint.

Tests cover:
- Successful sync for RIDE_ROAD route
- Successful sync for RIDE_GRAVEL route
- Rejection for non-cycling routes (RUN)
- Route not found (404)

All Supabase and Garmin calls are mocked so no external services are required.

Validates: Requirements 4.1, 4.6
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_supabase
from app.main import app
from app.models import UserRow
from app.services.auth import get_current_user
from app.services.garmin_course_sync import GarminCourseResult

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

USER_ID = "user-garmin-test-123"
ROUTE_ID = str(uuid.uuid4())
BASE_URL = "http://test/api/v1"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user() -> UserRow:
    return UserRow(
        id=USER_ID,
        email="test@example.com",
        name="Test User",
    )


def _make_route_row(sport: str = "RIDE_ROAD", route_id: str = ROUTE_ID) -> dict:
    return {
        "id": route_id,
        "user_id": USER_ID,
        "name": "Cycling Loop",
        "sport": sport,
        "start_lat": 48.1,
        "start_lng": 11.5,
        "end_lat": None,
        "end_lng": None,
        "is_loop": True,
        "distance_meters": 40000.0,
        "elevation_gain_meters": 300.0,
        "elevation_loss_meters": 290.0,
        "estimated_duration_seconds": 5400,
        "geojson": {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[11.5, 48.1], [11.51, 48.11]],
            },
        },
        "gpx_data": None,
        "garmin_course_id": None,
        "surface_breakdown": None,
    }


def _make_supabase_response(data: list | None = None) -> MagicMock:
    res = MagicMock()
    res.data = data if data is not None else []
    return res


def _make_query_chain(data: list | None = None) -> MagicMock:
    chain = MagicMock()
    chain.select = MagicMock(return_value=chain)
    chain.eq = MagicMock(return_value=chain)
    chain.limit = MagicMock(return_value=chain)
    chain.execute = AsyncMock(return_value=_make_supabase_response(data))
    return chain


def _make_sb(routes_select: list | None = None) -> MagicMock:
    sb = MagicMock()
    route_chain = _make_query_chain(routes_select)

    def table_side_effect(table_name: str):
        if table_name == "routes":
            return route_chain
        return _make_query_chain([])

    sb.table = MagicMock(side_effect=table_side_effect)
    return sb


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_user():
    return _make_user()


@pytest.fixture
def client_factory(mock_user):
    async def _create(sb_mock: MagicMock):
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_supabase] = lambda: sb_mock
        transport = ASGITransport(app=app)
        client = AsyncClient(transport=transport, base_url=BASE_URL)
        return client

    return _create


@pytest.fixture(autouse=True)
def _cleanup_overrides():
    yield
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tests: POST /routes/{route_id}/sync-garmin
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("app.routers.routes.sync_route_to_garmin")
async def test_sync_garmin_ride_road_success(mock_sync, client_factory):
    """Successfully sync a RIDE_ROAD route to Garmin."""
    route = _make_route_row(sport="RIDE_ROAD")
    sb = _make_sb(routes_select=[route])

    mock_sync.return_value = GarminCourseResult(
        garmin_course_id=12345,
        course_name="Cycling Loop",
        uploaded_at="2024-01-01T00:00:00+00:00",
    )

    async with await client_factory(sb) as client:
        resp = await client.post(f"/routes/{ROUTE_ID}/sync-garmin")

    assert resp.status_code == 200
    data = resp.json()
    assert data["garmin_course_id"] == 12345
    assert "Cycling Loop" in data["message"]
    mock_sync.assert_awaited_once_with(
        route_id=ROUTE_ID,
        user_id=USER_ID,
        sb=sb,
    )


@pytest.mark.asyncio
@patch("app.routers.routes.sync_route_to_garmin")
async def test_sync_garmin_ride_gravel_success(mock_sync, client_factory):
    """Successfully sync a RIDE_GRAVEL route to Garmin."""
    route = _make_route_row(sport="RIDE_GRAVEL")
    sb = _make_sb(routes_select=[route])

    mock_sync.return_value = GarminCourseResult(
        garmin_course_id=67890,
        course_name="Gravel Adventure",
        uploaded_at="2024-01-01T00:00:00+00:00",
    )

    async with await client_factory(sb) as client:
        resp = await client.post(f"/routes/{ROUTE_ID}/sync-garmin")

    assert resp.status_code == 200
    data = resp.json()
    assert data["garmin_course_id"] == 67890


@pytest.mark.asyncio
async def test_sync_garmin_rejected_for_run(client_factory):
    """Reject Garmin sync for a RUN route (400)."""
    route = _make_route_row(sport="RUN")
    sb = _make_sb(routes_select=[route])

    async with await client_factory(sb) as client:
        resp = await client.post(f"/routes/{ROUTE_ID}/sync-garmin")

    assert resp.status_code == 400
    assert "cycling" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_sync_garmin_route_not_found(client_factory):
    """Return 404 when route does not exist."""
    sb = _make_sb(routes_select=[])

    async with await client_factory(sb) as client:
        resp = await client.post(f"/routes/{ROUTE_ID}/sync-garmin")

    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()
