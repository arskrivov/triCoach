from typing import Any

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from supabase import AsyncClient

from app.database import get_supabase
from app.models import UserRow
from app.services.auth import get_current_user
from app.services.dashboard import build_dashboard_overview

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class DashboardOverviewResponse(BaseModel):
    generated_at: str
    timezone: str
    last_sync_at: str | None
    recovery: dict[str, Any]
    activity: dict[str, Any]
    briefing: dict[str, Any] | None
    recent_activities: list[dict[str, Any]]
    upcoming_workouts: list[dict[str, Any]]
    fitness_timeline: list[dict[str, Any]]


@router.get("/overview", response_model=DashboardOverviewResponse)
async def overview(
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
    user_timezone: str | None = Header(default=None, alias="X-User-Timezone"),
):
    return await build_dashboard_overview(
        current_user,
        sb,
        timezone_name=user_timezone,
        allow_briefing_generation=True,
    )
