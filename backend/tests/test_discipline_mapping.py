from app.services.discipline_mapping import VALID_DISCIPLINES, normalize_discipline


def test_normalize_discipline_maps_common_ai_aliases():
    assert normalize_discipline("cycling") == "RIDE_ROAD"
    assert normalize_discipline("bike") == "RIDE_ROAD"
    assert normalize_discipline("gravel bike") == "RIDE_GRAVEL"
    assert normalize_discipline("swimming") == "SWIM"
    assert normalize_discipline("running") == "RUN"
    assert normalize_discipline("strength training") == "STRENGTH"
    assert normalize_discipline("gym") == "STRENGTH"
    assert normalize_discipline("stretching") == "MOBILITY"
    assert normalize_discipline("pilates") == "YOGA"


def test_normalize_discipline_preserves_valid_values():
    for discipline in VALID_DISCIPLINES:
        assert normalize_discipline(discipline) == discipline


def test_normalize_discipline_falls_back_to_requested_default():
    assert normalize_discipline("unknown sport", fallback="SWIM") == "SWIM"
    assert normalize_discipline(None, fallback="STRENGTH") == "STRENGTH"
