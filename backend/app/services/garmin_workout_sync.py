"""Garmin Connect workout sync service — push plan workouts to Garmin.

Converts workout content JSONB to Garmin workout format and uploads
via the garminconnect library. Schedules workouts on the Garmin calendar
for the correct date.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException, status
from supabase import AsyncClient

from app.models import WorkoutRow
from app.services.garmin import get_garmin_client

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Discipline → Garmin sport type mapping
# ---------------------------------------------------------------------------

_SPORT_TYPE_MAP: dict[str, dict[str, Any]] = {
    "RUN": {"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1},
    "SWIM": {"sportTypeId": 3, "sportTypeKey": "swimming", "displayOrder": 3},
    "RIDE_ROAD": {"sportTypeId": 2, "sportTypeKey": "cycling", "displayOrder": 2},
    "RIDE_GRAVEL": {"sportTypeId": 2, "sportTypeKey": "cycling", "displayOrder": 2},
    "STRENGTH": {"sportTypeId": 6, "sportTypeKey": "fitness_equipment", "displayOrder": 6},
    "YOGA": {"sportTypeId": 8, "sportTypeKey": "other", "displayOrder": 8},
    "MOBILITY": {"sportTypeId": 8, "sportTypeKey": "other", "displayOrder": 8},
}

# ---------------------------------------------------------------------------
# Step type constants (matching garminconnect.workout)
# ---------------------------------------------------------------------------

_STEP_WARMUP = {"stepTypeId": 1, "stepTypeKey": "warmup", "displayOrder": 1}
_STEP_COOLDOWN = {"stepTypeId": 2, "stepTypeKey": "cooldown", "displayOrder": 2}
_STEP_INTERVAL = {"stepTypeId": 3, "stepTypeKey": "interval", "displayOrder": 3}
_STEP_RECOVERY = {"stepTypeId": 4, "stepTypeKey": "recovery", "displayOrder": 4}
_STEP_REST = {"stepTypeId": 5, "stepTypeKey": "rest", "displayOrder": 5}
_STEP_REPEAT = {"stepTypeId": 6, "stepTypeKey": "repeat", "displayOrder": 6}

_CONDITION_TIME = {
    "conditionTypeId": 2,
    "conditionTypeKey": "time",
    "displayOrder": 2,
    "displayable": True,
}
_CONDITION_ITERATIONS = {
    "conditionTypeId": 7,
    "conditionTypeKey": "iterations",
    "displayOrder": 7,
    "displayable": False,
}

_TARGET_NO_TARGET = {
    "workoutTargetTypeId": 1,
    "workoutTargetTypeKey": "no.target",
    "displayOrder": 1,
}
_TARGET_HR_ZONE = {
    "workoutTargetTypeId": 4,
    "workoutTargetTypeKey": "heart.rate.zone",
    "displayOrder": 4,
}
_TARGET_SPEED_ZONE = {
    "workoutTargetTypeId": 5,
    "workoutTargetTypeKey": "speed.zone",
    "displayOrder": 5,
}

# HR zone approximate ranges (bpm) — used when athlete thresholds aren't
# available. These are generic 5-zone model values.
_HR_ZONE_RANGES: dict[str, tuple[float, float]] = {
    "Z1": (0.50, 0.60),
    "Z2": (0.60, 0.70),
    "Z3": (0.70, 0.80),
    "Z4": (0.80, 0.90),
    "Z5": (0.90, 1.00),
}


def _parse_zone(zone_str: str | None) -> dict[str, Any] | None:
    """Parse a zone string like 'Z2' or 'Z4-Z5' into a Garmin HR target.

    Returns a target dict with HR zone range, or None if unparseable.
    """
    if not zone_str:
        return None

    zone_str = zone_str.strip().upper()

    # Handle range like "Z1-Z2"
    if "-" in zone_str:
        parts = zone_str.split("-")
        low_zone = parts[0].strip()
        high_zone = parts[-1].strip()
    else:
        low_zone = high_zone = zone_str

    low_range = _HR_ZONE_RANGES.get(low_zone)
    high_range = _HR_ZONE_RANGES.get(high_zone)

    if not low_range or not high_range:
        return None

    # Use percentage-of-max-HR as zone values (Garmin uses absolute bpm,
    # but we store as percentages 0-100 when we don't know max HR).
    # Garmin interprets these as zone indices when workoutTargetTypeKey
    # is "heart.rate.zone".
    zone_number = int(low_zone.replace("Z", "")) if low_zone.startswith("Z") else 0
    if zone_number < 1 or zone_number > 5:
        return None

    return {
        **_TARGET_HR_ZONE,
        "targetValueOne": zone_number,
        "targetValueTwo": zone_number,
    }


def _build_step(
    step_order: int,
    step_type: dict[str, Any],
    duration_minutes: float,
    zone: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """Build a single Garmin executable workout step."""
    target = _parse_zone(zone) or {**_TARGET_NO_TARGET}

    step: dict[str, Any] = {
        "type": "ExecutableStepDTO",
        "stepOrder": step_order,
        "stepType": step_type,
        "endCondition": {**_CONDITION_TIME},
        "endConditionValue": duration_minutes * 60,  # seconds
        "targetType": target,
    }
    if description:
        step["description"] = description

    return step


def _build_repeat_group(
    step_order: int,
    iterations: int,
    child_steps: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build a Garmin repeat group step."""
    return {
        "type": "RepeatGroupDTO",
        "stepOrder": step_order,
        "stepType": {**_STEP_REPEAT},
        "numberOfIterations": iterations,
        "workoutSteps": child_steps,
        "endCondition": {**_CONDITION_ITERATIONS},
        "endConditionValue": float(iterations),
        "smartRepeat": False,
    }


