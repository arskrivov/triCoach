"""Integration tests for routes router extensions.

Tests cover:
- POST /routes/suggestions  (route suggestions endpoint)
- GET /routes/{route_id}/check-prohibited  (prohibited area check endpoint)

Garmin sync endpoint tests are in test_garmin_sync_endpoint.py.

All Supabase and service calls are mocked so no external services are required.

Validates: Requirements 2.1, 4.1, 6.2
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
from app.services.route_suggestions import RouteSuggestion

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

USER_ID = "user-routes-ext-test-123"
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


def _make_route_row(route_id: str = ROUTE_ID, sport: str = "RUN") -> dict:
    return {
        "id": route_id,
        "user_id": USER_ID,
        "name": "Park Loop",
        "sport": sport,
        "start_lat": 48.1,
        "start_lng": 11.5,
        "end_lat": None,
        "end_lng": None,
        "is_loop": True,
        "distance_meters": 5000.0,
        "elevation_gain_meters": 50.0,
        "elevation_loss_meters": 45.0,
        "estimated_duration_seconds": 1800,
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
    chain.order = MagicMock(return_value=chain)
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


def _make_suggestion(route_id: str = ROUTE_ID) -> RouteSuggestion:
    return RouteSuggestion(
        route_id=route_id,
        name="Park Loop",
        distance_meters=5000.0,
        elevation_gain_meters=50.0,
        popularity_score=0.8,
        discipline_match_score=0.7,
        distance_match_score=0.9,
        elevation_match_score=0.5,
        combined_score=0.76,
        usage_count_90d=12,
        surface_breakdown={"asphalt": 80.0, "gravel": 20.0},
        popularity_label="🔥 Popular",
    )


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
# Tests: POST /routes/suggestions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("app.routers.routes.get_route_suggestions")
async def test_suggestions_returns_list(mock_get_suggestions, client_factory):
    """Successful suggestions request returns a list of suggestions."""
    suggestion = _make_suggestion()
    mock_get_suggestions.return_value = [suggestion]

    sb = _make_sb()

    async with await client_factory(sb) as client:
        resp = await client.post(
            "/routes/suggestions",
            json={
                "discipline": "RUN",
                "target_distance_meters": 5000.0,
                "start_lat": 48.1,
                "start_lng": 11.5,
            },
        )

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["id"] == ROUTE_ID
    assert data[0]["name"] == "Park Loop"
    assert data[0]["distance_meters"] == 5000.0
    assert data[0]["popularity_score"] == 0.8
    assert data[0]["combined_score"] == 0.76
    assert data[0]["usage_count_90d"] == 12
    assert data[0]["popularity_label"] == "🔥 Popular"

    mock_get_suggestions.assert_awaited_once()


@pytest.mark.asyncio
async def test_suggestions_invalid_discipline_returns_400(client_factory):
    """Invalid discipline returns 400 error."""
    sb = _make_sb()

    async with await client_factory(sb) as client:
        resp = await client.post(
            "/routes/suggestions",
            json={
                "discipline": "SWIM",
                "target_distance_meters": 1500.0,
                "start_lat": 48.1,
                "start_lng": 11.5,
            },
        )

    assert resp.status_code == 400
    assert "discipline" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Tests: GET /routes/{route_id}/check-prohibited
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("app.routers.routes.check_route_prohibited_areas")
async def test_check_prohibited_no_areas(mock_check, client_factory):
    """Route with no prohibited areas returns has_prohibited_areas=false."""
    mock_check.return_value = []

    route = _make_route_row()
    sb = _make_sb(routes_select=[route])

    async with await client_factory(sb) as client:
        resp = await client.get(f"/routes/{ROUTE_ID}/check-prohibited")

    assert resp.status_code == 200
    data = resp.json()
    assert data["has_prohibited_areas"] is False
    assert data["areas"] == []

    mock_check.assert_awaited_once()


@pytest.mark.asyncio
async def test_check_prohibited_route_not_found(client_factory):
    """Return 404 when route does not exist."""
    sb = _make_sb(routes_select=[])

    async with await client_factory(sb) as client:
        resp = await client.get(f"/routes/{ROUTE_ID}/check-prohibited")

    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()
