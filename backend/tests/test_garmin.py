from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient


async def _register_and_login(client: AsyncClient) -> None:
    await client.post("/api/v1/auth/register", json={
        "email": "garmin@test.com", "password": "pass123",
    })
    # Cookie is set on the client after register


@pytest.mark.asyncio
async def test_garmin_status_not_connected(client: AsyncClient):
    await _register_and_login(client)
    res = await client.get("/api/v1/garmin/status")
    assert res.status_code == 200
    data = res.json()
    assert data["connected"] is False
    assert data["garmin_email"] is None


@pytest.mark.asyncio
async def test_garmin_connect_success(client: AsyncClient):
    await _register_and_login(client)

    mock_client = MagicMock()
    fake_session = {"token_store": '{"token": "fake-token"}', "email": "garmin@example.com"}

    with patch("app.routers.garmin.connect_garmin", return_value=(mock_client, fake_session)):
        res = await client.post("/api/v1/garmin/connect", json={
            "garmin_email": "garmin@example.com",
            "garmin_password": "garminpass",
        })

    assert res.status_code == 200
    data = res.json()
    assert data["connected"] is True
    assert data["garmin_email"] == "garmin@example.com"


@pytest.mark.asyncio
async def test_garmin_connect_bad_credentials(client: AsyncClient):
    await _register_and_login(client)

    with patch("app.routers.garmin.connect_garmin", side_effect=Exception("Invalid credentials")):
        res = await client.post("/api/v1/garmin/connect", json={
            "garmin_email": "bad@example.com",
            "garmin_password": "wrong",
        })

    assert res.status_code == 400


@pytest.mark.asyncio
async def test_garmin_status_after_connect(client: AsyncClient):
    await _register_and_login(client)

    mock_client = MagicMock()
    fake_session = {"token_store": '{"token": "fake"}', "email": "me@garmin.com"}

    with patch("app.routers.garmin.connect_garmin", return_value=(mock_client, fake_session)):
        await client.post("/api/v1/garmin/connect", json={
            "garmin_email": "me@garmin.com", "garmin_password": "pass",
        })

    res = await client.get("/api/v1/garmin/status")
    assert res.status_code == 200
    assert res.json()["connected"] is True
    assert res.json()["garmin_email"] == "me@garmin.com"


@pytest.mark.asyncio
async def test_garmin_disconnect(client: AsyncClient):
    await _register_and_login(client)

    mock_client = MagicMock()
    fake_session = {"token_store": '{"token": "fake"}', "email": "me@garmin.com"}

    with patch("app.routers.garmin.connect_garmin", return_value=(mock_client, fake_session)):
        await client.post("/api/v1/garmin/connect", json={
            "garmin_email": "me@garmin.com", "garmin_password": "pass",
        })

    res = await client.delete("/api/v1/garmin/disconnect")
    assert res.status_code == 200

    res2 = await client.get("/api/v1/garmin/status")
    assert res2.json()["connected"] is False


@pytest.mark.asyncio
async def test_garmin_requires_auth(client: AsyncClient):
    res = await client.get("/api/v1/garmin/status")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_garmin_connect_with_token_store(client: AsyncClient):
    await _register_and_login(client)

    mock_client = MagicMock()
    fake_session = {"token_store": '{"di_token":"fake"}', "email": "token@garmin.com"}

    with patch("app.routers.garmin.import_garmin_token_store", return_value=(mock_client, fake_session)):
        res = await client.post("/api/v1/garmin/connect/token-store", json={
            "token_store": '{"di_token":"fake"}',
            "garmin_email": "token@garmin.com",
        })

    assert res.status_code == 200
    data = res.json()
    assert data["connected"] is True
    assert data["garmin_email"] == "token@garmin.com"
