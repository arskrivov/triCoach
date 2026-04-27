"""Integration tests for workout-route linking endpoints.

Tests cover:
- PUT /workouts/{workout_id}/route  (link route)
- DELETE /workouts/{workout_id}/route  (unlink route)
- GET /workouts/{workout_id}  (verify route data included)
- Discipline validation (only RUN, RIDE_ROAD, RIDE_GRAVEL allowed)

All Supabase calls are mocked so no database is required.

Validates: Requirements 1.4, 1.6, 1.7
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_supabase
from app.main import app
from app.models import UserRow
from app.services.auth import get_current_user

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

USER_ID = "user-test-123"
WORKOUT_ID = str(uuid.uuid4())
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


def _make_workout_row(
    discipline: str = "RUN",
    route_id: str | None = None,
    workout_id: str = WORKOUT_ID,
) -> dict:
    return {
        "id": workout_id,
        "user_id": USER_ID,
        "name": "Morning Run",
        "discipline": discipline,
        "builder_type": "STRUCTURED",
        "description": None,
        "content": {},
        "estimated_duration_seconds": 3600,
        "estimated_tss": None,
        "estimated_volume_kg": None,
        "garmin_workout_id": None,
        "is_template": False,
        "scheduled_date": None,
        "route_id": route_id,
    }


def _make_route_row(route_id: str = ROUTE_ID) -> dict:
    return {
        "id": route_id,
        "user_id": USER_ID,
        "name": "Park Loop",
        "sport": "RUN",
        "start_lat": 48.1,
        "start_lng": 11.5,
        "end_lat": None,
        "end_lng": None,
        "is_loop": True,
        "distance_meters": 5000.0,
        "elevation_gain_meters": 50.0,
        "elevation_loss_meters": 45.0,
        "estimated_duration_seconds": 1800,
        "geojson": {"type": "Feature", "geometry": {"type": "LineString", "coordinates": []}},
        "gpx_data": None,
    }


def _make_supabase_response(data: list | None = None) -> MagicMock:
    res = MagicMock()
    res.data = data if data is not None else []
    return res


def _make_query_chain(data: list | None = None) -> MagicMock:
    """Create a chainable mock that mimics Supabase query builder."""
    chain = MagicMock()
    chain.select = MagicMock(return_value=chain)
    chain.eq = MagicMock(return_value=chain)
    chain.limit = MagicMock(return_value=chain)
    chain.order = MagicMock(return_value=chain)
    chain.range = MagicMock(return_value=chain)
    chain.insert = MagicMock(return_value=chain)
    chain.update = MagicMock(return_value=chain)
    chain.delete = MagicMock(return_value=chain)
    chain.is_ = MagicMock(return_value=chain)
    chain.execute = AsyncMock(return_value=_make_supabase_response(data))
    return chain


def _make_sb(
    workouts_select: list | None = None,
    workouts_update: list | None = None,
    routes_select: list | None = None,
) -> MagicMock:
    """Build a mock Supabase client with per-table, per-operation responses.

    The mock tracks which table is being queried and returns the appropriate
    chain based on whether it's a select or update operation.
    """
    sb = MagicMock()

    # We need to track calls per table to return different data
    # for select vs update operations on the same table.
    workout_select_chain = _make_query_chain(workouts_select)
    workout_update_chain = _make_query_chain(workouts_update)
    route_select_chain = _make_query_chain(routes_select)

    def table_side_effect(table_name: str):
        if table_name == "workouts":
            # Return a chain that dispatches select vs update
            chain = MagicMock()
            chain.select = MagicMock(return_value=workout_select_chain)
            chain.update = MagicMock(return_value=workout_update_chain)
            chain.delete = MagicMock(return_value=workout_update_chain)
            return chain
        if table_name == "routes":
            chain = MagicMock()
            chain.select = MagicMock(return_value=route_select_chain)
            return chain
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
    """Returns a factory that creates an AsyncClient with the given Supabase mock."""

    async def _create(sb_mock: MagicMock):
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_supabase] = lambda: sb_mock
        transport = ASGITransport(app=app)
        client = AsyncClient(transport=transport, base_url=BASE_URL)
        return client

    return _create


@pytest.fixture(autouse=True)
def _cleanup_overrides():
    """Clean up FastAPI dependency overrides after each test."""
    yield
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tests: PUT /workouts/{workout_id}/route — Link route
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_link_route_to_run_workout(client_factory):
    """Successfully link a route to a RUN workout."""
    workout = _make_workout_row(discipline="RUN")
    updated_workout = {**workout, "route_id": ROUTE_ID}
    route = _make_route_row()

    sb = _make_sb(
        workouts_select=[workout],
        workouts_update=[updated_workout],
        routes_select=[route],
    )

    async with await client_factory(sb) as client:
        resp = await client.put(
            f"/workouts/{WORKOUT_ID}/route",
            json={"route_id": ROUTE_ID},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["route_id"] == ROUTE_ID
    assert data["discipline"] == "RUN"


@pytest.mark.asyncio
async def test_link_route_to_ride_road_workout(client_factory):
    """Successfully link a route to a RIDE_ROAD workout."""
    workout = _make_workout_row(discipline="RIDE_ROAD")
    updated_workout = {**workout, "route_id": ROUTE_ID}
    route = _make_route_row()

    sb = _make_sb(
        workouts_select=[workout],
        workouts_update=[updated_workout],
        routes_select=[route],
    )

    async with await client_factory(sb) as client:
        resp = await client.put(
            f"/workouts/{WORKOUT_ID}/route",
            json={"route_id": ROUTE_ID},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["route_id"] == ROUTE_ID
    assert data["discipline"] == "RIDE_ROAD"


@pytest.mark.asyncio
async def test_link_route_to_ride_gravel_workout(client_factory):
    """Successfully link a route to a RIDE_GRAVEL workout."""
    workout = _make_workout_row(discipline="RIDE_GRAVEL")
    updated_workout = {**workout, "route_id": ROUTE_ID}
    route = _make_route_row()

    sb = _make_sb(
        workouts_select=[workout],
        workouts_update=[updated_workout],
        routes_select=[route],
    )

    async with await client_factory(sb) as client:
        resp = await client.put(
            f"/workouts/{WORKOUT_ID}/route",
            json={"route_id": ROUTE_ID},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["route_id"] == ROUTE_ID


@pytest.mark.asyncio
async def test_link_route_rejected_for_swim(client_factory):
    """Reject linking a route to a SWIM workout (400)."""
    workout = _make_workout_row(discipline="SWIM")

    sb = _make_sb(workouts_select=[workout])

    async with await client_factory(sb) as client:
        resp = await client.put(
            f"/workouts/{WORKOUT_ID}/route",
            json={"route_id": ROUTE_ID},
        )

    assert resp.status_code == 400
    assert "discipline" in resp.json()["detail"].lower() or "linking" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_link_route_rejected_for_strength(client_factory):
    """Reject linking a route to a STRENGTH workout (400)."""
    workout = _make_workout_row(discipline="STRENGTH")

    sb = _make_sb(workouts_select=[workout])

    async with await client_factory(sb) as client:
        resp = await client.put(
            f"/workouts/{WORKOUT_ID}/route",
            json={"route_id": ROUTE_ID},
        )

    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_link_route_workout_not_found(client_factory):
    """Return 404 when workout does not exist."""
    sb = _make_sb(workouts_select=[])

    async with await client_factory(sb) as client:
        resp = await client.put(
            f"/workouts/{WORKOUT_ID}/route",
            json={"route_id": ROUTE_ID},
        )

    assert resp.status_code == 404
    assert "workout" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_link_route_route_not_found(client_factory):
    """Return 404 when route does not exist."""
    workout = _make_workout_row(discipline="RUN")

    sb = _make_sb(
        workouts_select=[workout],
        routes_select=[],
    )

    async with await client_factory(sb) as client:
        resp = await client.put(
            f"/workouts/{WORKOUT_ID}/route",
            json={"route_id": ROUTE_ID},
        )

    assert resp.status_code == 404
    assert "route" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Tests: DELETE /workouts/{workout_id}/route — Unlink route
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unlink_route_from_workout(client_factory):
    """Successfully unlink a route from a workout (204)."""
    workout = _make_workout_row(discipline="RUN", route_id=ROUTE_ID)

    sb = _make_sb(workouts_select=[workout], workouts_update=[])

    async with await client_factory(sb) as client:
        resp = await client.delete(f"/workouts/{WORKOUT_ID}/route")

    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_unlink_route_workout_not_found(client_factory):
    """Return 404 when trying to unlink from non-existent workout."""
    sb = _make_sb(workouts_select=[])

    async with await client_factory(sb) as client:
        resp = await client.delete(f"/workouts/{WORKOUT_ID}/route")

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Tests: GET /workouts/{workout_id} — Route data included
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_workout_includes_route_data(client_factory):
    """GET workout includes nested route data when a route is linked."""
    workout = _make_workout_row(discipline="RUN", route_id=ROUTE_ID)
    route = _make_route_row()

    sb = _make_sb(
        workouts_select=[workout],
        routes_select=[route],
    )

    async with await client_factory(sb) as client:
        resp = await client.get(f"/workouts/{WORKOUT_ID}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["route_id"] == ROUTE_ID
    assert data["route"] is not None
    assert data["route"]["id"] == ROUTE_ID
    assert data["route"]["name"] == "Park Loop"
    assert data["route"]["distance_meters"] == 5000.0


@pytest.mark.asyncio
async def test_get_workout_without_route(client_factory):
    """GET workout returns null route when no route is linked."""
    workout = _make_workout_row(discipline="RUN", route_id=None)

    sb = _make_sb(workouts_select=[workout])

    async with await client_factory(sb) as client:
        resp = await client.get(f"/workouts/{WORKOUT_ID}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["route_id"] is None
    assert data["route"] is None