def convert_workout_to_garmin(workout: WorkoutRow) -> dict[str, Any]:
    """Convert a WorkoutRow's content JSONB to Garmin workout format.

    The workout content follows the plan generator's structure:
    {
        "type": "intervals",
        "warmup": {"duration_min": 10, "zone": "Z1-Z2", "description": "..."},
        "main": [{"duration_min": 5, "zone": "Z4", "repeats": 4, "rest_min": 2, ...}],
        "cooldown": {"duration_min": 10, "zone": "Z1", "description": "..."},
        "target_tss": 65,
        "notes": "..."
    }

    Returns a dict suitable for garminconnect's upload_workout().
    """
    content = workout.content if isinstance(workout.content, dict) else {}
    sport_type = _SPORT_TYPE_MAP.get(
        workout.discipline,
        {"sportTypeId": 8, "sportTypeKey": "other", "displayOrder": 8},
    )

    steps: list[dict[str, Any]] = []
    step_order = 1

    # --- Warmup ---
    warmup = content.get("warmup")
    if isinstance(warmup, dict):
        duration = warmup.get("duration_min", 5)
        steps.append(
            _build_step(
                step_order=step_order,
                step_type={**_STEP_WARMUP},
                duration_minutes=duration,
                zone=warmup.get("zone"),
                description=warmup.get("description"),
            )
        )
        step_order += 1

    # --- Main set ---
    main_set = content.get("main")
    if isinstance(main_set, list):
        for block in main_set:
            if not isinstance(block, dict):
                continue

            duration = block.get("duration_min", 10)
            zone = block.get("zone")
            description = block.get("description")
            repeats = block.get("repeats")
            rest_min = block.get("rest_min", 0)

            if repeats and repeats > 1:
                # Build a repeat group: interval + recovery for each rep
                child_steps: list[dict[str, Any]] = []
                child_order = 1

                # Interval step
                child_steps.append(
                    _build_step(
                        step_order=child_order,
                        step_type={**_STEP_INTERVAL},
                        duration_minutes=duration,
                        zone=zone,
                        description=description,
                    )
                )
                child_order += 1

                # Recovery/rest step between reps
                if rest_min and rest_min > 0:
                    child_steps.append(
                        _build_step(
                            step_order=child_order,
                            step_type={**_STEP_RECOVERY},
                            duration_minutes=rest_min,
                            description="Recovery",
                        )
                    )
                    child_order += 1

                steps.append(
                    _build_repeat_group(
                        step_order=step_order,
                        iterations=int(repeats),
                        child_steps=child_steps,
                    )
                )
                step_order += 1
            else:
                # Single interval step
                steps.append(
                    _build_step(
                        step_order=step_order,
                        step_type={**_STEP_INTERVAL},
                        duration_minutes=duration,
                        zone=zone,
                        description=description,
                    )
                )
                step_order += 1

    # --- Cooldown ---
    cooldown = content.get("cooldown")
    if isinstance(cooldown, dict):
        duration = cooldown.get("duration_min", 5)
        steps.append(
            _build_step(
                step_order=step_order,
                step_type={**_STEP_COOLDOWN},
                duration_minutes=duration,
                zone=cooldown.get("zone"),
                description=cooldown.get("description"),
            )
        )
        step_order += 1

    # If no steps were generated (e.g. empty content), create a single
    # open interval for the full estimated duration.
    if not steps:
        total_minutes = (workout.estimated_duration_seconds or 1800) / 60
        steps.append(
            _build_step(
                step_order=1,
                step_type={**_STEP_INTERVAL},
                duration_minutes=total_minutes,
                description=workout.description or workout.name,
            )
        )

    estimated_duration = workout.estimated_duration_seconds or 1800

    garmin_workout: dict[str, Any] = {
        "workoutName": workout.name or "Workout",
        "description": workout.description or "",
        "sportType": sport_type,
        "estimatedDurationInSecs": estimated_duration,
        "workoutSegments": [
            {
                "segmentOrder": 1,
                "sportType": sport_type,
                "workoutSteps": steps,
            }
        ],
    }

    return garmin_workout


