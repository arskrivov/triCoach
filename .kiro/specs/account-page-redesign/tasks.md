# Implementation Plan: Account Page Redesign

## Overview

Rename Settings to Account, extend the backend API to expose `weekly_training_hours`, `field_sources`, and `garmin_values`, then redesign the frontend athlete profile card with logical sections, source badges, and Garmin-derived context hints. Implementation proceeds bottom-up: extract and test the pure `merge_profile_fields` function first, update API schemas, then move the frontend page to `/account`, rebuild the profile card with sections and source indicators, and wire everything together.

## Tasks

- [x] 1. Extract `merge_profile_fields` pure function and update backend models
  - [x] 1.1 Extract `merge_profile_fields` into `backend/app/services/athlete_profile.py`
    - Extract the merge loop from `get_effective_athlete_profile` into a standalone pure function
    - Signature: `merge_profile_fields(manual, derived_values, profile_fields, default_mobility_target) -> (effective_values, field_sources, garmin_values)`
    - `garmin_values` always contains the derived value for every field regardless of manual overrides
    - Merge priority: manual (not None) → garmin-derived (not None) → default
    - Special case: `mobility_sessions_per_week_target` defaults to 2 when no manual value
    - Update `get_effective_athlete_profile` to call `merge_profile_fields` and populate `garmin_values` on the returned model
    - _Requirements: 2.4, 2.5, 5.1, 5.2_

  - [x] 1.2 Add `garmin_values` field to `EffectiveAthleteProfile` model
    - Add `garmin_values: dict[str, float | int | None] = Field(default_factory=dict)` to the Pydantic model
    - _Requirements: 5.1, 5.2_

  - [x] 1.3 Update `AthleteProfileSchema` response model in `backend/app/routers/activities.py`
    - Add `weekly_training_hours: float | None` field
    - Add `field_sources: dict[str, str]` field
    - Add `garmin_values: dict[str, float | int | None]` field
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 5.1_

  - [x] 1.4 Update `AthleteProfileUpdate` request model in `backend/app/routers/activities.py`
    - Add `weekly_training_hours: float | None = None` field
    - _Requirements: 2.3_

  - [x] 1.5 Write property test: Field sources completeness and validity
    - **Property 1: Field sources completeness and validity**
    - For any combination of manual profile values and Garmin-derived values, `merge_profile_fields` returns a `field_sources` dict with an entry for every field in `PROFILE_FIELDS`, and every value is one of `"manual"`, `"garmin"`, or `"default"`
    - Test file: `backend/tests/test_athlete_profile_properties.py`
    - **Validates: Requirements 2.4**

  - [x] 1.6 Write property test: Garmin values completeness and correctness
    - **Property 2: Garmin values completeness and correctness**
    - For any combination of manual profile values and Garmin-derived values, `merge_profile_fields` returns a `garmin_values` dict with an entry for every field in `PROFILE_FIELDS`, and each entry equals the corresponding Garmin-derived input value (or None when no Garmin-derived value was provided)
    - Test file: `backend/tests/test_athlete_profile_properties.py`
    - **Validates: Requirements 5.1**

  - [x] 1.7 Write property test: Merge priority correctness
    - **Property 3: Merge priority correctness**
    - When manual value is not None → effective value equals manual, source is `"manual"`
    - When manual is None and derived is not None → effective value equals derived, source is `"garmin"`
    - When both are None → source is `"default"`
    - Special case: `mobility_sessions_per_week_target` uses default value 2 when no manual value, source `"default"`
    - Test file: `backend/tests/test_athlete_profile_properties.py`
    - **Validates: Requirements 2.4, 2.5, 5.1**

  - [x] 1.8 Write unit tests for updated API schemas
    - Verify `AthleteProfileSchema` includes `weekly_training_hours`, `field_sources`, `garmin_values`
    - Verify `AthleteProfileUpdate` includes `weekly_training_hours`
    - Verify merge with all-None inputs returns all sources as `"default"` and garmin_values all None
    - Test file: `backend/tests/test_athlete_profile_properties.py`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Checkpoint — Ensure all backend tests pass
  - Run `cd backend && pytest tests/test_athlete_profile_properties.py -v` and ensure all property-based and unit tests pass. Ask the user if questions arise.

- [x] 3. Update frontend types and rename navigation
  - [x] 3.1 Update `AthleteProfile` type in `frontend/lib/types.ts`
    - Add `field_sources: Record<string, "manual" | "garmin" | "default">` field
    - Add `garmin_values: Record<string, number | null>` field
    - _Requirements: 2.4, 5.1_

  - [x] 3.2 Update navigation in `frontend/app/(app)/layout.tsx`
    - Change the NAV_ITEMS entry from `{ href: "/settings", label: "Settings", icon: "⚙️" }` to `{ href: "/account", label: "Account", icon: "⚙️" }`
    - _Requirements: 1.1_

