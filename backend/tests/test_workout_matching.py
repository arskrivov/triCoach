from app.services.workout_matching import is_commute_activity, match_workouts_to_activities


def _workout(**overrides):
    base = {
        "id": "workout-1",
        "discipline": "RIDE_ROAD",
        "scheduled_date": "2026-04-21",
    }
    base.update(overrides)
    return base


def _activity(**overrides):
    base = {
        "id": "activity-1",
        "discipline": "RIDE_ROAD",
        "start_time": "2026-04-21T07:30:00Z",
        "name": "Morning Ride",
    }
    base.update(overrides)
    return base


def test_matches_planned_road_ride_to_non_commute_activity():
    matches = match_workouts_to_activities(
        [_workout()],
        [_activity(garmin_type_key="road_biking")],
    )

    assert matches["workout-1"]["id"] == "activity-1"


def test_excludes_commute_ride_from_planned_road_ride():
    matches = match_workouts_to_activities(
        [_workout()],
        [_activity(garmin_type_key="bike_commute", name="Ride To Work")],
    )

    assert matches == {}


def test_detects_commute_from_event_type():
    assert is_commute_activity(
        _activity(garmin_type_key="cycling", garmin_event_type="Transport")
    ) is True


def test_prefers_closest_matching_activity_date():
    matches = match_workouts_to_activities(
        [_workout(discipline="RUN")],
        [
            _activity(
                id="activity-early",
                discipline="RUN",
                start_time="2026-04-20T09:00:00Z",
            ),
            _activity(
                id="activity-same-day",
                discipline="RUN",
                start_time="2026-04-21T06:00:00Z",
            ),
        ],
    )

    assert matches["workout-1"]["id"] == "activity-same-day"
