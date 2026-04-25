# Implementation Plan: Activity Detail Insights

## Overview

This plan implements the activity detail insights feature across three areas: (1) enhanced activity feed with 7-day default view, (2) expanded activity detail with grouped metric sections and AI analysis, and (3) backend support including expanded response models and a new AI analysis endpoint. Tasks are ordered for incremental progress — backend models first, then frontend types/formatters, then UI components, then AI integration.

## Tasks

- [x] 1. Expand backend ActivityDetail response model and ActivitySummary select query
  - [x] 1.1 Add new fields to `ActivityDetail` Pydantic model in `backend/app/routers/activities.py`
    - Add `max_hr: int | None`, `normalized_power_watts: int | None`, `avg_cadence: int | None`, `intensity_factor: float | None`, `aerobic_training_effect: float | None`, `anaerobic_training_effect: float | None`, `training_effect_label: str | None`, and `ai_analyzed_at: str | None` to the `ActivityDetail` class
    - The `GET /activities/{id}` endpoint already does `select("*")`, so no query change needed — only the Pydantic model needs updating
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 1.2 Update `ActivitySummary` select query to include training effect fields
    - Add `aerobic_training_effect`, `anaerobic_training_effect`, `training_effect_label` to the select string in the `list_activities` endpoint
    - These fields are already on `ActivitySummary` in the frontend types but need to be returned by the backend list query
    - _Requirements: 2.1, 2.2_

  - [x] 1.3 Write property test for ActivityDetail field preservation (Property 4)
    - **Property 4: Response model preserves all fields including nulls**
    - Generate random activity data dicts with the new fields (including None values), serialize through `ActivityDetail`, and verify all fields are preserved with null values present (not omitted)
    - Add test to `backend/tests/test_activity_detail_properties.py`
    - Use Hypothesis `st.builds` pattern matching `test_briefing_properties.py`
    - **Validates: Requirements 3.1, 3.3**

- [x] 2. Update frontend TypeScript types and add format helpers
  - [x] 2.1 Expand `ActivityDetail` interface in `frontend/lib/types.ts`
    - Add `max_hr: number | null`, `normalized_power_watts: number | null`, `avg_cadence: number | null`, `intensity_factor: number | null`, `aerobic_training_effect: number | null`, `anaerobic_training_effect: number | null`, `training_effect_label: string | null`, and `ai_analyzed_at: string | null` to the `ActivityDetail` interface
    - Verify `ActivitySummary` already includes `calories` (it does — already present)
    - _Requirements: 8.1, 8.6_

  - [x] 2.2 Add `formatSpeed`, `formatCadence`, `formatPower`, and `formatHRZones` to `frontend/lib/format.ts`
    - `formatSpeed(secPerKm: number | null): string` — converts pace (sec/km) to speed (km/h) via `3600 / pace`, formatted to 1 decimal with "km/h" suffix; returns "—" for null/zero
    - `formatCadence(value: number | null, discipline: Discipline): string` — appends "spm" for RUN, "rpm" for RIDE_ROAD/RIDE_GRAVEL; returns "—" for null
    - `formatPower(watts: number | null): string` — formats as `"{watts} W"`; returns "—" for null
    - `formatHRZones(hrZones: unknown): HRZoneDisplay[]` — parses hr_zones JSONB, computes percentage of total duration per zone; returns empty array for null/malformed input
    - Add `HRZoneDisplay` interface: `{ zone: string; duration_seconds: number; percentage: number }`
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [x] 2.3 Write property tests for format helpers (Properties 8, 9, 10, 11)
    - Create `frontend/lib/__tests__/format-properties.test.ts`
    - **Property 8: formatSpeed converts pace to speed correctly** — for any positive pace, verify result equals `(3600 / pace).toFixed(1)` with "km/h" suffix. **Validates: Requirements 8.2**
    - **Property 9: formatCadence applies correct unit by discipline** — for any cadence value, verify "spm" for RUN and "rpm" for cycling disciplines. **Validates: Requirements 8.3**
    - **Property 10: formatPower appends watt unit** — for any non-null watt value, verify output contains the value followed by "W". **Validates: Requirements 8.4**
    - **Property 11: HR zone percentages sum to approximately 100%** — for any valid hr_zones array with positive durations, verify percentage sum is between 99.0 and 101.0. **Validates: Requirements 8.5**
    - Use fast-check with `{ numRuns: 100 }` per property
    - Install fast-check as a dev dependency if not already present

