# Tasks

## Task 1: Fix data timing in `_format_health_for_prompt`

- [x] 1.1 Add `is_today: bool = False` parameter to `_format_health_for_prompt` in `backend/app/services/dashboard.py`. When `is_today=True`, set `steps` and `daily_calories` to `None` in the returned dict. When `is_today=False` (default), preserve existing behavior.
- [x] 1.2 Update `_build_daily_prompt_digest` to pass `is_today=True` to `_format_health_for_prompt` when the current day in the loop equals `local_date` (today).
- [x] 1.3 Write property test (Property 1) in `backend/tests/test_briefing_properties.py` using Hypothesis: for any `DailyHealthRow`, `_format_health_for_prompt(health, is_today=True)` returns `steps=None` and `daily_calories=None` while preserving recovery metrics; `_format_health_for_prompt(health, is_today=False)` preserves all fields.

## Task 2: Add recency weights to the daily digest

- [x] 2.1 Add a `_compute_recency_weights(num_days: int = 7) -> list[float]` helper function in `backend/app/services/dashboard.py` that returns exponentially decaying weights summing to 1.0 with yesterday receiving at least 0.25.
- [x] 2.2 Update `_build_daily_prompt_digest` to call `_compute_recency_weights()` and add a `recency_weight` field to each day's dict entry in the digest.
- [x] 2.3 Write property test (Property 4) in `backend/tests/test_briefing_properties.py`: for any digest, every entry has `recency_weight`, all weights sum to 1.0 (±0.01), and yesterday's weight is ≥ 0.25.

## Task 3: Include planned workouts in the AI prompt

- [x] 3.1 Add `planned_workouts: list[dict[str, Any]] | None = None` parameter to `_build_ai_prompt` in `backend/app/services/dashboard.py`. Include `planned_workouts_today` key in the JSON payload.
- [x] 3.2 Add `planned_workouts: list[dict[str, Any]] | None = None` parameter to `_generate_briefing`. Pass it through to `_build_ai_prompt`.
- [x] 3.3 Update `build_dashboard_overview` to filter `upcoming_workouts` for today's date and pass the result as `planned_workouts` to `_generate_briefing` (and through `_resolve_briefing`).
- [x] 3.4 Write property test (Property 3) in `backend/tests/test_briefing_properties.py`: for any list of planned workout dicts, `_build_ai_prompt` output JSON contains a `planned_workouts_today` array matching the input.

## Task 4: Upgrade the system prompt

- [x] 4.1 Rewrite the `instructions` string in `_generate_briefing` to establish a triathlon-focused coaching persona covering swim/bike/run/strength/mobility, with cross-discipline impact awareness, evidence-based science grounding, and prohibition of generic advice.
- [x] 4.2 Add instructions for interpretive analysis style: explain physiological significance of metrics, connect related metrics across domains, ground each recommendation in specific data points, prohibit generic wellness filler.
- [x] 4.3 Add instructions for structured output: exactly 4 recommendations (at least one recovery, one training), mandatory non-null `caution` field, internal coherence across all recommendations and the watchout.
- [x] 4.4 Add instructions for recency weighting: direct the model to weight analysis according to each day's `recency_weight`, treating yesterday as primary signal.
- [x] 4.5 Add instructions for planned workout awareness: direct the model to factor today's planned workouts into recommendations.
- [x] 4.6 Write unit tests in `backend/tests/test_dashboard_helpers.py` verifying the system prompt string contains key phrases for: triathlon persona, cross-discipline impact, evidence-based science, 4 recommendations, mandatory caution, no generic filler, recency weighting, planned workouts.

## Task 5: Restructure the heuristic fallback

- [x] 5.1 Refactor `_heuristic_briefing` in `backend/app/services/dashboard.py` to always produce exactly 4 recommendations with at least one recovery-focused and one training-focused recommendation. Add default recommendations to fill gaps when specific metric thresholds don't trigger enough items.
- [x] 5.2 Update `_heuristic_briefing` to always populate the `caution` field with a relevant watchout derived from recovery and activity status (never return `None`).
- [x] 5.3 Write property test (Property 8) in `backend/tests/test_briefing_properties.py`: for any overview dict, `_heuristic_briefing` returns exactly 4 recommendations and a non-null, non-empty `caution` string.

## Task 6: Harden the AI response parser

- [x] 6.1 Update `_parse_ai_briefing` in `backend/app/services/dashboard.py` to pad recommendations from the fallback when the AI returns fewer than 4, and truncate to 4 when more than 4.
- [x] 6.2 Update `_parse_ai_briefing` to substitute `fallback["caution"]` when the AI response's `caution` is null, empty string, or missing.
- [x] 6.3 Write property test (Property 5) in `backend/tests/test_briefing_properties.py`: for any JSON with a recommendations array of any length, `_parse_ai_briefing` returns exactly 4 recommendations.
- [x] 6.4 Write property test (Property 6) in `backend/tests/test_briefing_properties.py`: for any valid JSON with null/empty/missing caution and a fallback with non-null caution, `_parse_ai_briefing` returns the fallback's caution.
- [x] 6.5 Write property test (Property 7) in `backend/tests/test_briefing_properties.py`: for any non-JSON string, `_parse_ai_briefing` returns the fallback dict.

## Task 7: Training sessions preserved in digest (regression)

- [x] 7.1 Write property test (Property 2) in `backend/tests/test_briefing_properties.py`: for any set of activities on today's date, the digest entry for today includes a training dict with correct aggregated values.

## Task 8: Run all tests and verify

- [x] 8.1 Run `cd backend && pytest tests/test_briefing_properties.py tests/test_dashboard_helpers.py tests/test_dashboard_utils.py -v` and verify all tests pass.
- [x] 8.2 Run `cd backend && pytest` to verify no regressions across the full test suite.
