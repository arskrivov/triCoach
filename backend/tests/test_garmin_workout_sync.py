"""Tests for garmin_workout_sync service — convert_workout_to_garmin."""

from app.models import WorkoutRow
from app.services.garmin_workout_sync import (
    convert_workout_to_garmin,
    _SPORT_TYPE_MAP,
)


def _make_workout(**overrides) -> WorkoutRow:
    """Create a WorkoutRow with sensible defaults for testing."""
    defaults = {
        "id": "w-1",
        "user_id": "u-1",
        "name": "Easy Run",
        "discipline": "RUN",
        "builder_type": "endurance",
        "description": "Easy aerobic run",
        "estimated_duration_seconds": 2700,
        "content": {
            "type": "easy",
            "warmup": {"duration_min": 5, "zone": "Z1", "description": "Easy jog"},
            "main": [{"duration_min": 35, "zone": "Z2", "description": "Steady pace"}],
            "cooldown": {"duration_min": 5, "zone": "Z1", "description": "Walk"},
            "target_tss": 35,
            "notes": "Conversational pace",
        },
    }
    defaults.update(overrides)
    return WorkoutRow(**defaults)


class TestConvertWorkoutToGarmin:
    """Tests for convert_workout_to_garmin."""

    def test_basic_run_workout(self):
        workout = _make_workout()
        result = convert_workout_to_garmin(workout)

        assert result["workoutName"] == "Easy Run"
        assert result["sportType"]["sportTypeKey"] == "running"
        assert result["estimatedDurationInSecs"] == 2700

        segments = result["workoutSegments"]
        assert len(segments) == 1
        steps = segments[0]["workoutSteps"]
        # warmup + 1 main interval + cooldown = 3 steps
        assert len(steps) == 3
        assert steps[0]["stepType"]["stepTypeKey"] == "warmup"
        assert steps[1]["stepType"]["stepTypeKey"] == "interval"
        assert steps[2]["stepType"]["stepTypeKey"] == "cooldown"

    def test_interval_workout_with_repeats(self):
        workout = _make_workout(
            name="Threshold Intervals",
            content={
                "type": "intervals",
                "warmup": {"duration_min": 10, "zone": "Z1-Z2", "description": "Build"},
                "main": [
                    {
                        "duration_min": 5,
                        "zone": "Z4",
                        "description": "Threshold",
                        "repeats": 4,
                        "rest_min": 2,
                    }
                ],
                "cooldown": {"duration_min": 10, "zone": "Z1", "description": "Easy jog"},
            },
        )
        result = convert_workout_to_garmin(workout)
        steps = result["workoutSegments"][0]["workoutSteps"]

        # warmup + repeat group + cooldown = 3 steps
        assert len(steps) == 3
        assert steps[0]["stepType"]["stepTypeKey"] == "warmup"

        # Repeat group
        repeat = steps[1]
        assert repeat["type"] == "RepeatGroupDTO"
        assert repeat["numberOfIterations"] == 4
        assert len(repeat["workoutSteps"]) == 2  # interval + recovery
        assert repeat["workoutSteps"][0]["stepType"]["stepTypeKey"] == "interval"
        assert repeat["workoutSteps"][1]["stepType"]["stepTypeKey"] == "recovery"

        assert steps[2]["stepType"]["stepTypeKey"] == "cooldown"

    def test_cycling_sport_type(self):
        workout = _make_workout(discipline="RIDE_ROAD", name="Long Ride")
        result = convert_workout_to_garmin(workout)
        assert result["sportType"]["sportTypeKey"] == "cycling"
        assert result["sportType"]["sportTypeId"] == 2

    def test_swim_sport_type(self):
        workout = _make_workout(discipline="SWIM", name="Drill Session")
        result = convert_workout_to_garmin(workout)
        assert result["sportType"]["sportTypeKey"] == "swimming"
        assert result["sportType"]["sportTypeId"] == 4

    def test_strength_sport_type(self):
        workout = _make_workout(discipline="STRENGTH", name="Upper Body")
        result = convert_workout_to_garmin(workout)
        assert result["sportType"]["sportTypeKey"] == "strength_training"

    def test_yoga_sport_type(self):
        workout = _make_workout(discipline="YOGA", name="Recovery Yoga")
        result = convert_workout_to_garmin(workout)
        assert result["sportType"]["sportTypeKey"] == "other"

    def test_unknown_discipline_defaults_to_other(self):
        workout = _make_workout(discipline="UNKNOWN")
        result = convert_workout_to_garmin(workout)
        assert result["sportType"]["sportTypeKey"] == "other"

    def test_empty_content_creates_single_step(self):
        workout = _make_workout(content={}, estimated_duration_seconds=3600)
        result = convert_workout_to_garmin(workout)
        steps = result["workoutSegments"][0]["workoutSteps"]
        assert len(steps) == 1
        assert steps[0]["stepType"]["stepTypeKey"] == "interval"
        assert steps[0]["endConditionValue"] == 3600.0  # 60 min in seconds

    def test_warmup_duration_in_seconds(self):
        workout = _make_workout()
        result = convert_workout_to_garmin(workout)
        warmup = result["workoutSegments"][0]["workoutSteps"][0]
        # 5 minutes = 300 seconds
        assert warmup["endConditionValue"] == 300.0

    def test_hr_zone_target(self):
        workout = _make_workout()
        result = convert_workout_to_garmin(workout)
        main_step = result["workoutSegments"][0]["workoutSteps"][1]
        # Z2 target
        assert main_step["targetType"]["workoutTargetTypeKey"] == "heart.rate.zone"
        assert main_step["targetType"]["targetValueOne"] == 2

    def test_no_zone_uses_no_target(self):
        workout = _make_workout(
            content={
                "type": "easy",
                "main": [{"duration_min": 30, "description": "Just run"}],
            }
        )
        result = convert_workout_to_garmin(workout)
        main_step = result["workoutSegments"][0]["workoutSteps"][0]
        assert main_step["targetType"]["workoutTargetTypeKey"] == "no.target"

    def test_multiple_main_blocks(self):
        workout = _make_workout(
            content={
                "type": "mixed",
                "warmup": {"duration_min": 10, "zone": "Z1"},
                "main": [
                    {"duration_min": 20, "zone": "Z2", "description": "Steady"},
                    {"duration_min": 10, "zone": "Z4", "description": "Tempo"},
                ],
                "cooldown": {"duration_min": 5, "zone": "Z1"},
            }
        )
        result = convert_workout_to_garmin(workout)
        steps = result["workoutSegments"][0]["workoutSteps"]
        # warmup + 2 main intervals + cooldown = 4
        assert len(steps) == 4

    def test_repeat_with_no_rest(self):
        workout = _make_workout(
            content={
                "type": "intervals",
                "main": [
                    {"duration_min": 3, "zone": "Z5", "repeats": 6},
                ],
            }
        )
        result = convert_workout_to_garmin(workout)
        steps = result["workoutSegments"][0]["workoutSteps"]
        assert len(steps) == 1
        repeat = steps[0]
        assert repeat["type"] == "RepeatGroupDTO"
        assert repeat["numberOfIterations"] == 6
        # Only interval step, no recovery (rest_min not set)
        assert len(repeat["workoutSteps"]) == 1

    def test_step_order_is_sequential(self):
        workout = _make_workout()
        result = convert_workout_to_garmin(workout)
        steps = result["workoutSegments"][0]["workoutSteps"]
        for i, step in enumerate(steps, start=1):
            assert step["stepOrder"] == i

    def test_description_included_in_garmin_output(self):
        workout = _make_workout(description="Focus on cadence")
        result = convert_workout_to_garmin(workout)
        assert result["description"] == "Focus on cadence"