- [x] 3. Checkpoint — Ensure backend model and frontend types compile
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Enhance activity feed with 7-day default and improved cards
  - [x] 4.1 Add 7-day default mode to `frontend/app/(app)/activities/activity-feed.tsx`
    - Add `mode` state: `"recent"` (default, last 7 days) or `"all"` (existing paginated view)
    - In `"recent"` mode, pass a `since` ISO date parameter (7 days ago) to the `GET /activities` API call and hide the "Load more" button
    - Add a "Show all activities" toggle button that switches to `"all"` mode (existing paginated behavior)
    - When no activities exist in the 7-day window, show a message with the option to view all activities
    - Discipline filter pills work in both modes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 4.2 Update backend `list_activities` endpoint to support `since` query parameter
    - Add optional `since: str | None = Query(None)` parameter to `list_activities` in `backend/app/routers/activities.py`
    - When `since` is provided, add `.gte("start_time", since)` to the query
    - This keeps the endpoint backward-compatible — existing calls without `since` work as before
    - _Requirements: 1.1, 1.4_

  - [x] 4.3 Enhance `ActivityCard` with discipline-specific secondary metrics
    - For Endurance_Discipline: show distance, calories alongside existing pace/power stat
    - For STRENGTH: show total sets, total volume (kg), and calories
    - For YOGA/MOBILITY: show duration and calories
    - Always show calories when available, for all disciplines
    - Use a structured layout: discipline icon, primary info (name, date, duration), secondary stats
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 4.4 Write property tests for 7-day filter and discipline+date intersection (Properties 1, 2)
    - Create `frontend/app/(app)/activities/__tests__/activity-feed-properties.test.ts`
    - **Property 1: Seven-day filter returns only recent activities** — generate lists of activities with various start_time values, apply 7-day filter logic, verify only activities within the window are returned. **Validates: Requirements 1.1**
    - **Property 2: Combined discipline and date filter intersection** — for any list, discipline, and date range, verify filtered result matches both discipline AND date range. **Validates: Requirements 1.4**
    - Use fast-check with `{ numRuns: 100 }`

- [x] 5. Implement grouped metric sections on activity detail view
  - [x] 5.1 Add metric group components to `frontend/app/(app)/activities/[id]/activity-detail-content.tsx`
    - Create `SpeedMetricsGroup`: avg pace (for running), avg speed (derived via `formatSpeed`); shown for Endurance_Discipline activities
    - Create `HeartRateMetricsGroup`: avg HR, max HR; shown when HR data is available
    - Create `HRZoneChart`: visual bar chart of HR zone percentages using `formatHRZones`; shown within HeartRateMetricsGroup when `hr_zones` data exists
    - Create `SportSpecificMetricsGroup`: cadence (RUN via `formatCadence`), power/NP/IF (cycling via `formatPower`), sets/volume/muscles (STRENGTH); shown per discipline
    - Create `PerformanceMetricsGroup`: aerobic/anaerobic training effect, training effect label, TSS, calories; shown when training effect data exists
    - Create `ElevationMetricsGroup`: elevation gain in meters; shown for Endurance_Discipline with elevation data
    - Each group is hidden entirely when all its metrics are null
    - Keep existing `EnduranceMap` and `StrengthView` components unchanged
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 5.2 Write unit tests for metric group visibility logic
    - Test that each metric group renders when at least one metric is non-null
    - Test that each metric group is hidden when all metrics are null
    - Test discipline-specific rendering (RUN shows cadence, cycling shows power/NP/IF, STRENGTH shows sets/volume)
    - _Requirements: 4.2, 4.7, 4.9_

