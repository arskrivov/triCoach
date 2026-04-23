from app.services.route_generator import _build_route_payload, _custom_model_for_sport


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
