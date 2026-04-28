"""Shared AI workout enrichment utilities.

Used by both the explicit "Generate & Sync" flow and coach-driven plan edits so
the content schema and quality bar stay aligned.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from supabase import AsyncClient

from app.config import settings
from app.models import TrainingPlanRow, WorkoutRow
from app.services.athlete_profile import get_effective_athlete_profile

logger = logging.getLogger(__name__)


def _normalize_segment(segment: Any) -> dict[str, Any]:
    """Normalize a warmup/cooldown/main block to a dict."""
    if isinstance(segment, str):
        return {"duration_min": 0, "zone": "", "description": segment}
    if isinstance(segment, dict):
        return {
            "duration_min": segment.get("duration_min", 0),
            "zone": segment.get("zone", ""),
            "description": segment.get("description", ""),
            **({"repeats": segment.get("repeats")} if segment.get("repeats") is not None else {}),
            **({"rest_min": segment.get("rest_min")} if segment.get("rest_min") is not None else {}),
        }
    return {"duration_min": 0, "zone": "", "description": str(segment)}


def _normalize_main(main: Any) -> list[dict[str, Any]]:
    if isinstance(main, list):
        return [_normalize_segment(item) for item in main]
    if isinstance(main, str):
        return [{"duration_min": 0, "zone": "", "description": main}]
    if isinstance(main, dict):
        return [_normalize_segment(main)]
    return []


def normalize_workout_content(content: Any) -> dict[str, Any]:
    """Normalize content into the structured schema Garmin sync expects."""
    if not isinstance(content, dict):
        return {}
    if content.get("type") == "skipped":
        return dict(content)

    normalized: dict[str, Any] = {}
    if "type" in content:
        normalized["type"] = content["type"]
    if "target_tss" in content:
        normalized["target_tss"] = content["target_tss"]
    if "target_hr_zone" in content:
        normalized["target_hr_zone"] = content["target_hr_zone"]
    if content.get("warmup"):
        normalized["warmup"] = _normalize_segment(content["warmup"])
    if content.get("main"):
        normalized["main"] = _normalize_main(content["main"])
    if content.get("cooldown"):
        normalized["cooldown"] = _normalize_segment(content["cooldown"])
    if "notes" in content:
        normalized["notes"] = str(content["notes"]) if content["notes"] else ""
    return normalized


def has_detailed_workout_content(content: Any) -> bool:
    """Return True when content satisfies the same structural bar as enrichment."""
    normalized = normalize_workout_content(content)
    if not normalized or normalized.get("type") == "skipped":
        return False

    warmup = normalized.get("warmup")
    cooldown = normalized.get("cooldown")
    main = normalized.get("main")

    if not isinstance(warmup, dict) or not isinstance(cooldown, dict) or not isinstance(main, list) or not main:
        return False
    if not normalized.get("type") or "target_tss" not in normalized or "target_hr_zone" not in normalized:
        return False
    if "notes" not in normalized:
        return False

    for segment in [warmup, cooldown, *main]:
        if not isinstance(segment, dict):
            return False
        if segment.get("duration_min") is None or segment.get("zone") is None or not str(segment.get("description") or "").strip():
            return False
    return True


def _profile_context_lines(profile: Any) -> list[str]:
    lines: list[str] = []
    if profile.ftp_watts:
        lines.append(f"FTP: {profile.ftp_watts}W")
    if profile.threshold_pace_sec_per_km:
        mins = int(profile.threshold_pace_sec_per_km // 60)
        secs = int(profile.threshold_pace_sec_per_km % 60)
        lines.append(f"Threshold pace: {mins}:{secs:02d}/km")
    if profile.swim_css_sec_per_100m:
        mins = int(profile.swim_css_sec_per_100m // 60)
        secs = int(profile.swim_css_sec_per_100m % 60)
        lines.append(f"Swim CSS: {mins}:{secs:02d}/100m")
    if profile.max_hr:
        lines.append(f"Max HR: {profile.max_hr}bpm")
    if profile.squat_1rm_kg:
        lines.append(f"Squat 1RM: {profile.squat_1rm_kg}kg")
    if profile.deadlift_1rm_kg:
        lines.append(f"Deadlift 1RM: {profile.deadlift_1rm_kg}kg")
    if profile.bench_1rm_kg:
        lines.append(f"Bench 1RM: {profile.bench_1rm_kg}kg")
    return lines


def _phase_context(plan: TrainingPlanRow, week_number: int) -> tuple[str, str]:
    plan_structure = plan.plan_structure or {}
    phases = plan_structure.get("phases", [])
    current_phase = "Training"
    phase_focus = ""
    for phase in phases:
        if isinstance(phase, dict) and week_number in phase.get("weeks", []):
            current_phase = phase.get("name", "Training")
            phase_focus = phase.get("focus", "")
            break
    return current_phase, phase_focus


def _race_context_lines(plan: TrainingPlanRow) -> list[str]:
    plan_structure = plan.plan_structure or {}
    races = plan_structure.get("races", [])
    lines: list[str] = []
    for race in races:
        if race.get("target_date"):
            lines.append(f"- {race['description']}: {race['target_date']} ({race.get('race_type', '')})")
    return lines


def build_workout_enrichment_prompt(
    *,
    plan: TrainingPlanRow,
    week_number: int,
    workouts: list[WorkoutRow],
    profile: Any,
) -> str:
    current_phase, phase_focus = _phase_context(plan, week_number)
    profile_context = _profile_context_lines(profile)
    athlete_notes = str(getattr(profile, "notes", "") or "").strip()
    race_context = _race_context_lines(plan)

    workout_list = []
    for workout in workouts:
        duration_minutes = (workout.estimated_duration_seconds or 0) // 60
        workout_list.append(
            f'  {{"id": "{workout.id}", "name": "{workout.name}", '
            f'"discipline": "{workout.discipline}", "duration_minutes": {duration_minutes}, '
            f'"estimated_tss": {workout.estimated_tss or 0}}}'
        )

    return f"""Generate detailed, specific, actionable workout programs for each workout below.

