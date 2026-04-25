"""Coach tool functions — callable by the AI coach via function calling.

Each function performs a specific plan modification and returns a
human-readable summary of what was done.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from supabase import AsyncClient

logger = logging.getLogger(__name__)


async def skip_workout(
    workout_id: str, reason: str, user_id: str, sb: AsyncClient
) -> str:
    """Skip a planned workout (set duration/TSS to 0, mark as skipped)."""
    res = await sb.table("workouts").select("*").eq(
        "id", workout_id
    ).eq("user_id", user_id).limit(1).execute()
    if not res.data:
        return f"Workout {workout_id} not found."

    workout = res.data[0]
    scheduled = workout.get("scheduled_date")
    if scheduled and date.fromisoformat(scheduled) < date.today():
        return "Cannot skip a past workout."

    now = datetime.now(timezone.utc).isoformat()
    await sb.table("workouts").update({
        "content": {
            "type": "skipped",
            "reason": reason,
            "original_content": workout.get("content", {}),
        },
        "description": f"[SKIPPED] {reason}",
        "estimated_duration_seconds": 0,
        "estimated_tss": 0,
        "updated_at": now,
    }).eq("id", workout_id).execute()

    name = workout.get("name", "Workout")
    return f"Skipped '{name}' — {reason}"


async def modify_workout(
    workout_id: str,
    new_name: str | None,
    new_discipline: str | None,
    new_duration_minutes: int | None,
    reason: str,
    user_id: str,
    sb: AsyncClient,
    new_content: dict | None = None,
    new_estimated_tss: int | None = None,
) -> str:
    """Modify an existing planned workout (change name, discipline, duration, or content)."""
    res = await sb.table("workouts").select("*").eq(
        "id", workout_id
    ).eq("user_id", user_id).limit(1).execute()
    if not res.data:
        return f"Workout {workout_id} not found."

    workout = res.data[0]
    scheduled = workout.get("scheduled_date")
    if scheduled and date.fromisoformat(scheduled) < date.today():
        return "Cannot modify a past workout."

    now = datetime.now(timezone.utc).isoformat()
    update: dict[str, Any] = {"updated_at": now}
    changes: list[str] = []

    if new_name:
        update["name"] = new_name
        changes.append(f"name → '{new_name}'")
    if new_discipline:
        update["discipline"] = new_discipline
        changes.append(f"discipline → {new_discipline}")
    if new_duration_minutes is not None:
        update["estimated_duration_seconds"] = new_duration_minutes * 60
        changes.append(f"duration → {new_duration_minutes}min")
    if new_content is not None:
        update["content"] = new_content
        changes.append("content updated")
    if new_estimated_tss is not None:
        update["estimated_tss"] = new_estimated_tss
        changes.append(f"TSS → {new_estimated_tss}")

    original_desc = workout.get("description") or ""
    update["description"] = f"{reason}\n(Original: {original_desc})" if original_desc else reason

    await sb.table("workouts").update(update).eq("id", workout_id).execute()

    old_name = workout.get("name", "Workout")
    return f"Modified '{old_name}': {', '.join(changes)}. Reason: {reason}"


async def add_workout(
    plan_id: str,
    name: str,
    discipline: str,
    duration_minutes: int,
    scheduled_date: str,
    plan_week: int,
    plan_day: int,
    reason: str,
    user_id: str,
    sb: AsyncClient,
    content: dict | None = None,
    estimated_tss: int | None = None,
    builder_type: str = "endurance",
) -> str:
    """Add a new workout to the plan with optional structured content."""
    sched = date.fromisoformat(scheduled_date)
    if sched < date.today():
        return "Cannot add a workout in the past."

    now = datetime.now(timezone.utc).isoformat()
    workout = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": name,
        "discipline": discipline,
        "builder_type": builder_type,
        "description": reason,
        "content": content or {},
        "estimated_duration_seconds": duration_minutes * 60,
        "estimated_tss": estimated_tss,
        "is_template": False,
        "scheduled_date": scheduled_date,
        "plan_id": plan_id,
        "plan_week": plan_week,
        "plan_day": plan_day,
        "created_at": now,
        "updated_at": now,
    }
    await sb.table("workouts").insert(workout).execute()
    return f"Added '{name}' ({discipline}, {duration_minutes}min) on {scheduled_date}."


# ── Tool definitions for OpenAI function calling ─────────────────────────────

COACH_TOOLS = [
    {
        "type": "function",
        "name": "skip_workout",
        "description": "Skip/cancel a planned workout. Use when the athlete can't or doesn't want to do a specific workout.",
        "parameters": {
            "type": "object",
            "properties": {
                "workout_id": {
                    "type": "string",
                    "description": "The UUID of the workout to skip (from the plan context)",
                },
                "reason": {
                    "type": "string",
                    "description": "Brief reason for skipping (e.g. 'Bad weather', 'Knee pain', 'Schedule conflict')",
                },
            },
            "required": ["workout_id", "reason"],
        },
    },
    {
        "type": "function",
        "name": "modify_workout",
        "description": "Modify a planned workout — change its name, discipline, duration, or structured content. Use for swapping disciplines, adjusting intensity, or replacing the workout program.",
        "parameters": {
            "type": "object",
            "properties": {
                "workout_id": {
                    "type": "string",
                    "description": "The UUID of the workout to modify",
                },
                "new_name": {
                    "type": "string",
                    "description": "New workout name (optional)",
                },
                "new_discipline": {
                    "type": "string",
                    "enum": ["SWIM", "RUN", "RIDE_ROAD", "RIDE_GRAVEL", "STRENGTH", "YOGA", "MOBILITY"],
                    "description": "New discipline (optional)",
                },
                "new_duration_minutes": {
                    "type": "integer",
                    "description": "New duration in minutes (optional)",
                },
                "new_estimated_tss": {
                    "type": "integer",
                    "description": "New estimated TSS (optional)",
                },
                "new_content": {
                    "type": "object",
                    "description": "New structured workout content (optional). Include warmup, main set, cooldown, zones, and notes.",
                    "properties": {
                        "type": {"type": "string"},
                        "warmup": {
                            "type": "object",
                            "properties": {
                                "duration_min": {"type": "integer"},
                                "zone": {"type": "string"},
                                "description": {"type": "string"},
                            },
                        },
                        "main": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "duration_min": {"type": "integer"},
                                    "zone": {"type": "string"},
                                    "description": {"type": "string"},
                                    "repeats": {"type": "integer"},
                                    "rest_min": {"type": "number"},
                                },
                            },
                        },
                        "cooldown": {
                            "type": "object",
                            "properties": {
                                "duration_min": {"type": "integer"},
                                "zone": {"type": "string"},
                                "description": {"type": "string"},
                            },
                        },
                        "target_tss": {"type": "integer"},
                        "target_hr_zone": {"type": "string"},
                        "notes": {"type": "string"},
                    },
                },
                "reason": {
                    "type": "string",
                    "description": "Brief reason for the modification",
                },
            },
            "required": ["workout_id", "reason"],
        },
    },
    {
        "type": "function",
        "name": "add_workout",
        "description": "Add a new workout to the plan with full structured content (warmup, main set, cooldown, zones, notes). ALWAYS include detailed content — never leave it empty.",
        "parameters": {
            "type": "object",
            "properties": {
                "plan_id": {
                    "type": "string",
                    "description": "The UUID of the training plan",
                },
                "name": {
                    "type": "string",
                    "description": "Workout name (e.g. 'Recovery Swim', 'Upper Body Strength')",
                },
                "discipline": {
                    "type": "string",
                    "enum": ["SWIM", "RUN", "RIDE_ROAD", "RIDE_GRAVEL", "STRENGTH", "YOGA", "MOBILITY"],
                },
                "builder_type": {
                    "type": "string",
                    "description": "Workout type (e.g. 'endurance', 'intervals', 'strength', 'recovery', 'tempo')",
                },
                "duration_minutes": {
                    "type": "integer",
                    "description": "Total duration in minutes",
                },
                "estimated_tss": {
                    "type": "integer",
                    "description": "Estimated Training Stress Score",
                },
                "content": {
                    "type": "object",
                    "description": "Structured workout content with warmup, main set, cooldown, and coaching notes",
                    "properties": {
                        "type": {
                            "type": "string",
                            "description": "Workout type (e.g. 'easy', 'tempo', 'intervals', 'strength', 'recovery')",
                        },
                        "warmup": {
                            "type": "object",
                            "properties": {
                                "duration_min": {"type": "integer"},
                                "zone": {"type": "string"},
                                "description": {"type": "string"},
                            },
                        },
                        "main": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "duration_min": {"type": "integer"},
                                    "zone": {"type": "string"},
                                    "description": {"type": "string"},
                                    "repeats": {"type": "integer"},
                                    "rest_min": {"type": "number"},
                                },
                            },
                        },
                        "cooldown": {
                            "type": "object",
                            "properties": {
                                "duration_min": {"type": "integer"},
                                "zone": {"type": "string"},
                                "description": {"type": "string"},
                            },
                        },
                        "target_tss": {"type": "integer"},
                        "target_hr_zone": {"type": "string"},
                        "notes": {"type": "string"},
                    },
                },
                "scheduled_date": {
                    "type": "string",
                    "description": "ISO date string (YYYY-MM-DD)",
                },
                "plan_week": {
                    "type": "integer",
                    "description": "Week number within the plan",
                },
                "plan_day": {
                    "type": "integer",
                    "description": "Day of week (0=Monday, 6=Sunday)",
                },
                "reason": {
                    "type": "string",
                    "description": "Brief reason for adding",
                },
            },
            "required": ["plan_id", "name", "discipline", "duration_minutes", "scheduled_date", "plan_week", "plan_day", "reason", "content"],
        },
    },
]


async def execute_tool(
    tool_name: str, arguments: dict, user_id: str, sb: AsyncClient
) -> str:
    """Execute a coach tool by name and return the result string."""
    try:
        if tool_name == "skip_workout":
            return await skip_workout(
                workout_id=arguments["workout_id"],
                reason=arguments["reason"],
                user_id=user_id,
                sb=sb,
            )
        elif tool_name == "modify_workout":
            return await modify_workout(
                workout_id=arguments["workout_id"],
                new_name=arguments.get("new_name"),
                new_discipline=arguments.get("new_discipline"),
                new_duration_minutes=arguments.get("new_duration_minutes"),
                reason=arguments["reason"],
                user_id=user_id,
                sb=sb,
                new_content=arguments.get("new_content"),
                new_estimated_tss=arguments.get("new_estimated_tss"),
            )
        elif tool_name == "add_workout":
            return await add_workout(
                plan_id=arguments["plan_id"],
                name=arguments["name"],
                discipline=arguments["discipline"],
                duration_minutes=arguments["duration_minutes"],
                scheduled_date=arguments["scheduled_date"],
                plan_week=arguments["plan_week"],
                plan_day=arguments["plan_day"],
                reason=arguments["reason"],
                user_id=user_id,
                sb=sb,
                content=arguments.get("content"),
                estimated_tss=arguments.get("estimated_tss"),
                builder_type=arguments.get("builder_type", "endurance"),
            )
        else:
            return f"Unknown tool: {tool_name}"
    except Exception as exc:
        logger.error("Coach tool %s failed: %s", tool_name, exc)
        return f"Tool error: {exc}"
