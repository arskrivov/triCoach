import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import AsyncClient

from app.config import settings
from app.database import get_supabase
from app.models import UserRow
from app.services.auth import get_current_user
from app.services.coach_context import build_context_text

router = APIRouter(prefix="/coach", tags=["coach"])


class GoalCreate(BaseModel):
    description: str
    target_date: date | None = None
    sport: str | None = None
    weekly_volume_km: float | None = None


class GoalResponse(BaseModel):
    id: str
    description: str
    target_date: str | None
    sport: str | None
    weekly_volume_km: float | None
    is_active: bool
    created_at: str


class ChatRequest(BaseModel):
    message: str


# ── Goals ──────────────────────────────────────────────────────────────────────

@router.get("/goals", response_model=list[GoalResponse])
async def list_goals(
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    res = await sb.table("goals").select("*").eq("user_id", current_user.id).eq(
        "is_active", True
    ).order("created_at", desc=True).execute()
    return res.data or []


@router.post("/goals", response_model=GoalResponse, status_code=201)
async def create_goal(
    body: GoalCreate,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    payload = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "description": body.description,
        "target_date": body.target_date.isoformat() if body.target_date else None,
        "sport": body.sport,
        "weekly_volume_km": body.weekly_volume_km,
    }
    res = await sb.table("goals").insert(payload).execute()
    return res.data[0]


@router.delete("/goals/{goal_id}", status_code=204)
async def delete_goal(
    goal_id: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    res = await sb.table("goals").select("id").eq("id", goal_id).eq("user_id", current_user.id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Goal not found")
    await sb.table("goals").update({"is_active": False}).eq("id", goal_id).execute()


# ── Chat history ───────────────────────────────────────────────────────────────

@router.get("/history")
async def get_history(
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    res = await sb.table("coach_conversations").select("messages").eq(
        "user_id", current_user.id
    ).limit(1).execute()
    return res.data[0]["messages"] if res.data else []


@router.delete("/history", status_code=204)
async def clear_history(
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    await sb.table("coach_conversations").update({"messages": []}).eq(
        "user_id", current_user.id
    ).execute()


# ── Streaming chat ─────────────────────────────────────────────────────────────

@router.post("/chat")
async def chat(
    body: ChatRequest,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    # Load or create conversation
    conv_res = await sb.table("coach_conversations").select("messages").eq(
        "user_id", current_user.id
    ).limit(1).execute()

    if conv_res.data:
        history = conv_res.data[0]["messages"] or []
    else:
        await sb.table("coach_conversations").insert({
            "id": str(uuid.uuid4()),
            "user_id": current_user.id,
            "messages": [],
        }).execute()
        history = []

    system_text = await build_context_text(current_user.id, sb)
    messages = [{"role": m["role"], "content": m["content"]} for m in history[-40:]]
    messages.append({"role": "user", "content": body.message})

    collected: list[str] = []

    async def stream_response():
        import json as _json
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        stream = client.responses.create(
            model=settings.openai_coach_model,
            instructions=system_text,
            input=messages,
            max_output_tokens=2048,
            stream=True,
        )
        for event in stream:
            if getattr(event, "type", None) != "response.output_text.delta":
                continue
            text = getattr(event, "delta", "")
            if not text:
                continue
            collected.append(text)
            yield f"data: {_json.dumps({'token': text})}\n\n"

        full_response = "".join(collected)
        now = datetime.now(timezone.utc).isoformat()
        new_messages = history + [
            {"role": "user", "content": body.message, "timestamp": now},
            {"role": "assistant", "content": full_response, "timestamp": now},
        ]
        await sb.table("coach_conversations").update({
            "messages": new_messages[-100:],
            "updated_at": now,
        }).eq("user_id", current_user.id).execute()

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream_response(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )
