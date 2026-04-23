import json
from datetime import datetime, timezone

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, status
from garminconnect import Garmin
from supabase import AsyncClient

from app.config import settings
from app.models import UserRow


def _fernet() -> Fernet:
    key = settings.garmin_encryption_key
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Garmin session storage is not configured. Set GARMIN_ENCRYPTION_KEY.",
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_session(session_data: dict) -> str:
    """Encrypt session dict and return as a text string (Fernet output is base64-safe)."""
    return _fernet().encrypt(json.dumps(session_data).encode()).decode()


def decrypt_session(s: str) -> dict:
    try:
        return json.loads(_fernet().decrypt(s.encode()))
    except (InvalidToken, Exception) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Garmin session expired or invalid — please reconnect",
        ) from e


async def connect_garmin(email: str, password: str) -> tuple[Garmin, dict]:
    """Login to Garmin and return the client + serialisable session tokens."""
    client = Garmin(email=email, password=password)
    client.login()
    token_data = client.client.dumps()
    return client, {"token_store": token_data, "email": email}


async def import_garmin_token_store(
    token_store: str,
    email: str | None = None,
) -> tuple[Garmin, dict]:
    """Validate and import a previously saved Garmin token store."""
    client = Garmin()
    client.client.loads(token_store)
    if (
        getattr(client.client, "di_refresh_token", None)
        and getattr(client.client, "_token_expires_soon", None)
        and client.client._token_expires_soon()
    ):
        client.client._refresh_session()

    client.client.connectapi("/userprofile-service/socialProfile")
    return client, {"token_store": client.client.dumps(), "email": email}


def restore_client(session_data: dict) -> tuple[Garmin, bool]:
    """Re-initialise a Garmin client from stored tokens.

    Returns (client, token_was_refreshed). Callers should persist the new
    token store when token_was_refreshed is True.
    """
    client = Garmin()
    token_store = session_data.get("token_store") or session_data.get("garth_tokens")
    if not token_store:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Garmin session expired or invalid — please reconnect",
        )

    client.client.loads(token_store)
    refreshed = False
    if (
        getattr(client.client, "di_refresh_token", None)
        and getattr(client.client, "_token_expires_soon", None)
        and client.client._token_expires_soon()
    ):
        client.client._refresh_session()
        refreshed = True

    client.display_name = session_data.get("email") or ""
    return client, refreshed


async def get_garmin_client(user_id: str, sb: AsyncClient) -> Garmin:
    """Load and decrypt a user's Garmin session from Supabase.

    Automatically persists a refreshed OAuth token so the session stays alive
    as long as possible without requiring the user to re-enter credentials.
    """
    res = await sb.table("users").select("garmin_session_data").eq("id", user_id).limit(1).execute()
    if not res.data or not res.data[0].get("garmin_session_data"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Garmin account not connected",
        )

    session_data = decrypt_session(res.data[0]["garmin_session_data"])
    client, refreshed = restore_client(session_data)

    if refreshed:
        updated = {**session_data, "token_store": client.client.dumps()}
        await sb.table("users").update({
            "garmin_session_data": encrypt_session(updated),
        }).eq("id", user_id).execute()

    return client
