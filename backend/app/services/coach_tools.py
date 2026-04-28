"""Coach tool functions — callable by the AI coach via function calling.

Each function performs a specific plan modification and returns a
human-readable summary of what was done. Automatically syncs changes
to Garmin Connect when applicable.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any

from supabase import AsyncClient

from app.models import TrainingPlanRow, WorkoutRow
from app.services.discipline_mapping import normalize_discipline
from app.services.garmin_workout_sync import (
    delete_workout_from_garmin,
    sync_workout_to_garmin,
)
from app.services.workout_enrichment import (
    generate_workout_enrichments,
    has_detailed_workout_content,
    normalize_workout_content,
)

logger = logging.getLogger(__name__)


async def _maybe_enrich_coach_workout(
    workout: dict[str, Any],
    *,
    user_id: str,
    sb: AsyncClient,
    force: bool,
) -> dict[str, Any]:
    """Ensure coach-created/replaced workouts meet the same bar as Generate & Sync."""
    plan_id = workout.get("plan_id")
    if not plan_id:
        return workout

    content = normalize_workout_content(workout.get("content"))
    if content != (workout.get("content") or {}):
        now = datetime.now(timezone.utc).isoformat()
        res = await sb.table("workouts").update({
            "content": content,
            "updated_at": now,
        }).eq("id", workout["id"]).execute()
        if res.data:
            workout = res.data[0]
        else:
            workout = {**workout, "content": content, "updated_at": now}

    if not force and has_detailed_workout_content(content):
        return workout

    plan_res = await sb.table("training_plans").select("*").eq(
        "id", plan_id
    ).eq("user_id", user_id).limit(1).execute()
    if not plan_res.data:
        return workout

    plan = TrainingPlanRow(**plan_res.data[0])
    week_number = workout.get("plan_week") or 1
    enrichment_map = await generate_workout_enrichments(
        plan=plan,
        week_number=int(week_number),
        workouts=[WorkoutRow(**workout)],
        user_id=user_id,
        sb=sb,
    )
    enrichment = enrichment_map.get(str(workout["id"]))
    if not enrichment:
        return workout

    now = datetime.now(timezone.utc).isoformat()
    update = {
        "content": enrichment["content"],
        "updated_at": now,
    }
    res = await sb.table("workouts").update(update).eq("id", workout["id"]).execute()
    return res.data[0] if res.data else {**workout, **update}


async def skip_workout(
    workout_id: str, reason: str, user_id: str, sb: AsyncClient
) -> str:
    """Skip a planned workout while keeping it in plan history."""
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

    # Auto-sync to Garmin (will delete the workout from Garmin)
    try:
        await delete_workout_from_garmin(workout_id, user_id, sb)
    except Exception as exc:
        logger.warning("Garmin sync failed for skipped workout %s: %s", workout_id, exc)

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
    """Modify or replace an existing planned workout in place."""
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
    normalized_new_content = normalize_workout_content(new_content) if new_content is not None else None
    force_enrichment = False

    if new_name:
        update["name"] = new_name
        changes.append(f"name → '{new_name}'")
    if new_discipline:
        canonical_discipline = normalize_discipline(
            new_discipline,
            fallback=str(workout.get("discipline") or "RUN"),
        )
        update["discipline"] = canonical_discipline
        changes.append(f"discipline → {canonical_discipline}")
    if new_duration_minutes is not None:
        update["estimated_duration_seconds"] = new_duration_minutes * 60
        changes.append(f"duration → {new_duration_minutes}min")
    if normalized_new_content is not None:
        update["content"] = normalized_new_content
        changes.append("content updated")
        force_enrichment = not has_detailed_workout_content(normalized_new_content)
    if new_estimated_tss is not None:
        update["estimated_tss"] = new_estimated_tss
        changes.append(f"TSS → {new_estimated_tss}")
    if normalized_new_content is None and any(
        value is not None for value in (new_discipline, new_duration_minutes, new_estimated_tss)
    ):
        force_enrichment = True

    original_desc = workout.get("description") or ""
    update["description"] = f"{reason}\n(Original: {original_desc})" if original_desc else reason

    res = await sb.table("workouts").update(update).eq("id", workout_id).execute()
    updated_workout = res.data[0] if res.data else {**workout, **update}

    if force_enrichment:
        try:
            updated_workout = await _maybe_enrich_coach_workout(
                updated_workout,
                user_id=user_id,
                sb=sb,
                force=True,
            )
            changes.append("program enriched")
        except RuntimeError as exc:
            logger.warning("Coach enrichment failed for modified workout %s: %s", workout_id, exc)

    # Auto-sync to Garmin
    try:
        await sync_workout_to_garmin(workout_id, user_id, sb)
    except Exception as exc:
        logger.warning("Garmin sync failed for modified workout %s: %s", workout_id, exc)

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
    normalized_content = normalize_workout_content(content or {})
    canonical_discipline = normalize_discipline(discipline, fallback="RUN")
    workout = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": name,
        "discipline": canonical_discipline,
        "builder_type": builder_type,
        "description": reason,
        "content": normalized_content,
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
    res = await sb.table("workouts").insert(workout).execute()
    created_workout = res.data[0] if res.data else workout

    if not has_detailed_workout_content(normalized_content):
        try:
            created_workout = await _maybe_enrich_coach_workout(
                created_workout,
                user_id=user_id,
                sb=sb,
                force=True,
            )
        except RuntimeError as exc:
            logger.warning("Coach enrichment failed for new workout %s: %s", created_workout["id"], exc)

    # Auto-sync to Garmin
    workout_id = created_workout["id"]
    try:
        await sync_workout_to_garmin(workout_id, user_id, sb)
    except Exception as exc:
        logger.warning("Garmin sync failed for new workout %s: %s", workout_id, exc)

    return f"Added '{name}' ({canonical_discipline}, {duration_minutes}min) on {scheduled_date}."


# ── Tool definitions for OpenAI function calling ─────────────────────────────

COACH_TOOLS = [
    {
        "type": "function",
        "name": "skip_workout",
        "description": "Mark a planned workout as skipped while keeping it in plan history. Use when the athlete wants to drop/cancel a workout without hard-deleting it.",
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
        "description": "Modify or replace a planned workout in place — change its name, discipline, duration, or structured content. Prefer this when the athlete says to replace a workout/day instead of adding a duplicate.",
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
                    "description": "New structured workout content (optional). Match the Generate & Sync schema: include type, target_tss, target_hr_zone, warmup object, main array, cooldown object, and notes.",
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
                    "description": "Structured workout content using the same schema as Generate & Sync: type, target_tss, target_hr_zone, warmup object, main array, cooldown object, and notes.",
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