async def sync_plan_to_garmin(
    plan_id: str,
    user_id: str,
    sb: AsyncClient,
) -> dict[str, Any]:
    """Sync upcoming 14 days of unsynced workouts to Garmin Connect.

    1. Verify plan ownership
    2. Fetch upcoming unsynced workouts (next 14 days)
    3. Get authenticated Garmin client
    4. For each workout: convert → upload → store garmin_workout_id → schedule
    5. Handle partial failures (skip failed, continue with others)

    Returns dict with synced/failed counts and details.

    Raises:
        HTTPException 404: Plan not found or not owned by user
        HTTPException 400: Garmin not connected
    """
    # 1. Verify plan ownership
    plan_res = await sb.table("training_plans").select("id,user_id,status").eq(
        "id", plan_id
    ).eq("user_id", user_id).limit(1).execute()

    if not plan_res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found",
        )

    # 2. Fetch upcoming 14 days of unsynced workouts
    today = date.today()
    end_date = today + timedelta(days=14)

    workouts_res = await sb.table("workouts").select("*").eq(
        "plan_id", plan_id
    ).eq("user_id", user_id).is_(
        "garmin_workout_id", "null"
    ).gte(
        "scheduled_date", today.isoformat()
    ).lte(
        "scheduled_date", end_date.isoformat()
    ).order("scheduled_date", desc=False).execute()

    workout_rows = [WorkoutRow(**r) for r in (workouts_res.data or [])]

    if not workout_rows:
        return {
            "synced": 0,
            "failed": 0,
            "total": 0,
            "details": [],
            "message": "No unsynced workouts in the next 14 days",
        }

    # 3. Get Garmin client (raises HTTPException 400 if not connected)
    garmin = await get_garmin_client(user_id, sb)

    # 4. Convert, upload, and schedule each workout
    synced = 0
    failed = 0
    details: list[dict[str, Any]] = []

    for workout in workout_rows:
        try:
            # Convert to Garmin format
            garmin_format = convert_workout_to_garmin(workout)

            # Upload to Garmin Connect
            upload_result = garmin.upload_workout(garmin_format)

            # Extract the garmin workout ID from the response
            garmin_workout_id = _extract_workout_id(upload_result)

            if not garmin_workout_id:
                logger.warning(
                    "Could not extract workout ID from Garmin response for workout %s",
                    workout.id,
                )
                failed += 1
                details.append({
                    "workout_id": workout.id,
                    "name": workout.name,
                    "status": "failed",
                    "error": "Could not extract Garmin workout ID from upload response",
                })
                continue

            # Store garmin_workout_id on the workout row
            await sb.table("workouts").update(
                {"garmin_workout_id": garmin_workout_id}
            ).eq("id", workout.id).execute()

            # Schedule on Garmin calendar for the correct date
            if workout.scheduled_date:
                try:
                    garmin.schedule_workout(
                        garmin_workout_id,
                        str(workout.scheduled_date),
                    )
                except Exception as sched_err:
                    # Workout was uploaded but scheduling failed — still count
                    # as synced since the workout exists on Garmin.
                    logger.warning(
                        "Workout %s uploaded but scheduling failed: %s",
                        workout.id,
                        sched_err,
                    )

            synced += 1
            details.append({
                "workout_id": workout.id,
                "name": workout.name,
                "scheduled_date": str(workout.scheduled_date),
                "garmin_workout_id": garmin_workout_id,
                "status": "synced",
            })

        except Exception as exc:
            logger.error(
                "Failed to sync workout %s (%s) to Garmin: %s",
                workout.id,
                workout.name,
                exc,
            )
            failed += 1
            details.append({
                "workout_id": workout.id,
                "name": workout.name,
                "status": "failed",
                "error": str(exc),
            })

    return {
        "synced": synced,
        "failed": failed,
        "total": len(workout_rows),
        "details": details,
    }


