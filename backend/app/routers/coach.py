import json as _json
import logging
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
from app.services.coach_tools import COACH_TOOLS, execute_tool

_logger = logging.getLogger(__name__)

router = APIRouter(prefix="/coach", tags=["coach"])


class GoalCreate(BaseModel):
    description: str
    target_date: date | None = None
    sport: str | None = None
    weekly_volume_km: float | None = None
    race_type: str | None = None
    weekly_hours_budget: float | None = None
    priority: int = 1


class GoalResponse(BaseModel):
    id: str
    description: str
    target_date: str | None
    sport: str | None
    weekly_volume_km: float | None
    is_active: bool
    race_type: str | None = None
    weekly_hours_budget: float | None = None
    priority: int = 1
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
        "race_type": body.race_type,
        "weekly_hours_budget": body.weekly_hours_budget,
        "priority": body.priority,
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


# ── Streaming chat with tool calling ───────────────────────────────────────────

TOOL_INSTRUCTIONS_ADDENDUM = """

PLAN MODIFICATION TOOLS:
You have access to tools that can modify the athlete's training plan directly.
Use them when the athlete explicitly asks to change, skip, swap, or add workouts.

WHEN TO USE TOOLS:
- Athlete says they can't do a workout → suggest an alternative first, then
  use the tool if they confirm (or if the intent is clear, e.g. "just skip it")
- Athlete asks to swap a discipline → use modify_workout
- Athlete asks to add a session → use add_workout
- Athlete confirms your suggestion → execute the change

WHEN NOT TO USE TOOLS:
- Athlete is asking for advice or information → just respond with text
- Athlete is discussing general training theory → just respond with text
- You're unsure what the athlete wants → ask for clarification first

Always tell the athlete what you changed after using a tool.
"""


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

    try:
        system_text = await build_context_text(current_user.id, sb)
    except Exception as exc:
        _logger.error("Failed to build coach context: %s", exc)
        system_text = (
            "You are an expert personal coach specialising in triathlon. "
            "Give specific, actionable advice."
        )

    system_text += TOOL_INSTRUCTIONS_ADDENDUM

    messages = [{"role": m["role"], "content": m["content"]} for m in history[-40:]]
    messages.append({"role": "user", "content": body.message})

    collected: list[str] = []
    tool_results: list[str] = []

    async def stream_response():
        from openai import OpenAI

        try:
            client = OpenAI(api_key=settings.openai_api_key)

            # First call — may produce text, tool calls, or both
            response = client.responses.create(
                model=settings.openai_coach_model,
                instructions=system_text,
                input=messages,
                tools=COACH_TOOLS,
                max_output_tokens=2048,
                stream=True,
            )

            pending_tool_calls: list[dict] = []
            current_tool_call: dict | None = None

            for event in response:
                event_type = getattr(event, "type", None)

                # Stream text tokens
                if event_type == "response.output_text.delta":
                    text = getattr(event, "delta", "")
                    if text:
                        collected.append(text)
                        yield f"data: {_json.dumps({'token': text})}\n\n"

                # Collect function call arguments
                elif event_type == "response.function_call_arguments.delta":
                    if current_tool_call is not None:
                        current_tool_call["arguments"] += getattr(event, "delta", "")

                elif event_type == "response.output_item.added":
                    item = getattr(event, "item", None)
                    if item and getattr(item, "type", None) == "function_call":
                        current_tool_call = {
                            "call_id": getattr(item, "call_id", ""),
                            "name": getattr(item, "name", ""),
                            "arguments": "",
                        }

                elif event_type == "response.output_item.done":
                    if current_tool_call and current_tool_call.get("name"):
                        pending_tool_calls.append(current_tool_call)
                        current_tool_call = None

            # Execute any tool calls
            if pending_tool_calls:
                tool_outputs = []
                for tc in pending_tool_calls:
                    try:
                        args = _json.loads(tc["arguments"])
                    except _json.JSONDecodeError:
                        args = {}

                    result = await execute_tool(tc["name"], args, current_user.id, sb)
                    tool_results.append(result)
                    tool_outputs.append({
                        "type": "function_call_output",
                        "call_id": tc["call_id"],
                        "output": result,
                    })

                    # Stream a status message so the user sees something
                    status_msg = f"\n\n*✅ {result}*\n\n"
                    collected.append(status_msg)
                    yield f"data: {_json.dumps({'token': status_msg})}\n\n"

                # Second call — let the model respond to the tool results
                try:
                    followup = client.responses.create(
                        model=settings.openai_coach_model,
                        instructions=system_text,
                        input=messages + tool_outputs,
                        max_output_tokens=1024,
                        stream=True,
                    )
                    for event in followup:
                        if getattr(event, "type", None) == "response.output_text.delta":
                            text = getattr(event, "delta", "")
                            if text:
                                collected.append(text)
                                yield f"data: {_json.dumps({'token': text})}\n\n"
                except Exception as exc:
                    _logger.error("Coach followup after tools failed: %s", exc)

        except Exception as exc:
            _logger.error("Coach chat stream error: %s", exc)
            if not collected:
                err_msg = f"Sorry, something went wrong: {type(exc).__name__}"
                collected.append(err_msg)
                yield f"data: {_json.dumps({'token': err_msg})}\n\n"

        # Save conversation
        full_response = "".join(collected)
        if full_response:
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