- [x] 6. Checkpoint — Ensure feed and detail UI render correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement backend AI activity analysis service and endpoint
  - [x] 7.1 Create `backend/app/services/activity_analysis.py` with context builder and analysis generator
    - Define `ACTIVITY_ANALYSIS_SYSTEM_PROMPT` — expert triathlon coach persona matching the dashboard briefing philosophy (specific, data-driven, no generic filler)
    - Implement `build_activity_analysis_context(activity: dict, profile: dict) -> str` — assembles all activity data into structured text: discipline, duration, distance, calories, pace/speed, lap splits, avg/max HR, HR zone percentages, avg/normalized power, intensity factor, cadence, aerobic/anaerobic training effects, elevation gain, and athlete profile thresholds
    - Implement `async generate_activity_analysis(activity: dict, profile: dict) -> str` — calls OpenAI `settings.openai_analysis_model` (gpt-4.1-mini) with the system prompt and context, returns analysis text
    - The system prompt must instruct the AI to: provide interpretive coaching insights (not restate raw numbers), ground every observation in specific data, prohibit generic filler, structure output into workout summary / key observations / next-session recommendations, and provide at least one actionable recommendation
    - Include discipline-specific evaluation instructions: cadence/pace consistency/HR drift for RUN, power consistency/variability index/IF for cycling, volume/muscle balance for STRENGTH
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 7.2 Write property test for activity context builder (Property 7)
    - **Property 7: Activity context builder includes all non-null fields**
    - Generate random activity dicts with various non-null metric fields using Hypothesis
    - Verify that `build_activity_analysis_context` output string contains a representation of each non-null field
    - Add test to `backend/tests/test_activity_detail_properties.py`
    - **Validates: Requirements 6.3**

  - [x] 7.3 Add `POST /activities/{activity_id}/analyze` endpoint to `backend/app/routers/activities.py`
    - Fetch activity and verify ownership (reuse existing pattern from `get_activity`)
    - Fetch athlete profile via `get_effective_athlete_profile`
    - Call `build_activity_analysis_context` then `generate_activity_analysis`
    - Store result in `activities.ai_analysis` and `activities.ai_analyzed_at` via Supabase update
    - Return `{ "ai_analysis": "...", "ai_analyzed_at": "..." }`
    - Handle errors: return 503 if OpenAI is unavailable, 502 if response is malformed, 404 if activity not found
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.9, 6.11_

- [x] 8. Implement AI Coach section in activity detail frontend
  - [x] 8.1 Add AI Coach section to `frontend/app/(app)/activities/[id]/activity-detail-content.tsx`
    - When `ai_analysis` is null and `ai_analyzed_at` is null: show "Analyze" button
    - When user clicks "Analyze": POST to `/activities/{id}/analyze`, show loading spinner
    - On success: update local state with returned `ai_analysis` and `ai_analyzed_at`, display the analysis
    - When `ai_analysis` exists (cached): display the analysis text with a "Re-analyze" button
    - When "Re-analyze" is clicked: repeat the POST call and update the displayed analysis
    - On error: show user-friendly error message ("Analysis could not be generated. Please try again.") with option to retry
    - Style the AI section consistently with the existing coach briefing card pattern (accent border, panel label)
    - _Requirements: 6.1, 6.2, 6.9, 6.10, 6.11_

  - [x] 8.2 Write unit tests for AI Coach section states
    - Test: "Analyze" button renders when no analysis exists
    - Test: cached analysis text displays when `ai_analysis` is present
    - Test: "Re-analyze" button renders alongside cached analysis
    - Test: loading state shows during API call
    - Test: error state renders on API failure
    - _Requirements: 6.1, 6.10, 6.11_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- No database migrations are needed — all columns already exist in the `activities` table
- Existing components (`endurance-map.tsx`, `strength-view.tsx`) are kept unchanged
- Backend property tests use Hypothesis (matching `test_briefing_properties.py` patterns)
- Frontend property tests use fast-check with vitest (matching existing test setup)
- The `GET /activities/{id}` endpoint already does `select("*")`, so new fields are automatically returned once the Pydantic model is expanded
