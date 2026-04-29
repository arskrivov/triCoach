import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from supabase import AsyncClient

from app.database import get_supabase
from app.models import UserRow
from app.schemas.garmin import (
    ConnectAndSyncResponse,
    GarminConnectRequest,
    GarminStatusResponse,
    GarminTokenStoreRequest,
)
from app.services.auth import get_current_user
from app.services.dashboard import build_dashboard_overview
from app.services.garmin import (
    connect_garmin,
    decrypt_session,
    encrypt_session,
    import_garmin_token_store,
    is_garmin_auth_error,
)
from app.services.garmin_sync import sync_activities, sync_daily_health

from garminconnect import Garmin

router = APIRouter(prefix="/garmin", tags=["garmin"])
logger = logging.getLogger(__name__)


def _map_garmin_error(exc: Exception) -> HTTPException:
    err_str = str(exc)
    err_lower = err_str.lower()
    if "429" in err_str or "too many requests" in err_lower or "rate limit" in err_lower:
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Garmin is rate-limiting login attempts. "
                "Wait 5–10 minutes and try again, or import a token store instead."
            ),
        )
    if is_garmin_auth_error(exc) or "invalid" in err_lower or "credentials" in err_lower:
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Garmin email or password.")
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Garmin login failed: {exc}")


@router.post("/connect", response_model=GarminStatusResponse)
async def connect(
    body: GarminConnectRequest,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    try:
        _client, session_data = await connect_garmin(body.garmin_email, body.garmin_password)
    except Exception as exc:
        raise _map_garmin_error(exc) from exc

    await sb.table("users").update({
        "garmin_email": body.garmin_email,
        "garmin_session_data": encrypt_session(session_data),
        "garmin_connected_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", current_user.id).execute()

    return GarminStatusResponse(connected=True, garmin_email=body.garmin_email, last_sync_at=None, session_status="valid")


@router.post("/connect-and-sync", response_model=ConnectAndSyncResponse)
async def connect_and_sync(
    body: GarminConnectRequest,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
    user_timezone: str | None = Header(default=None, alias="X-User-Timezone"),
):
    # 1. Login to Garmin
    try:
        client, session_data = await connect_garmin(body.garmin_email, body.garmin_password)
    except Exception as exc:
        raise _map_garmin_error(exc) from exc

    # 2. Persist session
    encrypted = encrypt_session(session_data)
    await sb.table("users").update({
        "garmin_email": body.garmin_email,
        "garmin_session_data": encrypted,
        "garmin_connected_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", current_user.id).execute()

    # 3. Run sync using the already-authenticated client
    activities, activity_files = await sync_activities(
        current_user.id, sb, days_back=90, client=client,
    )
    health_days, missing_metrics = await sync_daily_health(
        current_user.id, sb, days_back=90, client=client,
    )

    # 4. Attempt briefing generation (best-effort)
    try:
        await build_dashboard_overview(
            current_user,
            sb,
            timezone_name=user_timezone,
            allow_briefing_generation=True,
        )
    except Exception:
        logger.exception(
            "Briefing generation failed during connect-and-sync for user %s",
            current_user.id,
        )

    return ConnectAndSyncResponse(
        connected=True,
        garmin_email=body.garmin_email,
        activities_synced=activities,
        activity_files_synced=activity_files,
        health_days_synced=health_days,
        missing_health_metrics=missing_metrics,
    )


@router.post("/connect/token-store", response_model=GarminStatusResponse)
async def connect_with_token_store(
    body: GarminTokenStoreRequest,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    try:
        _client, session_data = await import_garmin_token_store(body.token_store, body.garmin_email)
    except Exception as exc:
        err_str = str(exc).lower()
        if "token" in err_str or "expired" in err_str or "not authenticated" in err_str:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Garmin token store is invalid or expired. Export a fresh garmin_tokens.json and try again.",
            ) from exc
        raise _map_garmin_error(exc) from exc

    garmin_email = body.garmin_email or session_data.get("email")
    await sb.table("users").update({
        "garmin_email": garmin_email,
        "garmin_session_data": encrypt_session(session_data),
        "garmin_connected_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", current_user.id).execute()

    return GarminStatusResponse(connected=True, garmin_email=garmin_email, last_sync_at=None, session_status="valid")


@router.get("/status", response_model=GarminStatusResponse)
async def status_endpoint(current_user: UserRow = Depends(get_current_user)):
    if not current_user.garmin_session_data:
        return GarminStatusResponse(
            connected=False,
            garmin_email=current_user.garmin_email,
            last_sync_at=current_user.garmin_last_sync_at,
            session_status="not_connected",
        )

    try:
        session_data = decrypt_session(current_user.garmin_session_data)
        token_store = session_data.get("token_store")
        if not token_store:
            return GarminStatusResponse(
                connected=False,
                garmin_email=current_user.garmin_email,
                last_sync_at=current_user.garmin_last_sync_at,
                session_status="expired",
            )

        # Load tokens and check expiry without making a Garmin API call
        client = Garmin()
        client.client.loads(token_store)
        if (
            getattr(client.client, "_token_expires_soon", None)
            and client.client._token_expires_soon()
            and not getattr(client.client, "di_refresh_token", None)
        ):
            return GarminStatusResponse(
                connected=True,
                garmin_email=current_user.garmin_email,
                last_sync_at=current_user.garmin_last_sync_at,
                session_status="expired",
            )

        return GarminStatusResponse(
            connected=True,
            garmin_email=current_user.garmin_email,
            last_sync_at=current_user.garmin_last_sync_at,
            session_status="valid",
        )
    except Exception:
        return GarminStatusResponse(
            connected=True,
            garmin_email=current_user.garmin_email,
            last_sync_at=current_user.garmin_last_sync_at,
            session_status="expired",
        )


@router.delete("/disconnect")
async def disconnect(
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    await sb.table("users").update({
        "garmin_email": None,
        "garmin_session_data": None,
        "garmin_connected_at": None,
        "garmin_last_sync_at": None,
    }).eq("id", current_user.id).execute()
    return {"message": "Garmin disconnected"}
