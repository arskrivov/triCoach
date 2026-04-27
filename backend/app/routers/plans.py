"""Training plan CRUD and generation endpoints."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import AsyncClient

from app.database import get_supabase
from app.models import TrainingPlanRow, UserRow, WorkoutRow
from app.services.auth import get_current_user
from app.services.garmin_workout_sync import (
    delete_plan_workouts_from_garmin,
    sync_plan_to_garmin,
    sync_workouts_batch_to_garmin,
)
from app.services.plan_adjuster import adjust_plan
from app.services.plan_generator import generate_plan
from app.services.workout_enrichment import (
    generate_workout_enrichments,
    has_detailed_workout_content,
)
from app.services.workout_matching import match_workouts_to_activities

router = APIRouter(prefix="/plans", tags=["plans"])


# ── Request / Response models ─────────────────────────────────────────────────


class PlanGenerateRequest(BaseModel):
    goal_id: str | None = None


class PlanWorkoutResponse(BaseModel):
    id: str
    name: str
    discipline: str
    builder_type: str
    description: str | None = None
    content: Any = None
    estimated_duration_seconds: int | None = None
    estimated_tss: float | None = None
    scheduled_date: str | None = None
    plan_week: int | None = None
    plan_day: int | None = None
    garmin_workout_id: int | None = None
    completed_by_activity_id: str | None = None
    completed_by_activity_name: str | None = None
    completed_by_activity_start_time: str | None = None


class PlanResponse(BaseModel):
    id: str
    goal_id: str | None = None
    name: str
    status: str
    race_date: str | None = None
    start_date: str
    end_date: str
    weekly_hours: float
    plan_structure: Any = None
    adjustments: Any = None
    created_at: str | None = None
    updated_at: str | None = None


class PlanWithWorkoutsResponse(PlanResponse):
    workouts: list[PlanWorkoutResponse] = []


class PlanUpdate(BaseModel):
    name: str | None = None
    status: str | None = None


class WeekCompliance(BaseModel):
    week_number: int
    total_workouts: int
    completed_workouts: int
    compliance_pct: float
    target_tss: float
    actual_tss: float


class PlanComplianceResponse(BaseModel):
    plan_id: str
    overall_compliance_pct: float
    total_planned: int
    total_completed: int
    weeks: list[WeekCompliance]


class PlanAdjustRequest(BaseModel):
    message: str


class PlanAdjustResponse(BaseModel):
    adjustments: list
    summary: str
    modified_workouts: list


class GarminSyncResponse(BaseModel):
    synced: int
    failed: int
    total: int
    details: list


def _scheduled_range(workouts: list[dict[str, Any]]) -> tuple[str, str] | None:
    scheduled_dates = [
        workout["scheduled_date"]
        for workout in workouts
        if workout.get("scheduled_date")
    ]
    if not scheduled_dates:
        return None

    min_date = min(scheduled_dates)
    max_date = max(scheduled_dates)
    range_start = (date.fromisoformat(min_date) - timedelta(days=1)).isoformat()
    range_end = (date.fromisoformat(max_date) + timedelta(days=1)).isoformat()
    return range_start, range_end


async def _load_activities_for_workouts(
    workouts: list[dict[str, Any]],
    *,
    user_id: str,
    sb: AsyncClient,
) -> list[dict[str, Any]]:
    scheduled_range = _scheduled_range(workouts)
    if scheduled_range is None:
        return []

    range_start, range_end = scheduled_range
    activities_res = await sb.table("activities").select("*").eq(
        "user_id", user_id
    ).gte(
        "start_time", range_start
    ).lte(
        "start_time", range_end + "T23:59:59Z"
    ).order(
        "start_time", desc=False
    ).execute()
    return activities_res.data or []


def _attach_completion_metadata(
    workouts: list[dict[str, Any]],
    matches: dict[str, Any],
) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for workout in workouts:
        matched = matches.get(str(workout.get("id") or ""))
        enriched.append({
            **workout,
            "completed_by_activity_id": matched.get("id") if matched else None,
            "completed_by_activity_name": matched.get("name") if matched else None,
            "completed_by_activity_start_time": matched.get("start_time") if matched else None,
        })
    return enriched


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/generate", response_model=PlanWithWorkoutsResponse, status_code=status.HTTP_201_CREATED)
async def generate_training_plan(
    body: PlanGenerateRequest,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    """Generate a new AI training plan from a goal."""
    result = await generate_plan(current_user.id, body.goal_id, sb)
    plan = result["plan"]
    workouts = result.get("workouts", [])
    return {
        **plan,
        "workouts": workouts,
    }


@router.get("", response_model=list[PlanResponse])
async def list_plans(
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    """List all plans for the current user (active, completed, archived)."""
    res = await sb.table("training_plans").select("*").eq(
        "user_id", current_user.id
    ).order("created_at", desc=True).execute()
    return res.data or []


@router.get("/{plan_id}", response_model=PlanWithWorkoutsResponse)
async def get_plan(
    plan_id: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    """Get a plan with all its workouts, ordered by plan_week + plan_day."""
    plan_res = await sb.table("training_plans").select("*").eq(
        "id", plan_id
    ).eq("user_id", current_user.id).limit(1).execute()
    if not plan_res.data:
        raise HTTPException(status_code=404, detail="Plan not found")

    plan = plan_res.data[0]

    workouts_res = await sb.table("workouts").select("*").eq(
        "plan_id", plan_id
    ).eq("user_id", current_user.id).order(
        "plan_week", desc=False
    ).order("plan_day", desc=False).execute()

    workouts = workouts_res.data or []
    activities = await _load_activities_for_workouts(
        workouts,
        user_id=current_user.id,
        sb=sb,
    )
    matches = match_workouts_to_activities(workouts, activities)
    return {
        **plan,
        "workouts": _attach_completion_metadata(workouts, matches),
    }


@router.put("/{plan_id}", response_model=PlanResponse)
async def update_plan(
    plan_id: str,
    body: PlanUpdate,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    """Update plan metadata (name, status)."""
    existing = await sb.table("training_plans").select("id").eq(
        "id", plan_id
    ).eq("user_id", current_user.id).limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Plan not found")

    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Validate status if provided
    if "status" in payload and payload["status"] not in ("active", "completed", "archived"):
        raise HTTPException(status_code=400, detail="Invalid status. Must be active, completed, or archived")

    res = await sb.table("training_plans").update(payload).eq("id", plan_id).execute()
    return res.data[0]


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_plan(
    plan_id: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    """Archive a plan (soft delete — sets status to 'archived').

    Also cleans up any Garmin workouts associated with the plan.
    """
    existing = await sb.table("training_plans").select("id").eq(
        "id", plan_id
    ).eq("user_id", current_user.id).limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Clean up Garmin workouts before archiving
    try:
        await delete_plan_workouts_from_garmin(plan_id, current_user.id, sb)
    except Exception:
        # Don't fail the archive if Garmin cleanup fails
        pass

    await sb.table("training_plans").update({"status": "archived"}).eq("id", plan_id).execute()


@router.get("/{plan_id}/compliance", response_model=PlanComplianceResponse)
async def get_plan_compliance(
    plan_id: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    """Calculate and return plan compliance stats.

    For each planned workout, checks if there's a completed activity
    within ±1 day of the scheduled_date with a matching discipline.
    Returns per-week and overall compliance.
    """
    # Verify plan ownership
    plan_res = await sb.table("training_plans").select("*").eq(
        "id", plan_id
    ).eq("user_id", current_user.id).limit(1).execute()
    if not plan_res.data:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Fetch all workouts for this plan
    workouts_res = await sb.table("workouts").select(
        "id,discipline,scheduled_date,plan_week,estimated_tss"
    ).eq("plan_id", plan_id).eq("user_id", current_user.id).order(
        "plan_week", desc=False
    ).order(
        "plan_day", desc=False
    ).execute()
    workouts = workouts_res.data or []

    if not workouts:
        return {
            "plan_id": plan_id,
            "overall_compliance_pct": 0.0,
            "total_planned": 0,
            "total_completed": 0,
            "weeks": [],
        }

    if _scheduled_range(workouts) is None:
        return {
            "plan_id": plan_id,
            "overall_compliance_pct": 0.0,
            "total_planned": len(workouts),
            "total_completed": 0,
            "weeks": [],
        }

    activities = await _load_activities_for_workouts(
        workouts,
        user_id=current_user.id,
        sb=sb,
    )
    matches = match_workouts_to_activities(workouts, activities)

    # Match workouts to activities
    # Group workouts by week
    weeks_map: dict[int, list[dict]] = {}
    for w in workouts:
        week_num = w.get("plan_week") or 1
        weeks_map.setdefault(week_num, []).append(w)

    week_results: list[WeekCompliance] = []
    total_completed = 0
    total_planned = len(workouts)

    for week_num in sorted(weeks_map.keys()):
        week_workouts = weeks_map[week_num]
        week_completed = 0
        target_tss = 0.0
        actual_tss = 0.0

        for w in week_workouts:
            target_tss += w.get("estimated_tss") or 0.0
            matched = matches.get(str(w.get("id") or ""))
            if matched:
                week_completed += 1
                actual_tss += matched.get("tss") or 0.0

        total_completed += week_completed
        compliance_pct = (week_completed / len(week_workouts) * 100) if week_workouts else 0.0

        week_results.append(WeekCompliance(
            week_number=week_num,
            total_workouts=len(week_workouts),
            completed_workouts=week_completed,
            compliance_pct=round(compliance_pct, 1),
            target_tss=round(target_tss, 1),
            actual_tss=round(actual_tss, 1),
        ))

    overall_pct = (total_completed / total_planned * 100) if total_planned else 0.0

    return PlanComplianceResponse(
        plan_id=plan_id,
        overall_compliance_pct=round(overall_pct, 1),
        total_planned=total_planned,
        total_completed=total_completed,
        weeks=week_results,
    )


@router.post("/{plan_id}/adjust", response_model=PlanAdjustResponse)
async def adjust_training_plan(
    plan_id: str,
    body: PlanAdjustRequest,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    """Adjust a training plan based on athlete message (injury, schedule change, fatigue)."""
    result = await adjust_plan(plan_id, body.message, current_user.id, sb)
    return PlanAdjustResponse(
        adjustments=result["adjustments"],
        summary=result["summary"],
        modified_workouts=result["modified_workouts"],
    )


@router.post("/{plan_id}/sync-garmin", response_model=GarminSyncResponse)
async def sync_garmin(
    plan_id: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    """Sync upcoming plan workouts to Garmin Connect."""
    result = await sync_plan_to_garmin(plan_id, current_user.id, sb)
    return GarminSyncResponse(
        synced=result["synced"],
        failed=result["failed"],
        total=result["total"],
        details=result.get("details", []),
    )


class WeekBriefingResponse(BaseModel):
    week_number: int
    phase: str
    briefing: str
    cached: bool = False


@router.get("/{plan_id}/week-briefing/{week_number}", response_model=WeekBriefingResponse)
async def get_week_briefing(
    plan_id: str,
    week_number: int,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    """Get the AI coach briefing for a specific training week.

    Briefings are cached and only regenerated when the underlying data
    changes (e.g. after a Garmin sync brings new health/activity data).
    This means the briefing updates once per day after the first sync,
    not on every page load.
    """
    import hashlib
    import json as _json

    from app.config import settings
    from app.models import DailyHealthRow, TrainingPlanRow

    # Fetch plan
    plan_res = await sb.table("training_plans").select("*").eq(
        "id", plan_id
    ).eq("user_id", current_user.id).limit(1).execute()
    if not plan_res.data:
        raise HTTPException(status_code=404, detail="Plan not found")

    plan = TrainingPlanRow(**plan_res.data[0])
    plan_structure = plan.plan_structure or {}
    phases = plan_structure.get("phases", [])
    total_weeks = plan_structure.get("total_weeks", 1)

    # Determine current phase
    current_phase = "Training"
    phase_focus = ""
    for phase in phases:
        if isinstance(phase, dict) and week_number in phase.get("weeks", []):
            current_phase = phase.get("name", "Training")
            phase_focus = phase.get("focus", "")
            break

    # Fetch this week's workouts
    workouts_res = await sb.table("workouts").select(
        "name,discipline,estimated_duration_seconds,estimated_tss,content"
    ).eq("plan_id", plan_id).eq("user_id", current_user.id).eq(
        "plan_week", week_number
    ).order("plan_day", desc=False).execute()
    workouts = workouts_res.data or []

    # Fetch latest health data (last 3 days) to include in the signature
    today = date.today()
    three_days_ago = (today - timedelta(days=3)).isoformat()
    health_res = await sb.table("daily_health").select(
        "date,sleep_score,hrv_last_night,resting_hr,morning_readiness_score"
    ).eq("user_id", current_user.id).gte(
        "date", three_days_ago
    ).order("date", desc=True).limit(3).execute()
    recent_health = health_res.data or []

    # Build data signature — changes when workouts or health data change
    sig_payload = {
        "plan_id": plan_id,
        "week": week_number,
        "workouts": [
            {"name": w.get("name"), "discipline": w.get("discipline"),
             "tss": w.get("estimated_tss"), "dur": w.get("estimated_duration_seconds")}
            for w in workouts
        ],
        "health": [
            {"date": h.get("date"), "sleep": h.get("sleep_score"),
             "hrv": h.get("hrv_last_night"), "rhr": h.get("resting_hr"),
             "readiness": h.get("morning_readiness_score")}
            for h in recent_health
        ],
    }
    data_signature = hashlib.sha256(
        _json.dumps(sig_payload, sort_keys=True, default=str).encode()
    ).hexdigest()[:16]

    # Check cache
    cache_res = await sb.table("plan_week_briefings").select(
        "briefing,data_signature"
    ).eq("plan_id", plan_id).eq("week_number", week_number).limit(1).execute()

    cached = cache_res.data[0] if cache_res.data else None
    if cached and cached.get("data_signature") == data_signature:
        return WeekBriefingResponse(
            week_number=week_number,
            phase=current_phase,
            briefing=cached["briefing"],
            cached=True,
        )

    # Build workout summary for the prompt
    workout_lines = []
    total_hours = 0.0
    total_tss = 0.0
    for w in workouts:
        dur_min = (w.get("estimated_duration_seconds") or 0) // 60
        total_hours += dur_min / 60
        total_tss += w.get("estimated_tss") or 0
        wtype = ""
        content = w.get("content")
        if isinstance(content, dict):
            wtype = content.get("type", "")
        workout_lines.append(f"- {w['discipline']}: {w['name']} ({dur_min}min, {wtype})")

    workout_summary = "\n".join(workout_lines) if workout_lines else "No workouts scheduled."

    # Include recent recovery context
    health_context = ""
    if recent_health:
        h = recent_health[0]  # most recent day
        parts = []
        if h.get("sleep_score"):
            parts.append(f"sleep score {h['sleep_score']}")
        if h.get("hrv_last_night"):
            parts.append(f"HRV {h['hrv_last_night']:.0f}ms")
        if h.get("resting_hr"):
            parts.append(f"RHR {h['resting_hr']}bpm")
        if h.get("morning_readiness_score"):
            parts.append(f"readiness {h['morning_readiness_score']}")
        if parts:
            health_context = f"\nRecent recovery: {', '.join(parts)}"

    prompt = f"""You are an expert triathlon coach. Write a brief weekly briefing (3-4 sentences) for an athlete about their upcoming training week.

