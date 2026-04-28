from types import SimpleNamespace

from app.models import TrainingPlanRow, WorkoutRow
from app.services.workout_enrichment import (
    build_workout_enrichment_prompt,
    has_detailed_workout_content,
    normalize_workout_content,
)


def test_normalize_workout_content_converts_string_segments():
    normalized = normalize_workout_content(
        {
            "type": "easy",
            "target_tss": 40,
            "target_hr_zone": "Z2",
            "warmup": "Easy jog",
            "main": "Steady pace",
            "cooldown": "Walk home",
            "notes": "Stay relaxed",
        }
    )

    assert normalized["warmup"]["description"] == "Easy jog"
    assert normalized["main"][0]["description"] == "Steady pace"
    assert normalized["cooldown"]["description"] == "Walk home"


def test_has_detailed_workout_content_requires_full_generate_and_sync_shape():
    detailed = {
        "type": "endurance",
        "target_tss": 70,
        "target_hr_zone": "Z2",
        "warmup": {"duration_min": 10, "zone": "Z1", "description": "Easy spin"},
        "main": [{"duration_min": 45, "zone": "Z2", "description": "Steady ride at 65-75% FTP"}],
        "cooldown": {"duration_min": 10, "zone": "Z1", "description": "Easy spin home"},
        "notes": "Smooth cadence, stay aerobic",
    }
    sparse = {
        "type": "endurance",
        "main": [{"duration_min": 45, "zone": "Z2", "description": "Ride"}],
    }

    assert has_detailed_workout_content(detailed) is True
    assert has_detailed_workout_content(sparse) is False


def test_build_workout_enrichment_prompt_includes_athlete_notes():
    plan = TrainingPlanRow(
        id="plan-1",
        user_id="user-1",
        name="Build Phase",
        start_date="2026-01-05",
        end_date="2026-03-29",
        weekly_hours=8.0,
    )
    workouts = [
        WorkoutRow(
            id="workout-1",
            user_id="user-1",
            name="Easy Run",
            discipline="RUN",
            estimated_duration_seconds=2700,
            estimated_tss=35,
        )
    ]
    profile = SimpleNamespace(
        ftp_watts=None,
        threshold_pace_sec_per_km=None,
        swim_css_sec_per_100m=None,
        max_hr=None,
        squat_1rm_kg=None,
        deadlift_1rm_kg=None,
        bench_1rm_kg=None,
        notes="Left knee pain: avoid downhill running and deep lunges.",
    )

    prompt = build_workout_enrichment_prompt(
        plan=plan,
        week_number=2,
        workouts=workouts,
        profile=profile,
    )

    assert "Athlete notes: Left knee pain: avoid downhill running and deep lunges." in prompt
    assert "Treat athlete notes as real constraints." in prompt
