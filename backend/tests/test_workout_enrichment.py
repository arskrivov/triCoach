from app.services.workout_enrichment import (
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