def _extract_workout_id(upload_result: Any) -> int | None:
    """Extract the workout ID from a Garmin upload_workout response.

    The response is typically a dict with a 'workoutId' key, but the
    structure can vary. Try common patterns.
    """
    if isinstance(upload_result, dict):
        # Direct workoutId field
        wid = upload_result.get("workoutId")
        if wid is not None:
            try:
                return int(wid)
            except (TypeError, ValueError):
                pass

        # Nested under workout key
        workout_data = upload_result.get("workout") or upload_result.get("workoutDTO")
        if isinstance(workout_data, dict):
            wid = workout_data.get("workoutId")
            if wid is not None:
                try:
                    return int(wid)
                except (TypeError, ValueError):
                    pass

    # If the result is an int directly
    if isinstance(upload_result, int):
        return upload_result

    return None


# ---------------------------------------------------------------------------
# Individual workout sync operations (auto-sync on changes)
# ---------------------------------------------------------------------------


async def sync_workout_to_garmin(
    workout_id: str,
    user_id: str,
    sb: AsyncClient,
) -> dict[str, Any]:
    """Sync a single workout to Garmin Connect.

    If the workout already has a garmin_workout_id, updates it on Garmin.
    Otherwise, creates a new workout on Garmin.

    Only syncs workouts that:
    - Have a scheduled_date in the future (or today)
    - Are not skipped (content.type != 'skipped')
    - Belong to a plan (plan_id is not null)

    Returns dict with status and details.
    """
    # Fetch the workout
    res = await sb.table("workouts").select("*").eq(
        "id", workout_id
    ).eq("user_id", user_id).limit(1).execute()

    if not res.data:
        logger.warning("Workout %s not found for Garmin sync", workout_id)
        return {"status": "skipped", "reason": "Workout not found"}

    workout = WorkoutRow(**res.data[0])

    # Skip if no plan (standalone workouts don't auto-sync)
    if not workout.plan_id:
        return {"status": "skipped", "reason": "Not part of a plan"}

    # Skip if no scheduled date or in the past
    if not workout.scheduled_date:
        return {"status": "skipped", "reason": "No scheduled date"}

    sched_date = date.fromisoformat(str(workout.scheduled_date))
    if sched_date < date.today():
        return {"status": "skipped", "reason": "Scheduled date is in the past"}

    # Skip if workout is marked as skipped
    content = workout.content if isinstance(workout.content, dict) else {}
    if content.get("type") == "skipped":
        # If it was already on Garmin, delete it
        if workout.garmin_workout_id:
            return await delete_workout_from_garmin(workout_id, user_id, sb)
        return {"status": "skipped", "reason": "Workout is skipped"}

    # Check if user has Garmin connected
    user_res = await sb.table("users").select("garmin_session_data").eq(
        "id", user_id
    ).limit(1).execute()

    if not user_res.data or not user_res.data[0].get("garmin_session_data"):
        return {"status": "skipped", "reason": "Garmin not connected"}

    try:
        garmin = await get_garmin_client(user_id, sb)
    except Exception as exc:
        logger.warning("Could not get Garmin client for user %s: %s", user_id, exc)
        return {"status": "skipped", "reason": f"Garmin auth failed: {exc}"}

    try:
        garmin_format = convert_workout_to_garmin(workout)

        if workout.garmin_workout_id:
            # Update existing workout on Garmin
            garmin_format["workoutId"] = workout.garmin_workout_id
            try:
                garmin.update_workout(workout.garmin_workout_id, garmin_format)
                logger.info(
                    "Updated workout %s on Garmin (garmin_id=%s)",
                    workout_id,
                    workout.garmin_workout_id,
                )
                return {
                    "status": "updated",
                    "garmin_workout_id": workout.garmin_workout_id,
                }
            except Exception as update_err:
                # If update fails (e.g., workout deleted on Garmin), try creating new
                logger.warning(
                    "Failed to update Garmin workout %s, will create new: %s",
                    workout.garmin_workout_id,
                    update_err,
                )
                # Clear the old garmin_workout_id and fall through to create
                await sb.table("workouts").update(
                    {"garmin_workout_id": None}
                ).eq("id", workout_id).execute()

        # Create new workout on Garmin
        upload_result = garmin.upload_workout(garmin_format)
        garmin_workout_id = _extract_workout_id(upload_result)

        if not garmin_workout_id:
            logger.error(
                "Could not extract workout ID from Garmin response for workout %s",
                workout_id,
            )
            return {"status": "failed", "error": "Could not extract Garmin workout ID"}

        # Store garmin_workout_id
        await sb.table("workouts").update(
            {"garmin_workout_id": garmin_workout_id}
        ).eq("id", workout_id).execute()

        # Schedule on Garmin calendar
        try:
            garmin.schedule_workout(garmin_workout_id, str(workout.scheduled_date))
        except Exception as sched_err:
            logger.warning(
                "Workout %s uploaded but scheduling failed: %s",
                workout_id,
                sched_err,
            )

        logger.info(
            "Created workout %s on Garmin (garmin_id=%s)",
            workout_id,
            garmin_workout_id,
        )
        return {
            "status": "created",
            "garmin_workout_id": garmin_workout_id,
        }

    except Exception as exc:
        logger.error("Failed to sync workout %s to Garmin: %s", workout_id, exc)
        return {"status": "failed", "error": str(exc)}