CONTEXT:
Plan: {plan.name}
Week {week_number} — {current_phase} phase
Phase focus: {phase_focus}
Athlete thresholds: {', '.join(profile_context) if profile_context else 'No threshold data available'}
Athlete notes: {athlete_notes or 'None'}
Races: {chr(10).join(race_context) if race_context else 'None'}

Workouts to enrich:
[
{chr(10).join(workout_list)}
]

STRICT OUTPUT SCHEMA — every workout MUST follow this exact JSON structure:

{{
  "id": "<copy workout id from above>",
  "description": "<one sentence summary>",
  "content": {{
    "type": "<easy|tempo|intervals|threshold|strength|mobility|recovery>",
    "target_tss": <number>,
    "target_hr_zone": "<Z1|Z2|Z3|Z4|Z5|N/A>",
    "warmup": {{
      "duration_min": <number>,
      "zone": "<zone string>",
      "description": "<specific warmup instructions>"
    }},
    "main": [
      {{
        "duration_min": <number>,
        "zone": "<zone string>",
        "description": "<specific exercise or interval description>"
      }}
    ],
    "cooldown": {{
      "duration_min": <number>,
      "zone": "<zone string>",
      "description": "<specific cooldown instructions>"
    }},
    "notes": "<coaching cues and rationale>"
  }}
}}

MANDATORY FORMAT RULES:
- "warmup" MUST be an object with duration_min, zone, description. NEVER a string.
- "main" MUST be an array of objects. NEVER a string, NEVER a single object. Always an array.
- "cooldown" MUST be an object with duration_min, zone, description. NEVER a string.
- Each main set entry MUST have duration_min (number), zone (string), description (string).
- Every field must be present. No nulls, no omissions.
- Treat athlete notes as real constraints. If notes mention pain, injury, or
  movement limits, adjust exercise selection, load, and intensity accordingly.

CONTENT QUALITY RULES:

STRENGTH — name specific exercises with sets, reps, load, rest:
  main: [
    {{"duration_min": 10, "zone": "Strength", "description": "3x8 Back Squat @ 70% 1RM, 90s rest"}},
    {{"duration_min": 10, "zone": "Strength", "description": "3x8 Romanian Deadlift @ 65% 1RM, 90s rest"}},
    {{"duration_min": 8, "zone": "Strength", "description": "3x10 DB Shoulder Press, moderate load, 60s rest"}}
  ]
  NEVER write "Core & legs focus" or "Upper body work". Always name the exercise.

RUN — specify pace, distance, or intervals:
  main: [
    {{"duration_min": 30, "zone": "Z2", "description": "Steady run at 5:30-5:45/km, conversational pace"}},
    {{"duration_min": 8, "zone": "Z4", "description": "6x20s strides at 4:15/km with 40s walk recovery"}}
  ]

RIDE — specify power or HR targets:
  main: [{{"duration_min": 45, "zone": "Z2", "description": "Steady endurance ride at 65-75% FTP (150-175W)"}}]

SWIM — specify distances and intervals:
  main: [{{"duration_min": 20, "zone": "Z3", "description": "8x100m @ CSS pace (1:45/100m), 15s rest"}}]

YOGA/MOBILITY — name specific poses/stretches with hold times:
  main: [{{"duration_min": 5, "zone": "Stretch", "description": "Pigeon pose 90s each side, lizard pose 60s each side"}}]

Return a JSON array. Valid JSON only, no markdown fences, no text outside the array.
"""


async def generate_workout_enrichments(
    *,
    plan: TrainingPlanRow,
    week_number: int,
    workouts: list[WorkoutRow],
    user_id: str,
    sb: AsyncClient,
) -> dict[str, dict[str, Any]]:
    """Generate normalized structured content for workouts."""
    if not workouts:
        return {}
    if not settings.openai_api_key:
        raise RuntimeError("AI enrichment is temporarily unavailable")

    profile = await get_effective_athlete_profile(user_id, sb)
    prompt = build_workout_enrichment_prompt(
        plan=plan,
        week_number=week_number,
        workouts=workouts,
        profile=profile,
    )

    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.responses.create(
            model=settings.openai_coach_model,
            input=prompt,
            max_output_tokens=16000,
        )
        ai_text = response.output_text.strip()
        if ai_text.startswith("```"):
            first_newline = ai_text.index("\n")
            ai_text = ai_text[first_newline + 1:]
        if ai_text.endswith("```"):
            ai_text = ai_text[:-3]
        enrichments = json.loads(ai_text.strip())
        if not isinstance(enrichments, list):
            enrichments = [enrichments]
    except Exception as exc:
        logger.error("AI workout enrichment failed: %s", exc)
        raise RuntimeError("AI enrichment failed. Try again.") from exc

    output: dict[str, dict[str, Any]] = {}
    for enrichment in enrichments:
        if not isinstance(enrichment, dict) or "id" not in enrichment:
            continue
        workout_id = str(enrichment["id"])
        output[workout_id] = {
            "description": enrichment.get("description"),
            "content": normalize_workout_content(enrichment.get("content")),
        }
    return output
