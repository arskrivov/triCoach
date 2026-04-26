"""AI-powered training plan generation service.

Generates periodized multi-sport training plans using OpenAI, based on
athlete profile, fitness data, health metrics, and goal parameters.
Automatically syncs generated workouts to Garmin Connect.
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
from app.models import ActivityRow, DailyHealthRow, GoalRow
from app.services.athlete_profile import get_effective_athlete_profile
from app.services.fitness import get_fitness_timeline
from app.services.garmin_workout_sync import sync_workouts_batch_to_garmin

logger = logging.getLogger(__name__)

VALID_DISCIPLINES = {"SWIM", "RUN", "RIDE_ROAD", "RIDE_GRAVEL", "STRENGTH", "YOGA", "MOBILITY"}

DEFAULT_PLAN_WEEKS = 12

# ---------------------------------------------------------------------------
# System prompt for AI plan generation
# ---------------------------------------------------------------------------

PLAN_GENERATION_SYSTEM_PROMPT = """\
You are an elite endurance coach and exercise physiologist specialising in \
triathlon (swim/bike/run), strength training, and mobility. You design \
periodized training plans grounded in evidence-based principles — zone 2 \
aerobic base building, HRV-guided intensity modulation, and periodisation \
informed by current sports science.

YOUR TASK: Generate a structured, week-by-week training plan as JSON.
The plan must cover the athlete's ENTIRE race season — all races listed in \
the context. Build periodization blocks around each race date with \
appropriate taper and recovery weeks. For multiple races, use a "rolling \
periodization" approach where you build toward each race, taper, race, \
recover, then build toward the next one.

PERIODIZATION PRINCIPLES:
- Base phase: aerobic foundation, technique work, gradual volume increase. \
Lower intensity, higher proportion of Z1-Z2 work.
- Build phase: race-specific intensity, threshold and VO2max work, brick \
sessions for triathlon. Progressive overload.
- Peak phase: race simulation, sharpening, highest intensity sessions. \
Volume starts to taper slightly.
- Taper phase: volume reduction (40-60% of peak), maintain intensity, \
maximise freshness for race day.

RECOVERY WEEKS:
- Insert a recovery week every 3-4 load weeks.
- Recovery weeks reduce volume by 30-50% compared to the preceding load week.
- Maintain some intensity during recovery weeks but reduce total stress.

DISCIPLINE DISTRIBUTION:
- Distribute weekly hours across disciplines based on the race type.
- Always include strength (2x/week) and mobility (1-2x/week).
- For triathlon goals, include brick workouts (bike→run) in Build/Peak phases.

WORKOUT STRUCTURE:
Each workout must include structured content with warmup, main set, cooldown, \
target zones, estimated TSS, and coaching notes. Use the athlete's threshold \
values to set appropriate zones. Keep descriptions concise (1 short sentence).

VALID DISCIPLINES: SWIM, RUN, RIDE_ROAD, RIDE_GRAVEL, STRENGTH, YOGA, MOBILITY

OUTPUT FORMAT — valid JSON only, no markdown fences, no prose outside JSON.
{
  "plan_name": "Descriptive Plan Name — N Weeks",
  "phases": [
    {
      "name": "Base",
      "weeks": [1, 2, 3, ...],
      "focus": "Aerobic foundation, technique",
      "weekly_tss_range": [200, 350]
    }
  ],
  "weekly_hours_distribution": {
    "swim": 0.15,
    "bike": 0.35,
    "run": 0.30,
    "strength": 0.12,
    "mobility": 0.08
  },
  "recovery_week_pattern": [3, 1],
  "weeks": [
    {
      "week_number": 1,
      "phase": "Base",
      "target_tss": 250,
      "workouts": [
        {
          "day": 0,
          "discipline": "RUN",
          "name": "Easy Aerobic Run",
          "builder_type": "endurance",
          "duration_minutes": 45,
          "estimated_tss": 35,
          "content": {
            "type": "easy",
            "warmup": {"duration_min": 5, "zone": "Z1", "description": "Easy jog"},
            "main": [{"duration_min": 35, "zone": "Z2", "description": "Steady Z2"}],
            "cooldown": {"duration_min": 5, "zone": "Z1", "description": "Walk"},
            "target_tss": 35,
            "target_hr_zone": "Z2",
            "notes": "Conversational pace"
          },
          "description": "Easy aerobic run."
        }
      ]
    }
  ]
}

