import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from postgrest.exceptions import APIError
from supabase import AsyncClient

from app.database import get_supabase
from app.models import UserRow
from app.services.auth import get_current_user
from app.services.dashboard import build_dashboard_overview
from app.services.garmin_sync import sync_activities, sync_daily_health
from app.tasks import analyze_activity, trigger_full_sync

router = APIRouter(prefix="/sync", tags=["sync"])
logger = logging.getLogger(__name__)


def _compute_days_back(last_sync_at: str | None, fallback: int) -> int:
    if not last_sync_at:
        return fallback
    try:
        last_sync = datetime.fromisoformat(last_sync_at.replace("Z", "+00:00"))
        days_since = (datetime.now(timezone.utc) - last_sync).days + 1
        return min(max(days_since, 1), 365)
    except ValueError:
        return fallback


class SyncResponse(BaseModel):
    activities_synced: int
    activity_files_synced: int = 0
    health_days_synced: int
    missing_health_metrics: list[str] = []


class TriggerResponse(BaseModel):
    task_id: str
    status: str


class SyncStatus(BaseModel):
    connected: bool
    last_sync_at: str | None
    garmin_email: str | None


def _is_garmin_session_expired(exc: Exception) -> bool:
    """Check if the exception indicates an expired Garmin session."""
    err_str = str(exc).lower()
    return any(
        phrase in err_str
        for phrase in [
            "invalid username-password",
            "invalid user",
            "unauthorized",
            "401",
            "session expired",
            "not authenticated",
            "authentication failed",
        ]
    )


async def _run_sync(
    current_user: UserRow,
    sb: AsyncClient,
    days_back: int,
    timezone_name: str | None = None,
) -> SyncResponse:
    try:
        activities, activity_files = await sync_activities(current_user.id, sb, days_back=days_back)
        health, missing_metrics = await sync_daily_health(current_user.id, sb, days_back=days_back)
        try:
            res = await sb.table("activities").select("id").eq("user_id", current_user.id).is_(
                "ai_analysis", "null"
            ).order("start_time", desc=True).limit(5).execute()
            for row in res.data or []:
                analyze_activity.delay(current_user.id, row["id"])
        except APIError:
            logger.warning("Skipping per-activity AI analysis queue; activities.ai_analysis is unavailable.")

        # Always attempt briefing generation after sync - the dashboard service
        # handles caching via data_signature, so this is safe to call even if
        # no new data was synced (e.g., re-sync of same day's data)
        try:
            await build_dashboard_overview(
                current_user,
                sb,
                timezone_name=timezone_name,
                allow_briefing_generation=True,
            )
        except Exception:
            logger.exception("Daily dashboard briefing generation failed for user %s", current_user.id)
        return SyncResponse(
            activities_synced=activities,
            activity_files_synced=activity_files,
            health_days_synced=health,
            missing_health_metrics=missing_metrics,
        )
    except HTTPException:
        raise
    except APIError as exc:
        logger.exception("Supabase sync write failed for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Supabase write failed during Garmin sync: {exc.message}",
        ) from exc
    except Exception as exc:
        logger.exception("Garmin sync failed for user %s", current_user.id)
        if _is_garmin_session_expired(exc):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Garmin session expired — please reconnect your Garmin account in Settings.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Garmin sync failed: {exc}",
        ) from exc


@router.post("/now", response_model=SyncResponse)
async def sync_now(
    days_back: int | None = None,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
    user_timezone: str | None = Header(default=None, alias="X-User-Timezone"),
):
    if not current_user.garmin_session_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Garmin account not connected")
    computed = (
        min(max(days_back, 1), 365)
        if days_back is not None
        else _compute_days_back(current_user.garmin_last_sync_at, fallback=90)
    )
    return await _run_sync(current_user, sb, computed, timezone_name=user_timezone)


@router.post("/quick", response_model=SyncResponse)
async def sync_quick(
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
    user_timezone: str | None = Header(default=None, alias="X-User-Timezone"),
):
    """Fast sync from last sync date — called automatically on dashboard open."""
    if not current_user.garmin_session_data:
        return SyncResponse(activities_synced=0, activity_files_synced=0, health_days_synced=0)
    days_back = _compute_days_back(current_user.garmin_last_sync_at, fallback=7)
    return await _run_sync(current_user, sb, days_back, timezone_name=user_timezone)


@router.post("/trigger", response_model=TriggerResponse)
async def trigger_background_sync(
    days_back: int = 90,
    current_user: UserRow = Depends(get_current_user),
):
    if not current_user.garmin_session_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Garmin account not connected")
    task = trigger_full_sync.delay(current_user.id, days_back=min(days_back, 365))
    return TriggerResponse(task_id=task.id, status="queued")


@router.get("/status", response_model=SyncStatus)
async def get_sync_status(current_user: UserRow = Depends(get_current_user)):
    return SyncStatus(
        connected=current_user.garmin_session_data is not None,
        last_sync_at=current_user.garmin_last_sync_at,
        garmin_email=current_user.garmin_email,
    )