Plan: {plan.name}
Week {week_number} of {total_weeks} — {current_phase} phase
Phase focus: {phase_focus}
Total hours this week: {total_hours:.1f}h
Total TSS this week: {total_tss:.0f}{health_context}

This week's workouts:
{workout_summary}

Write a concise, motivating briefing covering:
1. What this week is about and why (training theory in plain language)
2. One practical tip (nutrition, recovery, or mindset)
Keep it to 3-4 sentences. Be specific to the workouts listed. No bullet points — flowing prose."""

    heuristic = (
        f"Week {week_number} of your {current_phase} phase. "
        f"You have {len(workouts)} sessions planned totalling {total_hours:.1f} hours. "
        f"Focus: {phase_focus or 'consistent training'}."
    )

    if not settings.openai_api_key:
        briefing_text = heuristic
    else:
        try:
            from openai import OpenAI

            client = OpenAI(api_key=settings.openai_api_key)
            response = client.responses.create(
                model=settings.openai_analysis_model,
                input=prompt,
                max_output_tokens=300,
            )
            briefing_text = response.output_text.strip()
        except Exception:
            briefing_text = heuristic

    # Store in cache (upsert)
    cache_payload = {
        "plan_id": plan_id,
        "user_id": current_user.id,
        "week_number": week_number,
        "data_signature": data_signature,
        "briefing": briefing_text,
    }
    try:
        await sb.table("plan_week_briefings").upsert(
            cache_payload, on_conflict="plan_id,week_number"
        ).execute()
    except Exception:
        pass  # caching failure is non-critical

    return WeekBriefingResponse(
        week_number=week_number,
        phase=current_phase,
        briefing=briefing_text,
        cached=False,
    )


class EnrichWeekResponse(BaseModel):
    plan_id: str
    week_number: int
    enriched_count: int
    skipped_count: int
    workouts: list[PlanWorkoutResponse]


@router.post("/{plan_id}/enrich-week/{week_number}", response_model=EnrichWeekResponse)
async def enrich_week_workouts(
    plan_id: str,
    week_number: int,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    """Generate detailed structured content for all workouts in a given week.

    For each workout that has empty or minimal content, calls the AI to
    generate a full program (warmup, main set, cooldown, zones, notes)
    using the plan context (phase, goals, athlete profile).
    Workouts that already have detailed content are skipped.
    """
    import logging

    logger = logging.getLogger(__name__)

    # Fetch plan
    plan_res = await sb.table("training_plans").select("*").eq(
        "id", plan_id
    ).eq("user_id", current_user.id).limit(1).execute()
    if not plan_res.data:
        raise HTTPException(status_code=404, detail="Plan not found")

    plan = TrainingPlanRow(**plan_res.data[0])

    # Fetch workouts for this week
    workouts_res = await sb.table("workouts").select("*").eq(
        "plan_id", plan_id
    ).eq("user_id", current_user.id).eq(
        "plan_week", week_number
    ).order("plan_day", desc=False).execute()
    workouts = workouts_res.data or []

    if not workouts:
        raise HTTPException(status_code=404, detail=f"No workouts found for week {week_number}")

    # Identify workouts that need enrichment (empty or minimal content)
    to_enrich = []
    already_rich = []
    for w in workouts:
        content = w.get("content") or {}
        if has_detailed_workout_content(content):
            already_rich.append(w)
        else:
            to_enrich.append(w)

    # If all workouts already have content, re-enrich them all
    # (user clicked Generate & Sync again to get better content)
    if not to_enrich and already_rich:
        to_enrich = already_rich
        already_rich = []

    if not to_enrich:
        return EnrichWeekResponse(
            plan_id=plan_id,
            week_number=week_number,
            enriched_count=0,
            skipped_count=len(already_rich),
            workouts=workouts,
        )

    try:
        enrichment_map = await generate_workout_enrichments(
            plan=plan,
            week_number=week_number,
            workouts=[WorkoutRow(**w) for w in to_enrich],
            user_id=current_user.id,
            sb=sb,
        )
    except RuntimeError as exc:
        logger.error("AI enrichment failed: %s", exc)
        raise HTTPException(status_code=503, detail="AI enrichment failed. Try again.") from exc

    # Apply enrichments to the database
    now = datetime.now(timezone.utc).isoformat()
    enriched_count = 0

    for w in to_enrich:
        enrichment = enrichment_map.get(w["id"])
        if not enrichment:
            continue

        update: dict[str, Any] = {"updated_at": now}
        if enrichment.get("content"):
            update["content"] = enrichment["content"]
        if enrichment.get("description"):
            update["description"] = enrichment["description"]

        try:
            await sb.table("workouts").update(update).eq("id", w["id"]).execute()
            enriched_count += 1
        except Exception as exc:
            logger.error("Failed to update workout %s: %s", w["id"], exc)

    # Auto-sync enriched workouts to Garmin
    enriched_ids = [w["id"] for w in to_enrich if w["id"] in enrichment_map]
    if enriched_ids:
        try:
            await sync_workouts_batch_to_garmin(enriched_ids, current_user.id, sb)
        except Exception as exc:
            logger.warning("Garmin sync failed for enriched workouts: %s", exc)

    # Re-fetch updated workouts
    updated_res = await sb.table("workouts").select("*").eq(
        "plan_id", plan_id
    ).eq("user_id", current_user.id).eq(
        "plan_week", week_number
    ).order("plan_day", desc=False).execute()

    return EnrichWeekResponse(
        plan_id=plan_id,
        week_number=week_number,
        enriched_count=enriched_count,
        skipped_count=len(already_rich),
        workouts=updated_res.data or [],
    )
