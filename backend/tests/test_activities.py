"""Tests for activities, health-data, athlete profile, dashboard, and sync endpoints."""

from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.models.activity import Activity
from app.models.athlete import AthleteProfile
from app.models.health import DailyHealth
from app.models.user import User

TEST_DATABASE_URL = "postgresql+asyncpg://coachapp:coachapp@localhost:5432/coachapp_test"


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _register_and_login(client: AsyncClient) -> AsyncClient:
    await client.post("/api/v1/auth/register", json={
        "email": "athlete@test.com",
        "password": "pass1234",
        "name": "Test Athlete",
    })
    await client.post("/api/v1/auth/login", json={
        "email": "athlete@test.com",
        "password": "pass1234",
    })
    return client


async def _load_user(email: str) -> User:
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one()
    await engine.dispose()
    return user


async def _seed_profile_inputs(email: str) -> None:
    user = await _load_user(email)
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        now = datetime.now(timezone.utc)
        session.add_all([
            Activity(
                user_id=user.id,
                garmin_activity_id=1001,
                discipline="RIDE_ROAD",
                name="Threshold Ride",
                start_time=now - timedelta(days=5),
                duration_seconds=3600,
                normalized_power_watts=250,
                avg_power_watts=235,
                distance_meters=36000,
            ),
            Activity(
                user_id=user.id,
                garmin_activity_id=1002,
                discipline="RUN",
                name="Tempo Run",
                start_time=now - timedelta(days=4),
                duration_seconds=2100,
                avg_pace_sec_per_km=300.0,
                distance_meters=7000,
                max_hr=185,
            ),
            Activity(
                user_id=user.id,
                garmin_activity_id=1003,
                discipline="SWIM",
                name="Pool Swim",
                start_time=now - timedelta(days=3),
                duration_seconds=1800,
                avg_pace_sec_per_km=1100.0,
                distance_meters=2000,
            ),
            Activity(
                user_id=user.id,
                garmin_activity_id=1004,
                discipline="STRENGTH",
                name="Strength",
                start_time=now - timedelta(days=2),
                exercises=[
                    {"name": "Back Squat", "sets": [{"reps": 5, "weight_kg": 100.0}]},
                    {"name": "Bench Press", "sets": [{"reps": 5, "weight_kg": 80.0}]},
                    {"name": "Deadlift", "sets": [{"reps": 3, "weight_kg": 140.0}]},
                    {"name": "Overhead Press", "sets": [{"reps": 5, "weight_kg": 50.0}]},
                ],
            ),
            DailyHealth(
                user_id=user.id,
                date=date.today() - timedelta(days=1),
                resting_hr=48,
            ),
            DailyHealth(
                user_id=user.id,
                date=date.today() - timedelta(days=2),
                resting_hr=50,
            ),
        ])
        await session.commit()
    await engine.dispose()


async def _seed_garmin_connection(email: str) -> User:
    user = await _load_user(email)
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        db_user = await session.get(User, user.id)
        assert db_user is not None
        db_user.garmin_email = "athlete@garmin.test"
        db_user.garmin_session_data = "fake-encrypted-session"
        db_user.garmin_connected_at = datetime.now(timezone.utc)
        await session.commit()
    await engine.dispose()
    return user


# ── Activity list ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_activities_empty(client: AsyncClient):
    await _register_and_login(client)
    resp = await client.get("/api/v1/activities")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_activities_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/activities")
    assert resp.status_code == 401


# ── Dashboard ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dashboard_empty(client: AsyncClient):
    await _register_and_login(client)
    resp = await client.get("/api/v1/activities/dashboard")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_activities_30d"] == 0
    assert data["total_distance_km_30d"] == 0.0
    assert data["total_duration_hours_30d"] == 0.0
    assert data["discipline_breakdown_30d"] == {}
    assert data["avg_sleep_score_7d"] is None
    assert data["avg_hrv_7d"] is None
    assert data["recent_activities"] == []


# ── Health data ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_data_empty(client: AsyncClient):
    await _register_and_login(client)
    resp = await client.get("/api/v1/activities/health-data/range?days=7")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_health_data_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/activities/health-data/range")
    assert resp.status_code == 401


# ── Athlete profile ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_athlete_profile_defaults(client: AsyncClient):
    await _register_and_login(client)
    resp = await client.get("/api/v1/activities/profile/athlete")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ftp_watts"] is None
    assert data["mobility_sessions_per_week_target"] == 2


