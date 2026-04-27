from app.services.route_generator import (
    _build_route_payload,
    _calculate_surface_breakdown,
    _custom_model_for_sport,
    _parse_route,
)


def test_route_payloads_use_different_profiles_and_rules():
    run_payload = _build_route_payload(
        sport="RUN",
        start_lat=48.1,
        start_lng=11.5,
        target_distance_km=10,
        seed=0,
    )
    road_payload = _build_route_payload(
        sport="RIDE_ROAD",
        start_lat=48.1,
        start_lng=11.5,
        target_distance_km=60,
        seed=0,
    )
    gravel_payload = _build_route_payload(
        sport="RIDE_GRAVEL",
        start_lat=48.1,
        start_lng=11.5,
        target_distance_km=60,
        seed=0,
    )

    assert run_payload["profile"] == "foot"
    assert road_payload["profile"] == "bike"
    assert gravel_payload["profile"] == "bike"

    assert run_payload["custom_model"] != road_payload["custom_model"]
    assert road_payload["custom_model"] != gravel_payload["custom_model"]


def test_road_model_prefers_paved_and_penalizes_gravel():
    model = _custom_model_for_sport("RIDE_ROAD")
    rules = model["priority"]

    assert any(rule.get("if") == "surface == ASPHALT || surface == PAVED || surface == CONCRETE" for rule in rules)
    assert any(rule.get("if") == "surface == GRAVEL || surface == DIRT || surface == GROUND || surface == SAND" for rule in rules)


def test_gravel_model_prefers_unpaved_and_penalizes_asphalt():
    model = _custom_model_for_sport("RIDE_GRAVEL")
    rules = model["priority"]

    assert any(rule.get("if") == "surface == GRAVEL || surface == DIRT || surface == GROUND || surface == COMPACTED" for rule in rules)
    assert any(rule.get("if") == "surface == ASPHALT || surface == PAVED || surface == CONCRETE" for rule in rules)


# --- Surface breakdown tests ---


def test_surface_breakdown_calculates_percentages():
    """Surface breakdown returns correct percentages for each surface type."""
    path = {
        "details": {
            "surface": [
                [0, 60, "asphalt"],
                [60, 80, "gravel"],
                [80, 100, "dirt"],
            ]
        }
    }
    result = _calculate_surface_breakdown(path)
    assert result is not None
    assert result["asphalt"] == 60.0
    assert result["gravel"] == 20.0
    assert result["dirt"] == 20.0


def test_surface_breakdown_returns_none_when_no_details():
    """Surface breakdown returns None when no surface details are present."""
    assert _calculate_surface_breakdown({}) is None
    assert _calculate_surface_breakdown({"details": {}}) is None
    assert _calculate_surface_breakdown({"details": {"surface": []}}) is None


def test_surface_breakdown_single_surface():
    """Surface breakdown handles a route with a single surface type."""
    path = {
        "details": {
            "surface": [[0, 50, "asphalt"]],
        }
    }
    result = _calculate_surface_breakdown(path)
    assert result == {"asphalt": 100.0}


def test_surface_breakdown_normalizes_case():
    """Surface types are lowercased for consistency."""
    path = {
        "details": {
            "surface": [
                [0, 30, "ASPHALT"],
                [30, 50, "Gravel"],
            ]
        }
    }
    result = _calculate_surface_breakdown(path)
    assert result is not None
    assert "asphalt" in result
    assert "gravel" in result


def test_surface_breakdown_sorted_by_percentage():
    """Surface breakdown is sorted by percentage descending."""
    path = {
        "details": {
            "surface": [
                [0, 10, "dirt"],
                [10, 80, "asphalt"],
                [80, 100, "gravel"],
            ]
        }
    }
    result = _calculate_surface_breakdown(path)
    assert result is not None
    keys = list(result.keys())
    assert keys[0] == "asphalt"  # 70%
    assert keys[1] == "gravel"   # 20%
    assert keys[2] == "dirt"     # 10%


def test_parse_route_includes_surface_breakdown():
    """_parse_route includes surface_breakdown from GraphHopper response."""
    data = {
        "paths": [
            {
                "points": {
                    "coordinates": [[11.5, 48.1, 500], [11.51, 48.11, 510]],
                },
                "distance": 5000,
                "ascend": 100,
                "descend": 80,
                "time": 1200000,
                "details": {
                    "surface": [
                        [0, 1, "asphalt"],
                        [1, 2, "gravel"],
                    ]
                },
            }
        ]
    }
    option = _parse_route(data, seed=0, sport="RUN")
    assert option is not None
    assert option.surface_breakdown is not None
    assert option.surface_breakdown["asphalt"] == 50.0
    assert option.surface_breakdown["gravel"] == 50.0


def test_parse_route_surface_breakdown_none_without_details():
    """_parse_route returns None surface_breakdown when no surface details."""
    data = {
        "paths": [
            {
                "points": {
                    "coordinates": [[11.5, 48.1, 500], [11.51, 48.11, 510]],
                },
                "distance": 5000,
                "ascend": 100,
                "descend": 80,
                "time": 1200000,
                "details": {},
            }
        ]
    }
    option = _parse_route(data, seed=0, sport="RUN")
    assert option is not None
    assert option.surface_breakdown is None
