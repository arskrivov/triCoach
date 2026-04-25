"""Property-based and unit tests for the athlete profile merge logic and API schemas.

Uses Hypothesis to verify correctness properties defined in the design document.
Each property test is tagged with the property number and the requirements it validates.
"""

from __future__ import annotations

from hypothesis import given, strategies as st
from hypothesis import settings as hyp_settings

from app.models import AthleteProfileRow
from app.services.athlete_profile import (
    DEFAULT_MOBILITY_TARGET,
    PROFILE_FIELDS,
    merge_profile_fields,
)


# ---------------------------------------------------------------------------
# Hypothesis strategies for athlete profile data generation
# ---------------------------------------------------------------------------

# Strategy for generating an AthleteProfileRow with each numeric field
# independently None or a valid number.
_athlete_profile_row_strategy = st.builds(
    AthleteProfileRow,
    id=st.just("test-id"),
    user_id=st.just("test-user"),
    ftp_watts=st.one_of(st.none(), st.integers(min_value=80, max_value=500)),
    threshold_pace_sec_per_km=st.one_of(st.none(), st.floats(min_value=150.0, max_value=480.0, allow_nan=False, allow_infinity=False)),
    swim_css_sec_per_100m=st.one_of(st.none(), st.floats(min_value=50.0, max_value=300.0, allow_nan=False, allow_infinity=False)),
    max_hr=st.one_of(st.none(), st.integers(min_value=120, max_value=240)),
    resting_hr=st.one_of(st.none(), st.integers(min_value=30, max_value=100)),
    weight_kg=st.one_of(st.none(), st.floats(min_value=40.0, max_value=200.0, allow_nan=False, allow_infinity=False)),
    squat_1rm_kg=st.one_of(st.none(), st.floats(min_value=20.0, max_value=400.0, allow_nan=False, allow_infinity=False)),
    deadlift_1rm_kg=st.one_of(st.none(), st.floats(min_value=20.0, max_value=500.0, allow_nan=False, allow_infinity=False)),
    bench_1rm_kg=st.one_of(st.none(), st.floats(min_value=20.0, max_value=300.0, allow_nan=False, allow_infinity=False)),
    overhead_press_1rm_kg=st.one_of(st.none(), st.floats(min_value=10.0, max_value=200.0, allow_nan=False, allow_infinity=False)),
    mobility_sessions_per_week_target=st.one_of(st.just(2), st.integers(min_value=0, max_value=14)),
    weekly_training_hours=st.one_of(st.none(), st.floats(min_value=3.0, max_value=30.0, allow_nan=False, allow_infinity=False)),
)

# Strategy for manual input: either None (no manual profile) or a full row
_manual_strategy = st.one_of(st.none(), _athlete_profile_row_strategy)


def _derived_values_strategy():
    """Strategy for generating a derived_values dict with each field independently None or a valid number."""
    return st.fixed_dictionaries({
        "ftp_watts": st.one_of(st.none(), st.integers(min_value=80, max_value=500)),
        "threshold_pace_sec_per_km": st.one_of(st.none(), st.floats(min_value=150.0, max_value=480.0, allow_nan=False, allow_infinity=False)),
        "swim_css_sec_per_100m": st.one_of(st.none(), st.floats(min_value=50.0, max_value=300.0, allow_nan=False, allow_infinity=False)),
        "max_hr": st.one_of(st.none(), st.integers(min_value=120, max_value=240)),
        "resting_hr": st.one_of(st.none(), st.integers(min_value=30, max_value=100)),
        "weight_kg": st.one_of(st.none(), st.floats(min_value=40.0, max_value=200.0, allow_nan=False, allow_infinity=False)),
        "squat_1rm_kg": st.one_of(st.none(), st.floats(min_value=20.0, max_value=400.0, allow_nan=False, allow_infinity=False)),
        "deadlift_1rm_kg": st.one_of(st.none(), st.floats(min_value=20.0, max_value=500.0, allow_nan=False, allow_infinity=False)),
        "bench_1rm_kg": st.one_of(st.none(), st.floats(min_value=20.0, max_value=300.0, allow_nan=False, allow_infinity=False)),
        "overhead_press_1rm_kg": st.one_of(st.none(), st.floats(min_value=10.0, max_value=200.0, allow_nan=False, allow_infinity=False)),
        "mobility_sessions_per_week_target": st.one_of(st.none(), st.integers(min_value=0, max_value=14)),
        "weekly_training_hours": st.one_of(st.none(), st.floats(min_value=3.0, max_value=30.0, allow_nan=False, allow_infinity=False)),
    })


# ---------------------------------------------------------------------------
# Property 1: Field sources completeness and validity
# Feature: account-page-redesign, Property 1: Field sources completeness and validity
# **Validates: Requirements 2.4**
# ---------------------------------------------------------------------------


