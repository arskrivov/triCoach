"""AI-powered training plan adjustment service.

Adjusts existing training plans based on athlete constraints (injury,
schedule changes, fatigue) using OpenAI. Only modifies current or future
workouts — never past ones.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from supabase import AsyncClient

from app.config import settings
from app.models import DailyHealthRow, TrainingPlanRow, WorkoutRow

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt for AI plan adjustments
# ---------------------------------------------------------------------------

PLAN_ADJUSTMENT_SYSTEM_PROMPT = """\
You are an expert endurance coach reviewing an athlete's current training plan. \
The athlete has sent you a message about a constraint — this could be an injury, \
a schedule change, fatigue, illness, or any other factor that requires modifying \
their plan.

YOUR TASK: Analyse the athlete's message and their current plan state, then \
generate specific workout modifications as JSON.

ADJUSTMENT PRINCIPLES:
- Only modify current or future workouts. Never modify past workouts.
- For injuries: swap to safer alternatives that avoid the affected area. \
  Examples: knee pain → swap running for swimming or cycling; shoulder injury → \
  swap swimming for running; back pain → reduce strength load, add mobility.
- For schedule changes: redistribute the missed workout's training load across \
  remaining days in the week. Don't just skip — move the stimulus.
- For fatigue/illness: reduce intensity and/or volume. Convert hard sessions to \
  easy/recovery sessions. Consider adding an extra rest day.
- Preserve the overall training block structure and periodization intent.
- Keep total weekly training stress reasonable — don't overload remaining days.

VALID DISCIPLINES: SWIM, RUN, RIDE_ROAD, RIDE_GRAVEL, STRENGTH, YOGA, MOBILITY

ACTIONS:
- "modify": Change the workout content, discipline, duration, or intensity.
- "skip": Remove the workout entirely (replace with rest).
- "swap": Replace the workout with a different discipline.

OUTPUT FORMAT — valid JSON only, no markdown fences, no prose outside JSON.
{
  "adjustments": [
    {
      "workout_id": "uuid-of-existing-workout-or-null",
      "day": 3,
      "week": 8,
      "action": "modify",
      "original_discipline": "RUN",
      "new_discipline": "SWIM",
      "new_name": "Recovery Swim",
      "new_duration_minutes": 30,
      "new_content": {
        "type": "recovery",
        "warmup": {"duration_min": 5, "zone": "Z1", "description": "Easy swim"},
        "main": [{"duration_min": 20, "zone": "Z1-Z2", "description": "Steady easy swim"}],
        "cooldown": {"duration_min": 5, "zone": "Z1", "description": "Easy cooldown"},
        "target_tss": 20,
        "notes": "Low-impact recovery session to maintain fitness while protecting knee"
      },
      "reason": "Swapped running for swimming due to knee pain"
    }
  ],
  "summary": "Adjusted Thursday's run to a recovery swim due to knee pain. \
Redistributed some run volume to Saturday."
}

RULES:
- Each adjustment must reference a specific workout_id from the provided plan state.
- If creating a new workout to redistribute load, set workout_id to null.
- The new_discipline must be one of the valid disciplines listed above.
- Always include a clear reason for each adjustment.
- The summary should be a concise, athlete-friendly explanation of all changes.
- If the athlete's message is unclear, make conservative adjustments and explain \
  your reasoning in the summary.
