from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routers.sync import _run_sync


@pytest.mark.asyncio
async def test_run_sync_reuses_one_garmin_client_for_activity_and_health_sync():
    user = MagicMock()
    user.id = "user-123"

    sb = MagicMock()
    query = MagicMock()
    query.select.return_value = query
    query.eq.return_value = query
    query.is_.return_value = query
    query.order.return_value = query
    query.limit.return_value = query
    query.execute = AsyncMock(return_value=SimpleNamespace(data=[]))
    sb.table.return_value = query

    client = object()

    with patch("app.routers.sync.get_garmin_client", new=AsyncMock(return_value=client)) as mock_get_client, \
         patch("app.routers.sync.sync_activities", new=AsyncMock(return_value=(2, 1))) as mock_sync_activities, \
         patch("app.routers.sync.sync_daily_health", new=AsyncMock(return_value=(3, []))) as mock_sync_daily_health, \
         patch("app.routers.sync.build_dashboard_overview", new=AsyncMock(return_value={})) as mock_build_dashboard, \
         patch("app.routers.sync.analyze_activity") as mock_analyze_activity:
        response = await _run_sync(user, sb, days_back=7, timezone_name="Europe/Berlin")

    assert response.activities_synced == 2
    assert response.activity_files_synced == 1
    assert response.health_days_synced == 3
    assert response.missing_health_metrics == []

    mock_get_client.assert_awaited_once_with(user.id, sb)
    mock_sync_activities.assert_awaited_once_with(user.id, sb, days_back=7, client=client)
    mock_sync_daily_health.assert_awaited_once_with(user.id, sb, days_back=7, client=client)
    mock_build_dashboard.assert_awaited_once_with(
        user,
        sb,
        timezone_name="Europe/Berlin",
        allow_briefing_generation=True,
    )
    mock_analyze_activity.delay.assert_not_called()
