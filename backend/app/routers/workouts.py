import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from supabase import AsyncClient

from app.database import get_supabase
from app.models import UserRow
from app.services.auth import get_current_user
from app.services.garmin_workout_sync import (
    delete_workout_from_garmin,
    sync_workout_to_garmin,
)

router = APIRouter(prefix="/workouts", tags=["workouts"])
logger = logging.getLogger(__name__)


class WorkoutCreate(BaseModel):
    name: str
    discipline: str
    builder_type: str
    description: str | None = None
    content: dict = {}
    estimated_duration_seconds: int | None = None
    estimated_tss: float | None = None
    estimated_volume_kg: float | None = None
    is_template: bool = False
    scheduled_date: str | None = None


class WorkoutUpdate(BaseModel):
    name: str | None = None
    discipline: str | None = None
    builder_type: str | None = None
    description: str | None = None
    content: dict | None = None
    estimated_duration_seconds: int | None = None
    estimated_tss: float | None = None
    estimated_volume_kg: float | None = None
    is_template: bool | None = None
    scheduled_date: str | None = None


class WorkoutResponse(BaseModel):
    id: str
    name: str
    discipline: str
    builder_type: str
    description: str | None
    content: Any
    estimated_duration_seconds: int | None
    estimated_tss: float | None
    estimated_volume_kg: float | None
    garmin_workout_id: int | None
    is_template: bool
    scheduled_date: str | None


class ExerciseCreate(BaseModel):
    name: str
    muscle_groups: list[str] | None = None
    equipment: str | None = None
    is_custom: bool = True


class ExerciseResponse(BaseModel):
    id: str
    name: str
    muscle_groups: list | None
    equipment: str | None
    is_custom: bool


@router.post("", response_model=WorkoutResponse, status_code=status.HTTP_201_CREATED)
async def create_workout(
    body: WorkoutCreate,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    content = dict(body.content)
    if body.scheduled_date:
        content["scheduled_date"] = body.scheduled_date
    else:
        content.pop("scheduled_date", None)

    payload = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "discipline": body.discipline.upper(),
        "builder_type": body.builder_type.upper(),
        **body.model_dump(exclude={"discipline", "builder_type", "content"}),
        "content": content,
    }
    res = await sb.table("workouts").insert(payload).execute()
    row = res.data[0]

    # Auto-sync to Garmin if part of a plan
    if row.get("plan_id"):
        try:
            await sync_workout_to_garmin(row["id"], current_user.id, sb)
        except Exception as exc:
            logger.warning("Garmin sync failed for new workout %s: %s", row["id"], exc)

    return row


@router.get("", response_model=list[WorkoutResponse])
async def list_workouts(
    discipline: str | None = Query(None),
    builder_type: str | None = Query(None),
    is_template: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    q = sb.table("workouts").select("*").eq("user_id", current_user.id).order(
        "created_at", desc=True
    ).range(offset, offset + limit - 1)
    if discipline:
        q = q.eq("discipline", discipline.upper())
    if builder_type:
        q = q.eq("builder_type", builder_type.upper())
    if is_template is not None:
        q = q.eq("is_template", is_template)
    res = await q.execute()
    return [row for row in (res.data or [])]


@router.get("/{workout_id}", response_model=WorkoutResponse)
async def get_workout(
    workout_id: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    res = await sb.table("workouts").select("*").eq("id", workout_id).eq(
        "user_id", current_user.id
    ).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Workout not found")
    row = res.data[0]
    return row


@router.put("/{workout_id}", response_model=WorkoutResponse)
async def update_workout(
    workout_id: str,
    body: WorkoutUpdate,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    existing_row = await sb.table("workouts").select("*").eq("id", workout_id).eq(
        "user_id", current_user.id
    ).limit(1).execute()
    if not existing_row.data:
        raise HTTPException(status_code=404, detail="Workout not found")

    current_content = dict((existing_row.data[0].get("content") or {}))
    payload = body.model_dump(exclude_none=True, exclude={"scheduled_date"})
    if "discipline" in payload:
        payload["discipline"] = str(payload["discipline"]).upper()
    if "builder_type" in payload:
        payload["builder_type"] = str(payload["builder_type"]).upper()
    if "content" in payload:
        current_content = dict(payload["content"] or {})
    if body.scheduled_date is not None:
        if body.scheduled_date:
            current_content["scheduled_date"] = body.scheduled_date
            payload["scheduled_date"] = body.scheduled_date
        else:
            current_content.pop("scheduled_date", None)
            payload["scheduled_date"] = None
    payload["content"] = current_content
    res = await sb.table("workouts").update(payload).eq("id", workout_id).execute()
    row = res.data[0]

    # Auto-sync to Garmin if part of a plan
    if row.get("plan_id"):
        try:
            await sync_workout_to_garmin(workout_id, current_user.id, sb)
        except Exception as exc:
            logger.warning("Garmin sync failed for updated workout %s: %s", workout_id, exc)

    return row


@router.delete("/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workout(
    workout_id: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    existing = await sb.table("workouts").select("id,plan_id,garmin_workout_id").eq("id", workout_id).eq(
        "user_id", current_user.id
    ).limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Workout not found")

    # Delete from Garmin first if synced
    if existing.data[0].get("garmin_workout_id"):
        try:
            await delete_workout_from_garmin(workout_id, current_user.id, sb)
        except Exception as exc:
            logger.warning("Garmin delete failed for workout %s: %s", workout_id, exc)

    await sb.table("workouts").delete().eq("id", workout_id).execute()


# ── Exercise library ──────────────────────────────────────────────────────────

@router.get("/exercises/library", response_model=list[ExerciseResponse])
async def list_exercises(
    search: str | None = Query(None),
    equipment: str | None = Query(None),
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    # Fetch global + user's custom exercises separately and merge
    global_res = await sb.table("exercises").select("*").is_("user_id", "null").limit(100).execute()
    custom_res = await sb.table("exercises").select("*").eq("user_id", current_user.id).limit(100).execute()
    all_exercises = (global_res.data or []) + (custom_res.data or [])

    if search:
        search_lower = search.lower()
        all_exercises = [e for e in all_exercises if search_lower in e.get("name", "").lower()]
    if equipment:
        all_exercises = [e for e in all_exercises if e.get("equipment") == equipment]

    all_exercises.sort(key=lambda e: e.get("name", ""))
    return all_exercises[:100]


@router.post("/exercises/library", response_model=ExerciseResponse, status_code=status.HTTP_201_CREATED)
async def create_exercise(
    body: ExerciseCreate,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    payload = {"id": str(uuid.uuid4()), "user_id": current_user.id, **body.model_dump()}
    res = await sb.table("exercises").insert(payload).execute()
    return res.data[0]