class TestProperty1FieldSourcesCompletenessAndValidity:
    """For any combination of manual profile values and Garmin-derived values,
    merge_profile_fields returns a field_sources dict with an entry for every
    field in PROFILE_FIELDS, and every value is one of "manual", "garmin", or
    "default"."""

    @given(manual=_manual_strategy, derived_values=_derived_values_strategy())
    @hyp_settings(max_examples=100)
    def test_field_sources_has_entry_for_every_profile_field(self, manual, derived_values):
        """field_sources contains exactly the fields in PROFILE_FIELDS."""
        _, field_sources, _ = merge_profile_fields(manual, derived_values)

        for field in PROFILE_FIELDS:
            assert field in field_sources, (
                f"field_sources missing entry for '{field}'"
            )

    @given(manual=_manual_strategy, derived_values=_derived_values_strategy())
    @hyp_settings(max_examples=100)
    def test_field_sources_values_are_valid(self, manual, derived_values):
        """Every field_sources value is one of 'manual', 'garmin', or 'default'."""
        _, field_sources, _ = merge_profile_fields(manual, derived_values)

        valid_sources = {"manual", "garmin", "default"}
        for field, source in field_sources.items():
            assert source in valid_sources, (
                f"field_sources['{field}'] = '{source}' is not one of {valid_sources}"
            )


# ---------------------------------------------------------------------------
# Property 2: Garmin values completeness and correctness
# Feature: account-page-redesign, Property 2: Garmin values completeness and correctness
# **Validates: Requirements 5.1**
# ---------------------------------------------------------------------------


class TestProperty2GarminValuesCompletenessAndCorrectness:
    """For any combination of manual profile values and Garmin-derived values,
    merge_profile_fields returns a garmin_values dict with an entry for every
    field in PROFILE_FIELDS, and each entry equals the corresponding
    Garmin-derived input value (or None when no Garmin-derived value was
    provided)."""

    @given(manual=_manual_strategy, derived_values=_derived_values_strategy())
    @hyp_settings(max_examples=100)
    def test_garmin_values_has_entry_for_every_profile_field(self, manual, derived_values):
        """garmin_values contains exactly the fields in PROFILE_FIELDS."""
        _, _, garmin_values = merge_profile_fields(manual, derived_values)

        for field in PROFILE_FIELDS:
            assert field in garmin_values, (
                f"garmin_values missing entry for '{field}'"
            )

    @given(manual=_manual_strategy, derived_values=_derived_values_strategy())
    @hyp_settings(max_examples=100)
    def test_garmin_values_equal_derived_input(self, manual, derived_values):
        """Each garmin_values entry equals the corresponding derived input value
        (or None when no derived value was provided)."""
        _, _, garmin_values = merge_profile_fields(manual, derived_values)

        for field in PROFILE_FIELDS:
            expected = derived_values.get(field)
            actual = garmin_values[field]
            assert actual == expected, (
                f"garmin_values['{field}'] = {actual}, expected {expected} "
                f"(from derived_values)"
            )


# ---------------------------------------------------------------------------
# Property 3: Merge priority correctness
# Feature: account-page-redesign, Property 3: Merge priority correctness
# **Validates: Requirements 2.4, 2.5, 5.1**
# ---------------------------------------------------------------------------


