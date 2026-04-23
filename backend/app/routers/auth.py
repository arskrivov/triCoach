from fastapi import APIRouter, Depends

from app.models import UserRow
from app.schemas.auth import UserResponse
from app.services.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserResponse)
async def me(current_user: UserRow = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        created_at=current_user.created_at or None,
    )