- [x] 4. Create Account page and Settings redirect
  - [x] 4.1 Create `frontend/app/(app)/account/page.tsx`
    - Render the page with title "Account"
    - Import and render `AthleteProfileCard` and `GarminConnectCard`
    - _Requirements: 1.2, 8.1, 8.2_

  - [x] 4.2 Move `garmin-connect-card.tsx` to `frontend/app/(app)/account/garmin-connect-card.tsx`
    - Move the existing Garmin connect card component to the new account directory
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 4.3 Replace `frontend/app/(app)/settings/page.tsx` with a redirect to `/account`
    - Use Next.js `redirect("/account")` from `next/navigation`
    - Remove the old settings page content
    - Delete `frontend/app/(app)/settings/athlete-profile-card.tsx` (will be replaced by the new version in account/)
    - _Requirements: 1.3_

- [x] 5. Redesign AthleteProfileCard with sections and source indicators
  - [x] 5.1 Create `frontend/app/(app)/account/athlete-profile-card.tsx` with section-based layout
    - Define `SECTIONS` config array with five sections: "Training Preferences", "Endurance Thresholds", "Heart Rate", "Strength", "Body"
    - Each section contains the correct fields per requirements:
      - Training Preferences: `weekly_training_hours`, `mobility_sessions_per_week_target`
      - Endurance Thresholds: `ftp_watts`, `threshold_pace_sec_per_km`, `swim_css_sec_per_100m`
      - Heart Rate: `max_hr`, `resting_hr`
      - Strength: `squat_1rm_kg`, `deadlift_1rm_kg`, `bench_1rm_kg`, `overhead_press_1rm_kg`
      - Body: `weight_kg`
    - Each section renders a heading label
    - Fields render in a responsive grid (multi-column on sm+, single-column on mobile)
    - All interactive elements have minimum 44×44px touch targets
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 9.1, 9.2, 9.3_

  - [x] 5.2 Implement `SourceBadge` component and field source indicators
    - Create inline `SourceBadge` component using shadcn/ui `Badge`
    - "Manual" → `variant="default"` (primary color)
    - "Garmin" → `variant="outline"` with teal/cyan tint (`border-teal-500/50 text-teal-600 dark:text-teal-400`)
    - "Default" → `variant="secondary"` (muted)
    - Display the appropriate badge next to each field label based on `field_sources`
    - Use optional chaining with fallback: `profile.field_sources?.[key] ?? "default"`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 5.3 Implement Garmin-derived context hints and input pre-filling
    - When source is `"manual"` and `garmin_values[key]` is non-null, show "Garmin: {value}{unit}" as `text-xs text-muted-foreground` below the input
    - When source is `"garmin"`, display the Garmin-derived value as the input's current value
    - When no Garmin-derived value and no manual override, display empty input with placeholder dash
    - Use optional chaining: `profile.garmin_values?.[key] ?? null`
    - _Requirements: 5.3, 5.4, 5.5, 6.1_

  - [x] 5.4 Implement save behavior with feedback
    - Save button submits all editable fields to `PUT /activities/profile/athlete`
    - On success: display transient "Saved!" message for at least 2 seconds
    - On failure: display error message describing the failure
    - While saving: disable save button and show "Saving…" loading indicator
    - Clearing a field (setting to empty) sends null to remove manual override
    - _Requirements: 6.2, 6.3, 7.1, 7.2, 7.3, 7.4_

  - [x] 5.5 Write unit tests for AthleteProfileCard sections and source badges
    - Verify SECTIONS config contains five sections with correct fields per Req 3.2–3.6
    - Verify SourceBadge renders correct label and variant for each source type
    - Verify Garmin context hint renders when source is "manual" and garmin_value exists
    - Verify empty field shows placeholder when source is "default" and value is null
    - Test file: `frontend/app/(app)/account/__tests__/athlete-profile-card.test.tsx`
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 5.3, 5.5_

- [x] 6. Checkpoint — Verify build and integration
  - Run `cd frontend && npm run build` to verify the production build succeeds with no errors
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the pure `merge_profile_fields` function using Hypothesis (already in backend dev dependencies)
- No database schema changes required — `weekly_training_hours` already exists in the `athlete_profile` table; `field_sources`, `garmin_values` are computed at query time
- The design specifies Python for backend and TypeScript for frontend throughout