RULES:
- Weekly workout durations must not exceed the weekly_hours_budget by more \
than 10%.
- If the goal has a target_date, the plan end_date must be within 7 days of \
that date.
- If no target_date, generate a 12-week progressive plan.
- If the athlete has no fitness data, generate a conservative beginner plan.
- Day values: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, \
5=Saturday, 6=Sunday.
- Every workout must have a valid discipline from the list above.
- Include rest days (days with no workouts) as appropriate.
- You MUST generate ALL weeks from week 1 through the final race week. \
Do NOT truncate or stop early.
- Keep ALL text fields SHORT: descriptions ≤ 8 words, notes ≤ 10 words. \
This is critical to fit the full plan in the output.
"""


def _fmt_pace(sec_per_km: float | None) -> str:
    """Format pace as min:sec/km."""
    if not sec_per_km:
        return "unknown"
    m, s = divmod(int(sec_per_km), 60)
    return f"{m}:{s:02d}/km"


def _fmt_swim_pace(sec_per_100m: float | None) -> str:
    """Format swim pace as min:sec/100m."""
    if not sec_per_100m:
        return "unknown"
    m, s = divmod(int(sec_per_100m), 60)
    return f"{m}:{s:02d}/100m"


async def build_plan_context(user_id: str, goal: GoalRow, sb: AsyncClient, all_races: list[GoalRow] | None = None) -> str:
    """Assemble athlete data into a structured prompt for AI plan generation.

    Gathers athlete profile, 7-week fitness timeline (CTL/ATL/TSB),
    7-week health data, recent activities, and all race details.
    """
    profile = await get_effective_athlete_profile(user_id, sb)

    # 7-week fitness timeline
    fitness_timeline = await get_fitness_timeline(user_id, sb, days=49)

    # 7-week health data
    seven_weeks_ago = (date.today() - timedelta(days=49)).isoformat()
    health_res = await sb.table("daily_health").select("*").eq(
        "user_id", user_id
    ).gte("date", seven_weeks_ago).order("date", desc=False).execute()
    health_rows = [DailyHealthRow(**r) for r in (health_res.data or [])]

    # Recent activities (7 weeks)
    acts_start = (
        datetime.combine(date.today() - timedelta(days=49), datetime.min.time(), tzinfo=timezone.utc)
    ).isoformat()
    acts_res = await sb.table("activities").select(
        "discipline,name,start_time,duration_seconds,distance_meters,tss,avg_hr,avg_pace_sec_per_km,avg_power_watts"
    ).eq("user_id", user_id).gte("start_time", acts_start).order(
        "start_time", desc=False
    ).execute()
    activities = [ActivityRow(**r) for r in (acts_res.data or [])]

    # Current fitness snapshot
    current_fitness = fitness_timeline[-1] if fitness_timeline else None

    # --- Build structured prompt text ---
    sections: list[str] = []

    # Athlete profile
    profile_lines = ["## Athlete Profile"]
    if profile.ftp_watts:
        profile_lines.append(f"- FTP: {profile.ftp_watts} W")
    if profile.threshold_pace_sec_per_km:
        profile_lines.append(f"- Threshold pace: {_fmt_pace(profile.threshold_pace_sec_per_km)}")
    if profile.swim_css_sec_per_100m:
        profile_lines.append(f"- Swim CSS: {_fmt_swim_pace(profile.swim_css_sec_per_100m)}")
    if profile.max_hr:
        profile_lines.append(f"- Max HR: {profile.max_hr} bpm")
    if profile.resting_hr:
        profile_lines.append(f"- Resting HR: {profile.resting_hr} bpm")
    if profile.weight_kg:
        profile_lines.append(f"- Weight: {profile.weight_kg} kg")
    if profile.squat_1rm_kg:
        profile_lines.append(f"- Squat 1RM: {profile.squat_1rm_kg} kg")
    if profile.deadlift_1rm_kg:
        profile_lines.append(f"- Deadlift 1RM: {profile.deadlift_1rm_kg} kg")
    if profile.bench_1rm_kg:
        profile_lines.append(f"- Bench 1RM: {profile.bench_1rm_kg} kg")
    if profile.overhead_press_1rm_kg:
        profile_lines.append(f"- OHP 1RM: {profile.overhead_press_1rm_kg} kg")
    has_profile_data = any([
        profile.ftp_watts, profile.threshold_pace_sec_per_km,
        profile.swim_css_sec_per_100m, profile.max_hr,
    ])
    if not has_profile_data:
        profile_lines.append("- No threshold data available — generate a conservative beginner plan.")
    sections.append("\n".join(profile_lines))

    # Current fitness
    fitness_lines = ["## Current Fitness"]
    if current_fitness:
        fitness_lines.append(f"- CTL (fitness): {current_fitness.get('ctl', 0)}")
        fitness_lines.append(f"- ATL (fatigue): {current_fitness.get('atl', 0)}")
        fitness_lines.append(f"- TSB (form): {current_fitness.get('tsb', 0)}")
    else:
        fitness_lines.append("- No fitness data available — assume beginner level.")
    sections.append("\n".join(fitness_lines))

    # Fitness timeline (weekly summary)
    if fitness_timeline:
        timeline_lines = ["## 7-Week Fitness Timeline (weekly snapshots)"]
        # Sample one point per week
        step = max(1, len(fitness_timeline) // 7)
        for i in range(0, len(fitness_timeline), step):
            pt = fitness_timeline[i]
            timeline_lines.append(
                f"- {pt['date']}: CTL={pt['ctl']}, ATL={pt['atl']}, TSB={pt['tsb']}"
            )
        sections.append("\n".join(timeline_lines))

    # Health data summary (weekly averages)
    if health_rows:
        health_lines = ["## 7-Week Health Summary"]
        # Group by week
        week_health: dict[str, list[DailyHealthRow]] = {}
        for h in health_rows:
            d = date.fromisoformat(h.date)
            week_start = (d - timedelta(days=d.weekday())).isoformat()
            week_health.setdefault(week_start, []).append(h)
        for week_start in sorted(week_health.keys()):
            rows = week_health[week_start]
            avg_sleep = _safe_avg([r.sleep_score for r in rows if r.sleep_score])
            avg_hrv = _safe_avg([r.hrv_last_night for r in rows if r.hrv_last_night])
            avg_rhr = _safe_avg([r.resting_hr for r in rows if r.resting_hr])
            avg_readiness = _safe_avg([r.morning_readiness_score for r in rows if r.morning_readiness_score])
            health_lines.append(
                f"- Week of {week_start}: "
                f"sleep={avg_sleep:.0f}, HRV={avg_hrv:.0f}ms, "
                f"RHR={avg_rhr:.0f}bpm, readiness={avg_readiness:.0f}"
                if all(v > 0 for v in [avg_sleep, avg_hrv, avg_rhr, avg_readiness])
                else f"- Week of {week_start}: partial data"
            )
        sections.append("\n".join(health_lines))

    # Recent activities summary
    if activities:
        act_lines = ["## Recent Activities (last 7 weeks)"]
        for a in activities[-30:]:  # Cap at 30 most recent
            d = str(a.start_time)[:10]
            dur_min = (a.duration_seconds or 0) // 60
            dist_km = (a.distance_meters or 0) / 1000
            tss = a.tss or 0
            act_lines.append(
                f"- {d} | {a.discipline} | {a.name or ''} | {dur_min}min | "
                f"{dist_km:.1f}km | TSS:{tss:.0f}"
            )
        sections.append("\n".join(act_lines))
    else:
        sections.append("## Recent Activities\nNo recent activities — assume beginner level.")

    # Race season details (all active races)
    races = all_races or [goal]
    goal_lines = ["## Race Season"]
    goal_lines.append(f"Total races: {len(races)}")
    goal_lines.append("Build ONE unified plan covering all races below, with appropriate")
    goal_lines.append("periodization blocks (Base/Build/Peak/Taper) around each race date.")
    goal_lines.append("Include taper + recovery weeks around each race.")
    goal_lines.append("")
    for i, r in enumerate(races, 1):
        goal_lines.append(f"### Race {i}: {r.description}")
        if r.race_type:
            goal_lines.append(f"- Race type: {r.race_type}")
        if r.target_date:
            goal_lines.append(f"- Race date: {r.target_date}")
            days_until = (date.fromisoformat(str(r.target_date)) - date.today()).days
            goal_lines.append(f"- Days until race: {days_until}")
            weeks_until = max(1, days_until // 7)
            goal_lines.append(f"- Weeks until race: {weeks_until}")
        else:
            goal_lines.append("- No race date set")
        if r.sport:
            goal_lines.append(f"- Sport: {r.sport}")
        goal_lines.append(f"- Priority: {'A-race (primary)' if r.priority == 1 else 'B-race (secondary)'}")
        goal_lines.append("")

    # Overall budget
    goal_lines.append(f"Overall weekly hours budget: {profile.weekly_training_hours or 8}h (from athlete profile)")
    sections.append("\n".join(goal_lines))

    return "\n\n".join(sections)


def _safe_avg(values: list) -> float:
    """Compute average of numeric values, returning 0 if empty."""
    nums = [v for v in values if v is not None]
    return sum(nums) / len(nums) if nums else 0.0


def parse_plan_response(ai_text: str) -> dict:
    """Parse AI JSON response with fallback handling for malformed output.

    Attempts to parse the full JSON. If that fails, tries to extract
    a JSON object from the text. Validates required fields and fills
    gaps with defaults.
    """
    plan_data: dict | None = None

    # Try direct parse
    try:
        plan_data = json.loads(ai_text)
    except json.JSONDecodeError:
        pass

    # Fallback: try to extract JSON from markdown fences or surrounding text
    if plan_data is None:
        try:
            # Strip markdown code fences
            cleaned = ai_text.strip()
            if cleaned.startswith("```"):
                # Remove opening fence (possibly with language tag)
                first_newline = cleaned.index("\n")
                cleaned = cleaned[first_newline + 1:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            plan_data = json.loads(cleaned.strip())
        except (json.JSONDecodeError, ValueError):
            pass

    # Fallback: find first { and last } to extract JSON object
    if plan_data is None:
        try:
            start = ai_text.index("{")
            end = ai_text.rindex("}") + 1
            plan_data = json.loads(ai_text[start:end])
        except (ValueError, json.JSONDecodeError):
            logger.warning("Failed to parse AI plan response, using empty structure")
            plan_data = {}

    if not isinstance(plan_data, dict):
        logger.warning("AI plan response is not a dict, using empty structure")
        plan_data = {}

    # Validate and fill defaults
    if "plan_name" not in plan_data:
        plan_data["plan_name"] = "Training Plan"

    if "phases" not in plan_data or not isinstance(plan_data["phases"], list):
        plan_data["phases"] = []

    if "weekly_hours_distribution" not in plan_data or not isinstance(
        plan_data["weekly_hours_distribution"], dict
    ):
        plan_data["weekly_hours_distribution"] = {
            "swim": 0.15, "bike": 0.35, "run": 0.30,
            "strength": 0.12, "mobility": 0.08,
        }

    if "recovery_week_pattern" not in plan_data or not isinstance(
        plan_data["recovery_week_pattern"], list
    ):
        plan_data["recovery_week_pattern"] = [3, 1]

    if "weeks" not in plan_data or not isinstance(plan_data["weeks"], list):
        plan_data["weeks"] = []

    # Validate workouts within weeks
    for week in plan_data["weeks"]:
        if not isinstance(week, dict):
            continue
        if "week_number" not in week:
            week["week_number"] = 1
        if "phase" not in week:
            week["phase"] = "Base"
        if "target_tss" not in week:
            week["target_tss"] = 200
        if "workouts" not in week or not isinstance(week["workouts"], list):
            week["workouts"] = []

        for workout in week["workouts"]:
            if not isinstance(workout, dict):
                continue
            # Ensure valid discipline
            if workout.get("discipline") not in VALID_DISCIPLINES:
                # Try to map common AI outputs
                disc = str(workout.get("discipline", "")).upper()
                if "BIKE" in disc or "CYCLE" in disc or "CYCLING" in disc:
                    workout["discipline"] = "RIDE_ROAD"
                elif "YOGA" in disc:
                    workout["discipline"] = "YOGA"
                elif disc in VALID_DISCIPLINES:
                    workout["discipline"] = disc
                else:
                    workout["discipline"] = "RUN"
                    logger.warning(
                        "Unknown discipline '%s' in AI response, defaulting to RUN",
                        workout.get("discipline"),
                    )
            # Ensure required fields
            if "day" not in workout:
                workout["day"] = 0
            if "name" not in workout:
                workout["name"] = f"{workout['discipline']} Workout"
            if "builder_type" not in workout:
                workout["builder_type"] = "endurance"
            if "duration_minutes" not in workout:
                workout["duration_minutes"] = 30
            if "estimated_tss" not in workout:
                workout["estimated_tss"] = 30
            if "content" not in workout or not isinstance(workout["content"], dict):
                workout["content"] = {
                    "type": "easy",
                    "warmup": {"duration_min": 5, "zone": "Z1", "description": "Easy warmup"},
                    "main": [{"duration_min": 20, "zone": "Z2", "description": "Main set"}],
                    "cooldown": {"duration_min": 5, "zone": "Z1", "description": "Cooldown"},
                    "target_tss": workout.get("estimated_tss", 30),
                    "notes": "",
                }
            if "description" not in workout:
                workout["description"] = workout["name"]

    return plan_data


async def generate_plan(user_id: str, goal_id: str | None, sb: AsyncClient) -> dict:
    """Generate a full training plan covering all active races using OpenAI.

    Single-call generation using gpt-4.1-mini (100K output token limit).

    Returns dict with 'plan' and 'workouts' keys.
    """
    print(f"[PLAN-GEN] Starting plan generation for user={user_id}, goal_id={goal_id}")
    print(f"[PLAN-GEN] Using model: {settings.openai_coach_model}")

    # 1. Fetch all active races
    races_res = await sb.table("goals").select("*").eq(
        "user_id", user_id
    ).eq("is_active", True).order("target_date", desc=False).execute()

    all_races = [GoalRow(**r) for r in (races_res.data or [])]
    if not all_races:
        raise HTTPException(status_code=404, detail="No active races found. Add a race first.")

    # Fetch athlete profile
    profile = await get_effective_athlete_profile(user_id, sb)

    # Determine primary race
    primary_race = all_races[0]
    if goal_id:
        for r in all_races:
            if r.id == goal_id:
                primary_race = r
                break

    # 2. Build context with ALL races
    context = await build_plan_context(user_id, primary_race, sb, all_races=all_races)

    # 3. Call OpenAI
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="Plan generation is temporarily unavailable",
        )

    # Compute expected season length
    today = date.today()
    days_until_monday = (7 - today.weekday()) % 7
    start_date = today + timedelta(days=days_until_monday)

    race_dates = [
        date.fromisoformat(str(r.target_date))
        for r in all_races
        if r.target_date
    ]
    expected_weeks = max(1, (max(race_dates) - start_date).days // 7 + 1) if race_dates else DEFAULT_PLAN_WEEKS
    print(f"[PLAN-GEN] Races: {len(all_races)}, expected_weeks={expected_weeks}, start={start_date}")
    for r in all_races:
        print(f"[PLAN-GEN]   Race: {r.description} on {r.target_date} (priority={r.priority})")

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key)

        generation_prompt = (
            f"{context}\n\n"
            f"IMPORTANT: The season is {expected_weeks} weeks long. "
            f"Generate the FULL plan with ALL {expected_weeks} weeks of workouts. "
            f"Keep descriptions very short (≤ 5 words each) to fit everything."
        )

        print(f"[PLAN-GEN] Calling OpenAI...")
        response = client.responses.create(
            model=settings.openai_coach_model,
            instructions=PLAN_GENERATION_SYSTEM_PROMPT,
            input=generation_prompt,
            max_output_tokens=50000,
        )
        ai_text = response.output_text.strip()
        print(f"[PLAN-GEN] Response: {len(ai_text)} chars")

        if ai_text and not ai_text.rstrip().endswith("}"):
            print(f"[PLAN-GEN] WARNING: Response may be truncated")

        plan_data = parse_plan_response(ai_text)
        generated_weeks = len(plan_data.get("weeks", []))
        print(f"[PLAN-GEN] Parsed {generated_weeks}/{expected_weeks} weeks")

    except Exception as exc:
        print(f"[PLAN-GEN] ERROR: {type(exc).__name__}: {exc}")
        logger.error("OpenAI plan generation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=503,
            detail="Plan generation is temporarily unavailable",
        ) from exc

    # 4. Compute plan dates
    total_weeks = len(plan_data.get("weeks", []))
    if total_weeks == 0:
        total_weeks = DEFAULT_PLAN_WEEKS

    if race_dates:
        end_date = max(race_dates)
    else:
        end_date = start_date + timedelta(weeks=total_weeks) - timedelta(days=1)

    weekly_hours = profile.weekly_training_hours or 8.0

    # Build plan_structure JSONB
    plan_structure = {
        "total_weeks": total_weeks,
        "phases": plan_data.get("phases", []),
        "weekly_hours_distribution": plan_data.get("weekly_hours_distribution", {}),
        "recovery_week_pattern": plan_data.get("recovery_week_pattern", [3, 1]),
        "races": [
            {
                "goal_id": r.id,
                "description": r.description,
                "race_type": r.race_type,
                "target_date": str(r.target_date) if r.target_date else None,
                "priority": r.priority,
            }
            for r in all_races
        ],
    }

    race_names = [r.description for r in all_races[:3]]
    plan_name = plan_data.get("plan_name") or " + ".join(race_names) + " Season Plan"

    # 5. Archive any existing active plans
    await sb.table("training_plans").update(
        {"status": "archived"}
    ).eq("user_id", user_id).eq("status", "active").execute()

    # 6. Create training_plans row
    plan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    plan_row = {
        "id": plan_id,
        "user_id": user_id,
        "goal_id": primary_race.id,
        "name": plan_name,
        "status": "active",
        "race_date": str(primary_race.target_date) if primary_race.target_date else None,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "weekly_hours": weekly_hours,
        "plan_structure": plan_structure,
        "adjustments": [],
        "created_at": now,
        "updated_at": now,
    }
    plan_res = await sb.table("training_plans").insert(plan_row).execute()
    created_plan = plan_res.data[0] if plan_res.data else plan_row

    # 7. Create workout rows for each session
    workout_rows: list[dict] = []
    for week in plan_data.get("weeks", []):
        if not isinstance(week, dict):
            continue
        week_number = week.get("week_number", 1)
        week_start = start_date + timedelta(weeks=week_number - 1)

        for workout in week.get("workouts", []):
            if not isinstance(workout, dict):
                continue
            day_offset = workout.get("day", 0)
            scheduled = week_start + timedelta(days=day_offset)
            duration_minutes = workout.get("duration_minutes", 30)

            workout_id = str(uuid.uuid4())
            workout_row = {
                "id": workout_id,
                "user_id": user_id,
                "name": workout.get("name", "Workout"),
                "discipline": workout.get("discipline", "RUN"),
                "builder_type": workout.get("builder_type", "endurance"),
                "description": workout.get("description"),
                "content": workout.get("content", {}),
                "estimated_duration_seconds": duration_minutes * 60,
                "estimated_tss": workout.get("estimated_tss"),
                "is_template": False,
                "scheduled_date": scheduled.isoformat(),
                "plan_id": plan_id,
                "plan_week": week_number,
                "plan_day": day_offset,
                "created_at": now,
                "updated_at": now,
            }
            workout_rows.append(workout_row)

    # Batch insert workouts
    created_workouts: list[dict] = []
    if workout_rows:
        for i in range(0, len(workout_rows), 50):
            batch = workout_rows[i : i + 50]
            res = await sb.table("workouts").insert(batch).execute()
            created_workouts.extend(res.data or batch)

    print(f"[PLAN-GEN] SUCCESS: {plan_name} — {total_weeks} weeks, {len(created_workouts)} workouts")

    # Auto-sync upcoming workouts to Garmin (next 14 days)
    upcoming_workout_ids = [
        w["id"] for w in created_workouts
        if w.get("scheduled_date") and date.fromisoformat(w["scheduled_date"]) >= date.today()
        and date.fromisoformat(w["scheduled_date"]) <= date.today() + timedelta(days=14)
    ]
    if upcoming_workout_ids:
        try:
            await sync_workouts_batch_to_garmin(upcoming_workout_ids, user_id, sb)
            logger.info("Auto-synced %d workouts to Garmin", len(upcoming_workout_ids))
        except Exception as exc:
            logger.warning("Garmin auto-sync failed: %s", exc)

    return {"plan": created_plan, "workouts": created_workouts}
    # 1. Fetch all active races
    races_res = await sb.table("goals").select("*").eq(
        "user_id", user_id
    ).eq("is_active", True).order("target_date", desc=False).execute()

    all_races = [GoalRow(**r) for r in (races_res.data or [])]
    if not all_races:
        raise HTTPException(status_code=404, detail="No active races found. Add a race first.")

    # Fetch athlete profile for weekly training hours
    profile = await get_effective_athlete_profile(user_id, sb)

    # Determine primary race
    primary_race = all_races[0]
    if goal_id:
        for r in all_races:
            if r.id == goal_id:
                primary_race = r
                break

    # 2. Build context with ALL races
    context = await build_plan_context(user_id, primary_race, sb, all_races=all_races)

    # 3. Call OpenAI
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="Plan generation is temporarily unavailable",
        )

    # Compute expected season length
    today = date.today()
    days_until_monday = (7 - today.weekday()) % 7
    start_date = today + timedelta(days=days_until_monday)

    race_dates = [
        date.fromisoformat(str(r.target_date))
        for r in all_races
        if r.target_date
    ]
    expected_weeks = max(1, (max(race_dates) - start_date).days // 7 + 1) if race_dates else DEFAULT_PLAN_WEEKS
    print(f"[PLAN-GEN] Races: {len(all_races)}, expected_weeks={expected_weeks}, start={start_date}")
    for r in all_races:
        print(f"[PLAN-GEN]   Race: {r.description} on {r.target_date} (priority={r.priority})")

    # For short plans (≤8 weeks), generate everything in one call
    # For longer plans, use batch generation
    BATCH_THRESHOLD = 8
    BATCH_SIZE = 4

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key)

        if expected_weeks <= BATCH_THRESHOLD:
            # Single-call generation
            print(f"[PLAN-GEN] Single-call mode, {expected_weeks} weeks")
            logger.info("Generating plan: single-call mode, %d weeks, model=%s", expected_weeks, settings.openai_coach_model)
            response = client.responses.create(
                model=settings.openai_coach_model,
                instructions=PLAN_GENERATION_SYSTEM_PROMPT,
                input=context,
                max_output_tokens=50000,
            )
            ai_text = response.output_text.strip()
            print(f"[PLAN-GEN] Single-call response: {len(ai_text)} chars")
            logger.info("AI response length: %d chars", len(ai_text))
            if ai_text and not ai_text.rstrip().endswith("}"):
                logger.warning(
                    "AI plan response may be truncated (length=%d)",
                    len(ai_text),
                )
            plan_data = parse_plan_response(ai_text)
        else:
            # Batch generation: first get the structure, then fill weeks
            print(f"[PLAN-GEN] Batch mode, {expected_weeks} expected weeks")
            logger.info("Generating plan: batch mode, %d expected weeks, model=%s", expected_weeks, settings.openai_coach_model)
            structure_prompt = (
                f"{context}\n\n"
                f"IMPORTANT: The season is {expected_weeks} weeks long. "
                f"Generate the FULL plan with ALL {expected_weeks} weeks of workouts. "
                f"Keep descriptions very short (≤ 5 words each) to fit everything."
            )
            response = client.responses.create(
                model=settings.openai_coach_model,
                instructions=PLAN_GENERATION_SYSTEM_PROMPT,
                input=structure_prompt,
                max_output_tokens=50000,
            )
            ai_text = response.output_text.strip()
            plan_data = parse_plan_response(ai_text)

            generated_weeks = len(plan_data.get("weeks", []))
            logger.info(
                "Initial generation produced %d/%d weeks",
                generated_weeks, expected_weeks,
            )

            # If we got fewer weeks than expected, generate the missing ones in batches
            if generated_weeks < expected_weeks:
                phases_summary = json.dumps(plan_data.get("phases", []))
                hours_dist = json.dumps(plan_data.get("weekly_hours_distribution", {}))

                for batch_start in range(generated_weeks + 1, expected_weeks + 1, BATCH_SIZE):
                    batch_end = min(batch_start + BATCH_SIZE - 1, expected_weeks)
                    batch_prompt = (
                        f"Generate workouts for weeks {batch_start} through {batch_end} "
                        f"of a {expected_weeks}-week training plan.\n\n"
                        f"Plan phases: {phases_summary}\n"
                        f"Discipline distribution: {hours_dist}\n"
                        f"Weekly hours budget: {profile.weekly_training_hours or 8}h\n\n"
                        f"Race season:\n"
                    )
                    for r in all_races:
                        batch_prompt += f"- {r.description}: {r.target_date} ({r.race_type}, priority {r.priority})\n"

                    batch_prompt += (
                        f"\nPlan starts on {start_date}. "
                        f"Week {batch_start} starts on {start_date + timedelta(weeks=batch_start - 1)}.\n"
                        f"Keep descriptions ≤ 5 words. Include 5-7 workouts per week."
                    )

                    # Add athlete thresholds for zone calculation
                    if profile.ftp_watts:
                        batch_prompt += f"\nFTP: {profile.ftp_watts}W"
                    if profile.threshold_pace_sec_per_km:
                        batch_prompt += f"\nThreshold pace: {_fmt_pace(profile.threshold_pace_sec_per_km)}"

                    try:
                        batch_response = client.responses.create(
                            model=settings.openai_coach_model,
                            instructions=BATCH_GENERATION_SYSTEM_PROMPT,
                            input=batch_prompt,
                            max_output_tokens=32000,
                        )
                        batch_text = batch_response.output_text.strip()
                        batch_data = parse_plan_response(batch_text)
                        batch_weeks = batch_data.get("weeks", [])
                        if batch_weeks:
                            plan_data["weeks"].extend(batch_weeks)
                            logger.info(
                                "Batch generated %d weeks (%d-%d), total now %d",
                                len(batch_weeks), batch_start, batch_end,
                                len(plan_data["weeks"]),
                            )
                    except Exception as batch_exc:
                        logger.error(
                            "Batch generation failed for weeks %d-%d: %s",
                            batch_start, batch_end, batch_exc,
                        )
                        # Continue with what we have rather than failing entirely
                        break

    except Exception as exc:
        print(f"[PLAN-GEN] ERROR: {type(exc).__name__}: {exc}")
        logger.error("OpenAI plan generation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=503,
            detail="Plan generation is temporarily unavailable",
        ) from exc

    # 4. Compute plan dates
    total_weeks = len(plan_data.get("weeks", []))
    if total_weeks == 0:
        total_weeks = DEFAULT_PLAN_WEEKS

    if race_dates:
        end_date = max(race_dates)
        if total_weeks < expected_weeks:
            logger.warning(
                "AI generated %d weeks but season requires ~%d weeks "
                "(start=%s, last_race=%s).",
                total_weeks, expected_weeks, start_date, end_date,
            )
    else:
        end_date = start_date + timedelta(weeks=total_weeks) - timedelta(days=1)

    # Weekly hours = from athlete profile, or 8h default
    weekly_hours = profile.weekly_training_hours or 8.0

    # Build plan_structure JSONB
    plan_structure = {
        "total_weeks": total_weeks,
        "phases": plan_data.get("phases", []),
        "weekly_hours_distribution": plan_data.get("weekly_hours_distribution", {}),
        "recovery_week_pattern": plan_data.get("recovery_week_pattern", [3, 1]),
        "races": [
            {
                "goal_id": r.id,
                "description": r.description,
                "race_type": r.race_type,
                "target_date": str(r.target_date) if r.target_date else None,
                "priority": r.priority,
            }
            for r in all_races
        ],
    }

    # Build plan name from races
    race_names = [r.description for r in all_races[:3]]
    plan_name = plan_data.get("plan_name") or " + ".join(race_names) + " Season Plan"

    # 5. Archive any existing active plans
    await sb.table("training_plans").update(
        {"status": "archived"}
    ).eq("user_id", user_id).eq("status", "active").execute()

    # 6. Create training_plans row
    plan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    plan_row = {
        "id": plan_id,
        "user_id": user_id,
        "goal_id": primary_race.id,
        "name": plan_name,
        "status": "active",
        "race_date": str(primary_race.target_date) if primary_race.target_date else None,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "weekly_hours": weekly_hours,
        "plan_structure": plan_structure,
        "adjustments": [],
        "created_at": now,
        "updated_at": now,
    }
    plan_res = await sb.table("training_plans").insert(plan_row).execute()
    created_plan = plan_res.data[0] if plan_res.data else plan_row

    # 7. Create workout rows for each session
    workout_rows: list[dict] = []
    for week in plan_data.get("weeks", []):
        if not isinstance(week, dict):
            continue
        week_number = week.get("week_number", 1)
        week_start = start_date + timedelta(weeks=week_number - 1)

        for workout in week.get("workouts", []):
            if not isinstance(workout, dict):
                continue
            day_offset = workout.get("day", 0)
            scheduled = week_start + timedelta(days=day_offset)
            duration_minutes = workout.get("duration_minutes", 30)

            workout_id = str(uuid.uuid4())
            workout_row = {
                "id": workout_id,
                "user_id": user_id,
                "name": workout.get("name", "Workout"),
                "discipline": workout.get("discipline", "RUN"),
                "builder_type": workout.get("builder_type", "endurance"),
                "description": workout.get("description"),
                "content": workout.get("content", {}),
                "estimated_duration_seconds": duration_minutes * 60,
                "estimated_tss": workout.get("estimated_tss"),
                "is_template": False,
                "scheduled_date": scheduled.isoformat(),
                "plan_id": plan_id,
                "plan_week": week_number,
                "plan_day": day_offset,
                "created_at": now,
                "updated_at": now,
            }
            workout_rows.append(workout_row)

    # Batch insert workouts
    created_workouts: list[dict] = []
    if workout_rows:
        for i in range(0, len(workout_rows), 50):
            batch = workout_rows[i : i + 50]
            res = await sb.table("workouts").insert(batch).execute()
            created_workouts.extend(res.data or batch)

    logger.info(
        "Plan generated: %s — %d weeks, %d workouts",
        plan_name, total_weeks, len(created_workouts),
    )
    print(f"[PLAN-GEN] SUCCESS: {plan_name} — {total_weeks} weeks, {len(created_workouts)} workouts")

    # Auto-sync upcoming workouts to Garmin (next 14 days)
    upcoming_workout_ids = [
        w["id"] for w in created_workouts
        if w.get("scheduled_date") and date.fromisoformat(w["scheduled_date"]) >= date.today()
        and date.fromisoformat(w["scheduled_date"]) <= date.today() + timedelta(days=14)
    ]
    if upcoming_workout_ids:
        try:
            await sync_workouts_batch_to_garmin(upcoming_workout_ids, user_id, sb)
            logger.info("Auto-synced %d workouts to Garmin", len(upcoming_workout_ids))
        except Exception as exc:
            logger.warning("Garmin auto-sync failed: %s", exc)

    return {"plan": created_plan, "workouts": created_workouts}
