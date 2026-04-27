"""Build the coaching context text for the AI coach system prompt."""

from datetime import date, datetime, time, timedelta, timezone

from supabase import AsyncClient

from app.models import ActivityRow, DailyHealthRow, GoalRow, TrainingPlanRow, WorkoutRow
from app.services.athlete_profile import get_effective_athlete_profile
from app.services.workout_matching import match_workouts_to_activities


def _fmt_pace(sec_per_km: float | None) -> str:
    if not sec_per_km:
        return "unknown"
    m, s = divmod(int(sec_per_km), 60)
    return f"{m}:{s:02d}/km"


def _fmt_swim_pace(sec_per_100m: float | None) -> str:
    if not sec_per_100m:
        return "unknown"
    m, s = divmod(int(sec_per_100m), 60)
    return f"{m}:{s:02d}/100m"


def _fmt_dur(seconds: int | None) -> str:
    if not seconds:
        return "0 min"
    h, rem = divmod(seconds, 3600)
    m = rem // 60
    return f"{h}h {m}min" if h else f"{m} min"


def _day_name(day_num: int) -> str:
    """Convert day number (0=Monday) to name."""
    names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    return names[day_num] if 0 <= day_num <= 6 else f"Day {day_num}"


async def _build_active_plan_section(user_id: str, sb: AsyncClient, today: date) -> str | None:
    """Build context section for the user's active training plan, if one exists.

    Returns formatted text or None if no active plan.
    """
    plan_res = await sb.table("training_plans").select("*").eq(
        "user_id", user_id
    ).eq("status", "active").limit(1).execute()

    if not plan_res.data:
        return None

    plan = TrainingPlanRow(**plan_res.data[0])

    # Calculate current week number
    plan_start = date.fromisoformat(str(plan.start_date))
    days_elapsed = (today - plan_start).days
    current_week = max(1, (days_elapsed // 7) + 1)

    # Determine total weeks and current phase from plan_structure
    plan_structure = plan.plan_structure or {}
    total_weeks = plan_structure.get("total_weeks", 0)
    if not total_weeks and plan.end_date:
        plan_end = date.fromisoformat(str(plan.end_date))
        total_weeks = max(1, ((plan_end - plan_start).days // 7) + 1)

    current_phase = "Unknown"
    phases = plan_structure.get("phases", [])
    for phase in phases:
        if isinstance(phase, dict):
            phase_weeks = phase.get("weeks", [])
            if current_week in phase_weeks:
                current_phase = phase.get("name", "Unknown")
                break

    # Fetch this week's workouts
    workouts_res = await sb.table("workouts").select("*").eq(
        "plan_id", plan.id
    ).eq("user_id", user_id).eq(
        "plan_week", current_week
    ).order("plan_day", desc=False).execute()
    workouts = [WorkoutRow(**w) for w in (workouts_res.data or [])]

    # Calculate simple compliance: completed vs total scheduled workouts up to today
    today_weekday = today.weekday()

    # Calculate this week's date range (Mon–Sun)
    week_start = plan_start + timedelta(weeks=current_week - 1)
    week_end = week_start + timedelta(days=6)
    activity_range_end = min(week_end, today) + timedelta(days=1)
    activities_res = await sb.table("activities").select("*").eq(
        "user_id", user_id
    ).gte(
        "start_time", (week_start - timedelta(days=1)).isoformat()
    ).lte(
        "start_time", activity_range_end.isoformat() + "T23:59:59Z"
    ).order("start_time", desc=False).execute()
    workout_matches = match_workouts_to_activities(workouts, activities_res.data or [])

    # Build the section
    lines = ["## Active Training Plan"]
    lines.append(f"- Plan ID: {plan.id}")
    lines.append(f"- Plan: {plan.name}")
    lines.append(f"- Phase: {current_phase} (Week {current_week}/{total_weeks})")
    lines.append(f"- Weekly hours budget: {plan.weekly_hours}h")
    lines.append(f"- Current week number: {current_week}")
    lines.append(f"- Today: {today.isoformat()} ({_day_name(today_weekday)})")
    lines.append(f"- This week: {week_start.isoformat()} (Mon) to {week_end.isoformat()} (Sun)")
    lines.append("- When the athlete says 'this week' they mean the dates above.")

    if workouts:
        lines.append("")
        lines.append("### This Week's Workouts")
        lines.append("Use the workout_id (UUID) when calling tools to modify workouts.")
        lines.append("Use `modify_workout` to replace an existing workout in place.")
        lines.append("Use `skip_workout` to drop a workout while keeping it in plan history.")
        for w in workouts:
            day_num = w.plan_day if w.plan_day is not None else 0
            day = _day_name(day_num)
            dur_min = (w.estimated_duration_seconds or 0) // 60
            tss = f"TSS:{w.estimated_tss:.0f}" if w.estimated_tss else ""
            content = w.content or {}
            skip_reason = str(content.get("reason") or "").strip()

            if content.get("type") == "skipped":
                status = "skipped"
            elif w.id in workout_matches:
                status = "completed"
            elif w.scheduled_date:
                sched = date.fromisoformat(str(w.scheduled_date))
                if sched < today:
                    status = "skipped"
                elif sched == today:
                    status = "today"
                else:
                    status = "upcoming"
            else:
                if day_num < today_weekday:
                    status = "skipped"
                elif day_num == today_weekday:
                    status = "today"
                else:
                    status = "upcoming"

            line = (
                f"- {day}: {w.discipline} — {w.name} ({dur_min}min, {tss}) "
                f"[{status}] [workout_id: {w.id}] [scheduled: {w.scheduled_date or 'N/A'}] "
                f"[plan_day: {day_num}]"
            )
            if skip_reason:
                line += f" [skip_reason: {skip_reason}]"
            lines.append(line)
    else:
        lines.append("")
        lines.append("### This Week's Workouts")
        lines.append("- No workouts scheduled this week.")

    return "\n".join(lines)


async def build_context_text(user_id: str, sb: AsyncClient) -> str:
    today = date.today()
    ninety_days_ago = today - timedelta(days=90)
    seven_days_ago = today - timedelta(days=7)

    profile = await get_effective_athlete_profile(user_id, sb)

    goals_res = await sb.table("goals").select("*").eq("user_id", user_id).eq("is_active", True).execute()
    goals = [GoalRow(**r) for r in (goals_res.data or [])]

    acts_res = await sb.table("activities").select("*").eq("user_id", user_id).gte(
        "start_time", datetime.combine(ninety_days_ago, time.min, tzinfo=timezone.utc).isoformat()
    ).order("start_time", desc=False).execute()
    activities = [ActivityRow(**r) for r in (acts_res.data or [])]

    health_res = await sb.table("daily_health").select("*").eq("user_id", user_id).gte(
        "date", ninety_days_ago.isoformat()
    ).order("date", desc=False).execute()
    health_rows = [DailyHealthRow(**r) for r in (health_res.data or [])]

    # Athlete profile section
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
    profile_lines.append(f"- Mobility target: {profile.mobility_sessions_per_week_target} sessions/week")

    # Goals
    goals_lines = ["## Goals"]
    if goals:
        for g in goals:
            line = f"- {g.description}"
            if g.target_date:
                line += f" (target: {g.target_date})"
            if g.weekly_volume_km:
                line += f" — {g.weekly_volume_km} km/week"
            goals_lines.append(line)
    else:
        goals_lines.append("No goals set.")

    # 12-week training summary
    weeks: dict[date, dict] = {}
    for a in activities:
        act_date = date.fromisoformat(str(a.start_time)[:10])
        week_start = act_date - timedelta(days=act_date.weekday())
        if week_start not in weeks:
            weeks[week_start] = {"swim_km": 0, "run_km": 0, "ride_km": 0, "strength": 0, "mobility": 0, "tss": 0}
        w = weeks[week_start]
        dm = a.distance_meters or 0
        if a.discipline == "SWIM":
            w["swim_km"] += dm / 1000
        elif a.discipline == "RUN":
            w["run_km"] += dm / 1000
        elif a.discipline in ("RIDE_ROAD", "RIDE_GRAVEL"):
            w["ride_km"] += dm / 1000
        elif a.discipline == "STRENGTH":
            w["strength"] += 1
        elif a.discipline in ("YOGA", "MOBILITY"):
            w["mobility"] += 1
        w["tss"] += a.tss or 0

    weekly_lines = [
        "## 12-Week Training Summary",
        "Week | Swim km | Run km | Ride km | Strength | Mobility | TSS",
    ]
    for ws in sorted(weeks)[-12:]:
        w = weeks[ws]
        weekly_lines.append(
            f"{ws} | {w['swim_km']:.1f} | {w['run_km']:.1f} | {w['ride_km']:.1f} "
            f"| {w['strength']} | {w['mobility']} | {w['tss']:.0f}"
        )

    # Activity history
    act_lines = ["## Activity History (last 90 days)"]
    for a in activities:
        d = str(a.start_time)[:10]
        dur = _fmt_dur(a.duration_seconds)
        if a.discipline in ("RUN", "SWIM", "RIDE_ROAD", "RIDE_GRAVEL"):
            dist = f"{(a.distance_meters or 0)/1000:.1f}km"
            pace = _fmt_pace(a.avg_pace_sec_per_km) if a.avg_pace_sec_per_km else ""
            hr = f"HR:{a.avg_hr}" if a.avg_hr else ""
            tss = f"TSS:{a.tss:.0f}" if a.tss else ""
            act_lines.append(f"{d} | {a.discipline} | {dist} | {dur} | {pace} {hr} {tss}".strip(" |"))
        elif a.discipline == "STRENGTH":
            sets = f"{a.total_sets}sets" if a.total_sets else ""
            vol = f"{a.total_volume_kg:.0f}kg" if a.total_volume_kg else ""
            mg = ",".join(a.primary_muscle_groups or [])
            act_lines.append(f"{d} | STRENGTH | {dur} | {sets} {vol} | {mg}".strip(" |"))
        else:
            act_lines.append(f"{d} | {a.discipline} | {dur} | {a.session_type or ''}".strip(" |"))

    # Health history
    health_lines = ["## Health History (last 90 days)", "Date | HRV | Sleep | Body Batt | Resting HR | Steps"]
    for h in health_rows:
        hrv = f"{h.hrv_last_night:.0f}" if h.hrv_last_night else "—"
        sleep = str(h.sleep_score) if h.sleep_score else "—"
        bb = f"{h.body_battery_low}–{h.body_battery_high}" if h.body_battery_high else "—"
        rhr = str(h.resting_hr) if h.resting_hr else "—"
        steps = f"{h.steps:,}" if h.steps else "—"
        health_lines.append(f"{h.date} | {hrv} | {sleep} | {bb} | {rhr} | {steps}")

    # Cross-discipline flags
    mobility_last14 = sum(
        1 for a in activities
        if a.discipline in ("YOGA", "MOBILITY")
        and date.fromisoformat(str(a.start_time)[:10]) >= (today - timedelta(days=14))
    )
    mob_dates = [date.fromisoformat(str(a.start_time)[:10]) for a in activities if a.discipline in ("YOGA", "MOBILITY")]
    days_since_mob = (today - max(mob_dates)).days if mob_dates else 999
    mg_last14: dict[str, int] = {}
    for a in activities:
        if a.discipline == "STRENGTH" and a.primary_muscle_groups:
            if date.fromisoformat(str(a.start_time)[:10]) >= (today - timedelta(days=14)):
                for mg in a.primary_muscle_groups:
                    mg_last14[mg] = mg_last14.get(mg, 0) + 1

    flags_lines = [
        "## Cross-Discipline Flags",
        f"- Days since last mobility session: {days_since_mob}",
        f"- Mobility sessions (last 14 days): {mobility_last14}",
        f"- Muscle groups trained (last 14 days): {', '.join(mg_last14.keys()) or 'none'}",
    ]

    # Active training plan section
    plan_section = await _build_active_plan_section(user_id, sb, today)

    sections = [
        "You are an expert personal coach specialising in triathlon (swim/bike/run), strength training, and yoga/mobility. "
        "You have full access to the athlete's training history, health metrics, and goals. "
        "Give specific, data-driven advice. Reference actual numbers from their history. "
        "Keep responses concise and actionable.",
        "",
        "\n".join(profile_lines),
        "\n".join(goals_lines),
        "\n".join(weekly_lines),
        "\n".join(act_lines),
        "\n".join(health_lines),
        "\n".join(flags_lines),
    ]
    if plan_section:
        sections.append(plan_section)
    return "\n\n".join(sections)
