from types import SimpleNamespace
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from tests.conftest import TEST_DATABASE_URL


async def _register_and_login(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={"email": "coach@test.com", "password": "pass123"},
    )


class _FakeResponses:
    def create(self, **kwargs):
        return iter(
            [
                SimpleNamespace(type="response.output_text.delta", delta="Hello"),
                SimpleNamespace(type="response.output_text.delta", delta=" there"),
            ]
        )


class _FakeOpenAI:
    def __init__(self, *args, **kwargs):
        self.responses = _FakeResponses()


@pytest.mark.asyncio
async def test_coach_chat_persists_history(client: AsyncClient):
    await _register_and_login(client)

    old_key = settings.openai_api_key
    settings.openai_api_key = "test-key"
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    try:
        with patch("openai.OpenAI", _FakeOpenAI), patch(
            "app.routers.coach.build_context_text", return_value="context"
        ), patch("app.routers.coach.AsyncSessionLocal", factory):
            res = await client.post("/api/v1/coach/chat", json={"message": "Hi coach"})
            assert res.status_code == 200
            assert '"token": "Hello"' in res.text
            assert '"token": " there"' in res.text

        history = await client.get("/api/v1/coach/history")
        assert history.status_code == 200
        data = history.json()
        assert len(data) == 2
        assert data[0]["role"] == "user"
        assert data[0]["content"] == "Hi coach"
        assert data[1]["role"] == "assistant"
        assert data[1]["content"] == "Hello there"
    finally:
        settings.openai_api_key = old_key
        await engine.dispose()
