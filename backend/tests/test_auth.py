import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register(client: AsyncClient):
    res = await client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "password123",
        "name": "Test User",
    })
    assert res.status_code == 201
    data = res.json()
    assert data["user"]["email"] == "test@example.com"
    assert data["user"]["name"] == "Test User"
    assert "access_token" in data
    assert "access_token" in res.cookies


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    payload = {"email": "dup@example.com", "password": "pass123"}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_login(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "login@example.com", "password": "mypassword",
    })
    res = await client.post("/api/v1/auth/login", json={
        "email": "login@example.com", "password": "mypassword",
    })
    assert res.status_code == 200
    assert "access_token" in res.cookies


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "wrong@example.com", "password": "correctpass",
    })
    res = await client.post("/api/v1/auth/login", json={
        "email": "wrong@example.com", "password": "wrongpass",
    })
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "me@example.com", "password": "pass123", "name": "Me",
    })
    # cookie is set on the client from register
    res = await client.get("/api/v1/auth/me")
    assert res.status_code == 200
    assert res.json()["email"] == "me@example.com"


@pytest.mark.asyncio
async def test_me_unauthenticated(client: AsyncClient):
    res = await client.get("/api/v1/auth/me")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_logout(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "logout@example.com", "password": "pass123",
    })
    res = await client.post("/api/v1/auth/logout")
    assert res.status_code == 200
    # Cookie should be cleared
    res2 = await client.get("/api/v1/auth/me")
    assert res2.status_code == 401
