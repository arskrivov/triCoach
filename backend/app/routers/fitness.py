from fastapi import APIRouter, Depends, Query
from supabase import AsyncClient

from app.database import get_supabase
from app.models import UserRow
from app.services.auth import get_current_user
from app.services.fitness import get_fitness_timeline

router = APIRouter(prefix="/fitness", tags=["fitness"])


@router.get("/timeline")
async def fitness_timeline(
    days: int = Query(120, ge=14, le=365),
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    return await get_fitness_timeline(current_user.id, sb, days=days)