@pytest.mark.asyncio
async def test_update_athlete_profile(client: AsyncClient):
    await _register_and_login(client)
    resp = await client.put("/api/v1/activities/profile/athlete", json={
        "ftp_watts": 280,
        "weight_kg": 72.5,
        "squat_1rm_kg": 120.0,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["ftp_watts"] == 280
    assert data["weight_kg"] == 72.5
    assert data["squat_1rm_kg"] == 120.0
    assert data["mobility_sessions_per_week_target"] == 2  # default preserved


@pytest.mark.asyncio
async def test_update_athlete_profile_idempotent(client: AsyncClient):
    await _register_and_login(client)
    await client.put("/api/v1/activities/profile/athlete", json={"ftp_watts": 250})
    resp = await client.put("/api/v1/activities/profile/athlete", json={"ftp_watts": 260})
    assert resp.status_code == 200
    assert resp.json()["ftp_watts"] == 260


@pytest.mark.asyncio
async def test_get_athlete_profile_uses_garmin_derived_values(client: AsyncClient):
    email = "athlete@test.com"
    await _register_and_login(client)
    await _seed_profile_inputs(email)

    resp = await client.get("/api/v1/activities/profile/athlete")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ftp_watts"] == 238
    assert data["threshold_pace_sec_per_km"] == 309.0
    assert data["swim_css_sec_per_100m"] == 113.3
    assert data["max_hr"] == 185
    assert data["resting_hr"] == 49
    assert data["squat_1rm_kg"] == 116.7
    assert data["bench_1rm_kg"] == 93.3
    assert data["deadlift_1rm_kg"] == 154.0
    assert data["overhead_press_1rm_kg"] == 58.3


@pytest.mark.asyncio
async def test_manual_athlete_profile_overrides_derived_values(client: AsyncClient):
    email = "athlete@test.com"
    await _register_and_login(client)
    await _seed_profile_inputs(email)
    user = await _load_user(email)

    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        session.add(AthleteProfile(
            user_id=user.id,
            ftp_watts=300,
            threshold_pace_sec_per_km=280.0,
            max_hr=190,
            mobility_sessions_per_week_target=4,
        ))
        await session.commit()
    await engine.dispose()

    resp = await client.get("/api/v1/activities/profile/athlete")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ftp_watts"] == 300
    assert data["threshold_pace_sec_per_km"] == 280.0
    assert data["max_hr"] == 190
    assert data["resting_hr"] == 49
    assert data["mobility_sessions_per_week_target"] == 4


# ── Activity detail 404 ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_activity_detail_not_found(client: AsyncClient):
    await _register_and_login(client)
    resp = await client.get("/api/v1/activities/00000000-0000-0000-0000-000000000001")
    assert resp.status_code == 404


# ── Sync endpoints ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sync_now_no_garmin(client: AsyncClient):
    """Should return 400 when Garmin is not connected."""
    await _register_and_login(client)
    resp = await client.post("/api/v1/sync/now")
    assert resp.status_code == 400
    assert "not connected" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_trigger_sync_no_garmin(client: AsyncClient):
    await _register_and_login(client)
    resp = await client.post("/api/v1/sync/trigger")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_sync_quick_no_garmin_returns_zero_counts(client: AsyncClient):
    await _register_and_login(client)
    resp = await client.post("/api/v1/sync/quick")
    assert resp.status_code == 200
    assert resp.json() == {
        "activities_synced": 0,
        "health_days_synced": 0,
    }


@pytest.mark.asyncio
async def test_sync_now_calls_sync_services_for_connected_user(client: AsyncClient):
    email = "athlete@test.com"
    await _register_and_login(client)
    user = await _seed_garmin_connection(email)

    with (
        patch("app.routers.sync.sync_activities", new=AsyncMock(return_value=3)) as mock_activities,
        patch("app.routers.sync.sync_daily_health", new=AsyncMock(return_value=5)) as mock_health,
    ):
        resp = await client.post("/api/v1/sync/now?days_back=14")

    assert resp.status_code == 200
    assert resp.json() == {
        "activities_synced": 3,
        "health_days_synced": 5,
    }

    activity_args, activity_kwargs = mock_activities.call_args
    health_args, health_kwargs = mock_health.call_args
    assert activity_args[0] == user.id
    assert health_args[0] == user.id
    assert activity_kwargs["days_back"] == 14
    assert health_kwargs["days_back"] == 14


@pytest.mark.asyncio
async def test_sync_quick_uses_three_day_window(client: AsyncClient):
    email = "athlete@test.com"
    await _register_and_login(client)
    user = await _seed_garmin_connection(email)

    with (
        patch("app.routers.sync.sync_activities", new=AsyncMock(return_value=2)) as mock_activities,
        patch("app.routers.sync.sync_daily_health", new=AsyncMock(return_value=4)) as mock_health,
    ):
        resp = await client.post("/api/v1/sync/quick")

    assert resp.status_code == 200
    assert resp.json() == {
        "activities_synced": 2,
        "health_days_synced": 4,
    }

    activity_args, activity_kwargs = mock_activities.call_args
    health_args, health_kwargs = mock_health.call_args
    assert activity_args[0] == user.id
    assert health_args[0] == user.id
    assert activity_kwargs["days_back"] == 3
    assert health_kwargs["days_back"] == 3
