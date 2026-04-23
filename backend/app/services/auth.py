from fastapi import Depends, Header, HTTPException, status
from supabase import AsyncClient

from app.database import get_supabase
from app.models import UserRow


async def get_current_user(
    authorization: str | None = Header(default=None),
    sb: AsyncClient = Depends(get_supabase),
) -> UserRow:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        auth_response = await sb.auth.get_user(token)
        auth_user = auth_response.user
        if auth_user is None:
            raise ValueError("no user")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id = str(auth_user.id)
    res = await sb.table("users").select("*").eq("id", user_id).limit(1).execute()

    if not res.data:
        # Create profile row if the DB trigger hasn't run yet
        insert_res = await sb.table("users").insert({
            "id": user_id,
            "email": auth_user.email,
            "name": (auth_user.user_metadata or {}).get("name"),
        }).execute()
        return UserRow(**insert_res.data[0])

    return UserRow(**res.data[0])