async def delete_workout_from_garmin(
    workout_id: str,
    user_id: str,
    sb: AsyncClient,
) -> dict[str, Any]:
    """Delete a workout from Garmin Connect.

    Only deletes if the workout has a garmin_workout_id.
    Clears the garmin_workout_id from the database after deletion.

    Returns dict with status and details.
    """
    # Fetch the workout
    res = await sb.table("workouts").select("id,garmin_workout_id").eq(
        "id", workout_id
    ).eq("user_id", user_id).limit(1).execute()

    if not res.data:
        return {"status": "skipped", "reason": "Workout not found"}

    garmin_workout_id = res.data[0].get("garmin_workout_id")
    if not garmin_workout_id:
        return {"status": "skipped", "reason": "Not synced to Garmin"}

    # Check if user has Garmin connected
    user_res = await sb.table("users").select("garmin_session_data").eq(
        "id", user_id
    ).limit(1).execute()

    if not user_res.data or not user_res.data[0].get("garmin_session_data"):
        # Clear the garmin_workout_id anyway since we can't delete
        await sb.table("workouts").update(
            {"garmin_workout_id": None}
        ).eq("id", workout_id).execute()
        return {"status": "skipped", "reason": "Garmin not connected"}

    try:
        garmin = await get_garmin_client(user_id, sb)
        garmin.delete_workout(garmin_workout_id)

        # Clear garmin_workout_id from database
        await sb.table("workouts").update(
            {"garmin_workout_id": None}
        ).eq("id", workout_id).execute()

        logger.info(
            "Deleted workout %s from Garmin (garmin_id=%s)",
            workout_id,
            garmin_workout_id,
        )
        return {
            "status": "deleted",
            "garmin_workout_id": garmin_workout_id,
        }

    except Exception as exc:
        logger.warning(
            "Failed to delete workout %s from Garmin (garmin_id=%s): %s",
            workout_id,
            garmin_workout_id,
            exc,
        )
        # Clear garmin_workout_id anyway — the workout may have been deleted
        # manually on Garmin, or the session expired
        await sb.table("workouts").update(
            {"garmin_workout_id": None}
        ).eq("id", workout_id).execute()
        return {"status": "cleared", "reason": f"Garmin delete failed: {exc}"}


async def sync_workouts_batch_to_garmin(
    workout_ids: list[str],
    user_id: str,
    sb: AsyncClient,
) -> dict[str, Any]:
    """Sync multiple workouts to Garmin Connect.

    Processes each workout and returns aggregate results.
    Failures on individual workouts don't stop the batch.

    Returns dict with counts and details.
    """
    results = {
        "created": 0,
        "updated": 0,
        "deleted": 0,
        "skipped": 0,
        "failed": 0,
        "details": [],
    }

    for workout_id in workout_ids:
        result = await sync_workout_to_garmin(workout_id, user_id, sb)
        status = result.get("status", "failed")

        if status in ("created", "updated", "deleted"):
            results[status] += 1
        elif status == "skipped":
            results["skipped"] += 1
        else:
            results["failed"] += 1

        results["details"].append({
            "workout_id": workout_id,
            **result,
        })

    return results