class TestSportTypeMapping:
    """Tests for sport type mapping to Garmin format."""

    def test_all_disciplines_have_sport_type(self):
        """Verify all supported disciplines map to valid Garmin sport types."""
        disciplines = ["SWIM", "RUN", "RIDE_ROAD", "RIDE_GRAVEL", "STRENGTH", "YOGA", "MOBILITY"]
        for discipline in disciplines:
            assert discipline in _SPORT_TYPE_MAP, f"Missing sport type for {discipline}"
            sport_type = _SPORT_TYPE_MAP[discipline]
            assert "sportTypeId" in sport_type
            assert "sportTypeKey" in sport_type
            assert "displayOrder" in sport_type

    def test_swim_uses_swimming_sport_type(self):
        """Swim workouts should use Garmin's swimming sport type."""
        workout = _make_workout(discipline="SWIM", name="Pool Session")
        result = convert_workout_to_garmin(workout)
        assert result["sportType"]["sportTypeId"] == 4
        assert result["sportType"]["sportTypeKey"] == "swimming"
        # Segment should also have swimming sport type
        assert result["workoutSegments"][0]["sportType"]["sportTypeKey"] == "swimming"

    def test_run_uses_running_sport_type(self):
        """Run workouts should use Garmin's running sport type."""
        workout = _make_workout(discipline="RUN", name="Easy Run")
        result = convert_workout_to_garmin(workout)
        assert result["sportType"]["sportTypeId"] == 1
        assert result["sportType"]["sportTypeKey"] == "running"
        assert result["workoutSegments"][0]["sportType"]["sportTypeKey"] == "running"

    def test_ride_road_uses_cycling_sport_type(self):
        """Road cycling workouts should use Garmin's cycling sport type."""
        workout = _make_workout(discipline="RIDE_ROAD", name="Long Ride")
        result = convert_workout_to_garmin(workout)
        assert result["sportType"]["sportTypeId"] == 2
        assert result["sportType"]["sportTypeKey"] == "cycling"
        assert result["workoutSegments"][0]["sportType"]["sportTypeKey"] == "cycling"

    def test_ride_gravel_uses_cycling_sport_type(self):
        """Gravel cycling workouts should use Garmin's cycling sport type."""
        workout = _make_workout(discipline="RIDE_GRAVEL", name="Gravel Adventure")
        result = convert_workout_to_garmin(workout)
        assert result["sportType"]["sportTypeId"] == 2
        assert result["sportType"]["sportTypeKey"] == "cycling"

    def test_strength_uses_strength_training_sport_type(self):
        """Strength workouts should use Garmin's dedicated strength sport type."""
        workout = _make_workout(discipline="STRENGTH", name="Leg Day")
        result = convert_workout_to_garmin(workout)
        assert result["sportType"]["sportTypeId"] == 5
        assert result["sportType"]["sportTypeKey"] == "strength_training"
        assert result["workoutSegments"][0]["sportType"]["sportTypeKey"] == "strength_training"

    def test_yoga_uses_other_sport_type(self):
        """Yoga workouts should use Garmin's other sport type."""
        workout = _make_workout(discipline="YOGA", name="Morning Yoga")
        result = convert_workout_to_garmin(workout)
        assert result["sportType"]["sportTypeId"] == 8
        assert result["sportType"]["sportTypeKey"] == "other"

    def test_mobility_uses_other_sport_type(self):
        """Mobility workouts should use Garmin's other sport type."""
        workout = _make_workout(discipline="MOBILITY", name="Hip Mobility")
        result = convert_workout_to_garmin(workout)
        assert result["sportType"]["sportTypeId"] == 8
        assert result["sportType"]["sportTypeKey"] == "other"

    def test_unknown_discipline_defaults_to_other(self):
        """Unknown disciplines should default to 'other' sport type."""
        workout = _make_workout(discipline="UNKNOWN_SPORT")
        result = convert_workout_to_garmin(workout)
        assert result["sportType"]["sportTypeKey"] == "other"
        assert result["sportType"]["sportTypeId"] == 8
