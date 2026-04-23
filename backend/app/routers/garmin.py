from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import AsyncClient

from app.database import get_supabase
from app.models import UserRow
from app.schemas.garmin import (
    GarminConnectRequest,
    GarminStatusResponse,
    GarminTokenStoreRequest,
)
from app.services.auth import get_current_user
from app.services.garmin import connect_garmin, encrypt_session, import_garmin_token_store

router = APIRouter(prefix="/garmin", tags=["garmin"])


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
    if "401" in err_str or "invalid" in err_lower or "credentials" in err_lower or "unauthorized" in err_lower:
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

    return GarminStatusResponse(connected=True, garmin_email=body.garmin_email, last_sync_at=None)


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

    return GarminStatusResponse(connected=True, garmin_email=garmin_email, last_sync_at=None)


@router.get("/status", response_model=GarminStatusResponse)
async def status_endpoint(current_user: UserRow = Depends(get_current_user)):
    return GarminStatusResponse(
        connected=current_user.garmin_session_data is not None,
        garmin_email=current_user.garmin_email,
        last_sync_at=current_user.garmin_last_sync_at,
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