class TestProperty3MergePriorityCorrectness:
    """For any profile field and any combination of manual and Garmin-derived
    values:
    - When manual is not None → effective equals manual, source is "manual"
    - When manual is None and derived is not None → effective equals derived,
      source is "garmin"
    - When both are None → source is "default"
    - Special case: mobility_sessions_per_week_target uses default value 2
      when no manual value, source "default"
    """

    @given(manual=_athlete_profile_row_strategy, derived_values=_derived_values_strategy())
    @hyp_settings(max_examples=100)
    def test_manual_value_takes_priority(self, manual, derived_values):
        """When manual value is not None, effective equals manual and source is 'manual'."""
        effective_values, field_sources, _ = merge_profile_fields(manual, derived_values)

        for field in PROFILE_FIELDS:
            manual_value = getattr(manual, field)
            if manual_value is not None:
                assert effective_values[field] == manual_value, (
                    f"Field '{field}': effective={effective_values[field]}, "
                    f"expected manual={manual_value}"
                )
                assert field_sources[field] == "manual", (
                    f"Field '{field}': source='{field_sources[field]}', expected 'manual'"
                )

    @given(derived_values=_derived_values_strategy())
    @hyp_settings(max_examples=100)
    def test_garmin_derived_used_when_no_manual(self, derived_values):
        """When manual is None and derived is not None, effective equals derived
        and source is 'garmin'."""
        effective_values, field_sources, _ = merge_profile_fields(None, derived_values)

        for field in PROFILE_FIELDS:
            derived = derived_values.get(field)
            if field == "mobility_sessions_per_week_target":
                # Special case: always defaults, never uses garmin
                continue
            if derived is not None:
                assert effective_values[field] == derived, (
                    f"Field '{field}': effective={effective_values[field]}, "
                    f"expected derived={derived}"
                )
                assert field_sources[field] == "garmin", (
                    f"Field '{field}': source='{field_sources[field]}', expected 'garmin'"
                )

    @given(derived_values=_derived_values_strategy())
    @hyp_settings(max_examples=100)
    def test_default_when_both_none(self, derived_values):
        """When both manual and derived are None, source is 'default'."""
        effective_values, field_sources, _ = merge_profile_fields(None, derived_values)

        for field in PROFILE_FIELDS:
            derived = derived_values.get(field)
            if field == "mobility_sessions_per_week_target":
                # Special case handled separately
                continue
            if derived is None:
                assert field_sources[field] == "default", (
                    f"Field '{field}': source='{field_sources[field]}', expected 'default'"
                )
                assert effective_values[field] is None, (
                    f"Field '{field}': effective={effective_values[field]}, expected None"
                )

    @given(manual=_manual_strategy, derived_values=_derived_values_strategy())
    @hyp_settings(max_examples=100)
    def test_mobility_target_special_case(self, manual, derived_values):
        """mobility_sessions_per_week_target uses default value 2 when no manual
        value is set, with source 'default'."""
        effective_values, field_sources, _ = merge_profile_fields(manual, derived_values)

        field = "mobility_sessions_per_week_target"
        manual_value = getattr(manual, field) if manual else None

        if manual_value is not None:
            assert effective_values[field] == manual_value, (
                f"mobility_sessions_per_week_target: effective={effective_values[field]}, "
                f"expected manual={manual_value}"
            )
            assert field_sources[field] == "manual", (
                f"mobility_sessions_per_week_target: source='{field_sources[field]}', "
                f"expected 'manual'"
            )
        else:
            assert effective_values[field] == DEFAULT_MOBILITY_TARGET, (
                f"mobility_sessions_per_week_target: effective={effective_values[field]}, "
                f"expected default={DEFAULT_MOBILITY_TARGET}"
            )
            assert field_sources[field] == "default", (
                f"mobility_sessions_per_week_target: source='{field_sources[field]}', "
                f"expected 'default'"
            )


# ---------------------------------------------------------------------------
# Unit tests for updated API schemas (Task 1.8)
# Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
# ---------------------------------------------------------------------------


class TestAthleteProfileSchemas:
    """Unit tests verifying the API schemas include the required fields."""

    def test_athlete_profile_schema_has_weekly_training_hours(self):
        """AthleteProfileSchema includes weekly_training_hours field."""
        from app.routers.activities import AthleteProfileSchema

        fields = AthleteProfileSchema.model_fields
        assert "weekly_training_hours" in fields, (
            "AthleteProfileSchema missing 'weekly_training_hours' field"
        )

    def test_athlete_profile_schema_has_field_sources(self):
        """AthleteProfileSchema includes field_sources field."""
        from app.routers.activities import AthleteProfileSchema

        fields = AthleteProfileSchema.model_fields
        assert "field_sources" in fields, (
            "AthleteProfileSchema missing 'field_sources' field"
        )

    def test_athlete_profile_schema_has_garmin_values(self):
        """AthleteProfileSchema includes garmin_values field."""
        from app.routers.activities import AthleteProfileSchema

        fields = AthleteProfileSchema.model_fields
        assert "garmin_values" in fields, (
            "AthleteProfileSchema missing 'garmin_values' field"
        )

    def test_athlete_profile_update_has_weekly_training_hours(self):
        """AthleteProfileUpdate includes weekly_training_hours field."""
        from app.routers.activities import AthleteProfileUpdate

        fields = AthleteProfileUpdate.model_fields
        assert "weekly_training_hours" in fields, (
            "AthleteProfileUpdate missing 'weekly_training_hours' field"
        )

    def test_merge_all_none_returns_default_sources(self):
        """When manual is None and all derived values are None, all sources
        are 'default' and garmin_values are all None."""
        derived_values = {field: None for field in PROFILE_FIELDS}
        effective_values, field_sources, garmin_values = merge_profile_fields(
            None, derived_values
        )

        for field in PROFILE_FIELDS:
            assert field_sources[field] == "default", (
                f"field_sources['{field}'] = '{field_sources[field]}', expected 'default'"
            )
            assert garmin_values[field] is None, (
                f"garmin_values['{field}'] = {garmin_values[field]}, expected None"
            )

        # mobility_sessions_per_week_target should have the default value
        assert effective_values["mobility_sessions_per_week_target"] == DEFAULT_MOBILITY_TARGET

        # All other fields should be None
        for field in PROFILE_FIELDS:
            if field != "mobility_sessions_per_week_target":
                assert effective_values[field] is None, (
                    f"effective_values['{field}'] = {effective_values[field]}, expected None"
                )