"""


def _parse_adjustment_response(ai_text: str) -> dict:
    """Parse AI adjustment JSON response with fallback handling.

    Returns a dict with 'adjustments' list and 'summary' string.
    """
    result: dict | None = None

    # Try direct parse
    try:
        result = json.loads(ai_text)
    except json.JSONDecodeError:
        pass

    # Fallback: strip markdown fences
    if result is None:
        try:
            cleaned = ai_text.strip()
            if cleaned.startswith("```"):
                first_newline = cleaned.index("\n")
                cleaned = cleaned[first_newline + 1:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            result = json.loads(cleaned.strip())
        except (json.JSONDecodeError, ValueError):
            pass

    # Fallback: extract JSON object from surrounding text
    if result is None:
        try:
            start = ai_text.index("{")
            end = ai_text.rindex("}") + 1
            result = json.loads(ai_text[start:end])
        except (ValueError, json.JSONDecodeError):
            logger.warning("Failed to parse AI adjustment response")
            result = {}

    if not isinstance(result, dict):
        result = {}

    # Ensure required fields
    if "adjustments" not in result or not isinstance(result["adjustments"], list):
        result["adjustments"] = []
    if "summary" not in result or not isinstance(result["summary"], str):
        result["summary"] = "No adjustments were made."

    return result


async def adjust_plan(
    plan_id: str,
    user_message: str,
    user_id: str,
    sb: AsyncClient,
) -> dict:
    """Adjust a training plan based on the athlete's message using AI.

    1. Fetches the plan and verifies ownership
    2. Fetches this week's workouts and recent health data
    3. Builds context and calls OpenAI for adjustment suggestions
    4. Applies modifications to affected workout rows (current/future only)
    5. Logs the adjustment in plan.adjustments JSONB

    Returns dict with 'adjustments', 'summary', and 'modified_workouts'.

    Raises:
        HTTPException 404: Plan not found
        HTTPException 503: OpenAI unavailable
    """
    # 1. Fetch plan and verify ownership
    plan_res = await sb.table("training_plans").select("*").eq(
        "id", plan_id
    ).eq("user_id", user_id).limit(1).execute()
    if not plan_res.data:
        raise HTTPException(status_code=404, detail="Plan not found")

    plan = TrainingPlanRow(**plan_res.data[0])

    # 2. Determine current week number within the plan
    today = date.today()
    plan_start = date.fromisoformat(str(plan.start_date))
    days_elapsed = (today - plan_start).days
    current_week = max(1, (days_elapsed // 7) + 1)

    # 3. Fetch this week's and upcoming workouts
    workouts_res = await sb.table("workouts").select("*").eq(
        "plan_id", plan_id
    ).eq("user_id", user_id).gte(
        "plan_week", current_week
    ).order("plan_week", desc=False).order("plan_day", desc=False).execute()
    workouts = [WorkoutRow(**w) for w in (workouts_res.data or [])]

    # Also fetch this week's workouts that may be in the past days of the current week
    # (for context, but we won't modify past ones)
    this_week_res = await sb.table("workouts").select("*").eq(
        "plan_id", plan_id
    ).eq("user_id", user_id).eq(
        "plan_week", current_week
    ).order("plan_day", desc=False).execute()
    this_week_workouts = [WorkoutRow(**w) for w in (this_week_res.data or [])]

    # 4. Fetch recent health data (last 7 days)
    seven_days_ago = (today - timedelta(days=7)).isoformat()
    health_res = await sb.table("daily_health").select("*").eq(
        "user_id", user_id
    ).gte("date", seven_days_ago).order("date", desc=False).execute()
    health_rows = [DailyHealthRow(**r) for r in (health_res.data or [])]

    # 5. Build context for AI
    context = _build_adjustment_context(
        plan=plan,
        current_week=current_week,
        this_week_workouts=this_week_workouts,
        upcoming_workouts=workouts,
        health_rows=health_rows,
        user_message=user_message,
        today=today,
    )

    # 6. Call OpenAI
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="Plan adjustment is temporarily unavailable",
        )

    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.responses.create(
            model=settings.openai_coach_model,
            instructions=PLAN_ADJUSTMENT_SYSTEM_PROMPT,
            input=context,
            max_output_tokens=4000,
        )
        ai_text = response.output_text.strip()
    except Exception as exc:
        logger.error("OpenAI plan adjustment failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Plan adjustment is temporarily unavailable",
        ) from exc

    # 7. Parse AI response
    adjustment_data = _parse_adjustment_response(ai_text)

    # 8. Apply adjustments to workout rows
    modified_workouts = await _apply_adjustments(
        plan_id=plan_id,
        user_id=user_id,
        adjustments=adjustment_data["adjustments"],
        plan_start=plan_start,
        today=today,
        sb=sb,
    )

    # 9. Log adjustment in plan.adjustments JSONB
    now = datetime.now(timezone.utc).isoformat()
    adjustment_log = {
        "date": now,
        "reason": user_message,
        "summary": adjustment_data["summary"],
        "changes": [
            {
                "workout_id": adj.get("workout_id"),
                "action": adj.get("action"),
                "original_discipline": adj.get("original_discipline"),
                "new_discipline": adj.get("new_discipline"),
                "reason": adj.get("reason"),
            }
            for adj in adjustment_data["adjustments"]
        ],
    }

    existing_adjustments = plan.adjustments if isinstance(plan.adjustments, list) else []
    updated_adjustments = existing_adjustments + [adjustment_log]

    await sb.table("training_plans").update({
        "adjustments": updated_adjustments,
        "updated_at": now,
    }).eq("id", plan_id).execute()

    return {
        "adjustments": adjustment_data["adjustments"],
        "summary": adjustment_data["summary"],
        "modified_workouts": modified_workouts,
    }


def _build_adjustment_context(
    plan: TrainingPlanRow,
    current_week: int,
    this_week_workouts: list[WorkoutRow],
    upcoming_workouts: list[WorkoutRow],
    health_rows: list[DailyHealthRow],
    user_message: str,
    today: date,
) -> str:
    """Build structured context for the AI adjustment prompt."""
    sections: list[str] = []

    # Plan overview
    plan_lines = ["## Current Plan"]
    plan_lines.append(f"- Name: {plan.name}")
    plan_lines.append(f"- Status: {plan.status}")
    plan_lines.append(f"- Start date: {plan.start_date}")
    plan_lines.append(f"- End date: {plan.end_date}")
    plan_lines.append(f"- Weekly hours budget: {plan.weekly_hours}h")
    plan_lines.append(f"- Current week: {current_week}")
    plan_lines.append(f"- Today: {today.isoformat()} ({_day_name(today.weekday())})")

    # Include phase info if available
    phases = (plan.plan_structure or {}).get("phases", [])
    for phase in phases:
        if isinstance(phase, dict):
            phase_weeks = phase.get("weeks", [])
            if current_week in phase_weeks:
                plan_lines.append(f"- Current phase: {phase.get('name', 'Unknown')}")
                plan_lines.append(f"- Phase focus: {phase.get('focus', '')}")
                break
    sections.append("\n".join(plan_lines))

    # This week's workouts
    week_lines = [f"## This Week's Workouts (Week {current_week})"]
    today_weekday = today.weekday()
    for w in this_week_workouts:
        day_num = w.plan_day if w.plan_day is not None else 0
        is_past = day_num < today_weekday
        is_today = day_num == today_weekday
        status = "(past)" if is_past else "(TODAY)" if is_today else "(upcoming)"
        dur_min = (w.estimated_duration_seconds or 0) // 60
        week_lines.append(
            f"- {_day_name(day_num)} {status}: {w.discipline} — {w.name} "
            f"({dur_min}min, TSS:{w.estimated_tss or 0:.0f}) [id: {w.id}]"
        )
    if not this_week_workouts:
        week_lines.append("- No workouts scheduled this week.")
    sections.append("\n".join(week_lines))

    # Upcoming weeks (next 2 weeks after current)
    upcoming_by_week: dict[int, list[WorkoutRow]] = {}
    for w in upcoming_workouts:
        wk = w.plan_week or current_week
        if wk > current_week and wk <= current_week + 2:
            upcoming_by_week.setdefault(wk, []).append(w)

    if upcoming_by_week:
        upcoming_lines = ["## Upcoming Weeks"]
        for wk in sorted(upcoming_by_week.keys()):
            upcoming_lines.append(f"\n### Week {wk}")
            for w in upcoming_by_week[wk]:
                day_num = w.plan_day if w.plan_day is not None else 0
                dur_min = (w.estimated_duration_seconds or 0) // 60
                upcoming_lines.append(
                    f"- {_day_name(day_num)}: {w.discipline} — {w.name} "
                    f"({dur_min}min, TSS:{w.estimated_tss or 0:.0f}) [id: {w.id}]"
                )
        sections.append("\n".join(upcoming_lines))

    # Recent health data
    if health_rows:
        health_lines = ["## Recent Health Data (last 7 days)"]
        for h in health_rows:
            parts = [f"- {h.date}:"]
            if h.sleep_score is not None:
                parts.append(f"sleep={h.sleep_score}")
            if h.hrv_last_night is not None:
                parts.append(f"HRV={h.hrv_last_night:.0f}ms")
            if h.resting_hr is not None:
                parts.append(f"RHR={h.resting_hr}bpm")
            if h.body_battery_high is not None:
                parts.append(f"BB={h.body_battery_low or 0}-{h.body_battery_high}")
            if h.morning_readiness_score is not None:
                parts.append(f"readiness={h.morning_readiness_score}")
            health_lines.append(" ".join(parts))
        sections.append("\n".join(health_lines))

    # Previous adjustments (for context)
    if plan.adjustments and isinstance(plan.adjustments, list) and len(plan.adjustments) > 0:
        adj_lines = ["## Previous Adjustments"]
        for adj in plan.adjustments[-3:]:  # Last 3 adjustments
            if isinstance(adj, dict):
                adj_lines.append(
                    f"- {adj.get('date', 'unknown')}: {adj.get('summary', 'No summary')}"
                )
        sections.append("\n".join(adj_lines))

    # Athlete's message
    sections.append(f"## Athlete's Message\n{user_message}")

    return "\n\n".join(sections)


def _day_name(day_num: int) -> str:
    """Convert day number (0=Monday) to name."""
    names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    return names[day_num] if 0 <= day_num <= 6 else f"Day {day_num}"


async def _apply_adjustments(
    plan_id: str,
    user_id: str,
    adjustments: list[dict],
    plan_start: date,
    today: date,
    sb: AsyncClient,
) -> list[dict]:
    """Apply AI-suggested adjustments to workout rows in the database.

    Only modifies workouts that are scheduled for today or in the future.
    Returns list of modified workout dicts.
    """
    modified: list[dict] = []

    for adj in adjustments:
        if not isinstance(adj, dict):
            continue

        action = adj.get("action", "modify")
        workout_id = adj.get("workout_id")

        if action == "skip" and workout_id:
            # Verify the workout is current/future before skipping
            workout_res = await sb.table("workouts").select("*").eq(
                "id", workout_id
            ).eq("user_id", user_id).eq("plan_id", plan_id).limit(1).execute()

            if not workout_res.data:
                continue

            workout = workout_res.data[0]
            scheduled = workout.get("scheduled_date")
            if scheduled and date.fromisoformat(scheduled) < today:
                continue  # Don't modify past workouts

            # Mark as skipped by updating content
            now = datetime.now(timezone.utc).isoformat()
            update_payload: dict[str, Any] = {
                "content": {
                    "type": "skipped",
                    "reason": adj.get("reason", "Skipped by coach adjustment"),
                    "original_content": workout.get("content", {}),
                },
                "description": f"[SKIPPED] {adj.get('reason', 'Coach adjustment')}",
                "estimated_duration_seconds": 0,
                "estimated_tss": 0,
                "updated_at": now,
            }
            res = await sb.table("workouts").update(update_payload).eq(
                "id", workout_id
            ).execute()
            if res.data:
                modified.append(res.data[0])

        elif action in ("modify", "swap") and workout_id:
            # Verify the workout is current/future
            workout_res = await sb.table("workouts").select("*").eq(
                "id", workout_id
            ).eq("user_id", user_id).eq("plan_id", plan_id).limit(1).execute()

            if not workout_res.data:
                continue

            workout = workout_res.data[0]
            scheduled = workout.get("scheduled_date")
            if scheduled and date.fromisoformat(scheduled) < today:
                continue  # Don't modify past workouts

            now = datetime.now(timezone.utc).isoformat()
            new_duration_min = adj.get("new_duration_minutes")
            update_payload = {}

            if adj.get("new_discipline"):
                update_payload["discipline"] = adj["new_discipline"]
            if adj.get("new_name"):
                update_payload["name"] = adj["new_name"]
            if adj.get("new_content") and isinstance(adj["new_content"], dict):
                update_payload["content"] = adj["new_content"]
            if new_duration_min is not None:
                update_payload["estimated_duration_seconds"] = int(new_duration_min) * 60
            if adj.get("new_content", {}).get("target_tss") is not None:
                update_payload["estimated_tss"] = adj["new_content"]["target_tss"]

            # Add description noting the adjustment
            reason = adj.get("reason", "Coach adjustment")
            original_desc = workout.get("description") or ""
            update_payload["description"] = f"{reason}\n(Original: {original_desc})" if original_desc else reason
            update_payload["updated_at"] = now

            if update_payload:
                res = await sb.table("workouts").update(update_payload).eq(
                    "id", workout_id
                ).execute()
                if res.data:
                    modified.append(res.data[0])

        elif action in ("modify", "swap") and not workout_id:
            # New workout to redistribute load — create a new workout row
            week = adj.get("week")
            day = adj.get("day")
            if week is None or day is None:
                continue

            # Calculate scheduled date
            scheduled_date = plan_start + timedelta(weeks=week - 1, days=day)
            if scheduled_date < today:
                continue  # Don't create past workouts

            new_duration_min = adj.get("new_duration_minutes", 30)
            now = datetime.now(timezone.utc).isoformat()
            new_workout = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "name": adj.get("new_name", "Adjusted Workout"),
                "discipline": adj.get("new_discipline", "RUN"),
                "builder_type": "endurance",
                "description": adj.get("reason", "Added by coach adjustment"),
                "content": adj.get("new_content", {}),
                "estimated_duration_seconds": int(new_duration_min) * 60,
                "estimated_tss": (adj.get("new_content") or {}).get("target_tss"),
                "is_template": False,
                "scheduled_date": scheduled_date.isoformat(),
                "plan_id": plan_id,
                "plan_week": week,
                "plan_day": day,
                "created_at": now,
                "updated_at": now,
            }
            res = await sb.table("workouts").insert(new_workout).execute()
            if res.data:
                modified.append(res.data[0])

    return modified
