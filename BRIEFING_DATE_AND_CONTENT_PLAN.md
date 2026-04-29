# Briefing Date And Content Plan

## Goal

Fix the dashboard coach readout so that:

1. For a given local date, such as `2026-04-29`, it uses:
   - the overnight recovery row stored for `2026-04-29`
   - only planned workouts whose `scheduled_date` is exactly `2026-04-29`
2. Cached briefings are invalidated when the planned workouts for that date change.
3. The rendered briefing is less repetitive and reads as:
   - summary
   - suggestions
   - watchout

## Current Findings

### Date selection looks mostly correct today

In `backend/app/services/dashboard.py`:

- `today_health` is selected with `row.date == today.isoformat()`
- `today_activities` are selected with `_activity_local_date(activity.start_time, tz) == today`
- `today_planned` is selected from `upcoming_workouts` with `scheduled_date == today.isoformat()`

That `today_planned` step is functionally close, but it is derived from the already-truncated `upcoming_workouts` list. The safer implementation is to derive same-day planned workouts directly from the full workout set for the local date, not from the 6-item dashboard subset.

That means the intended rule for `2026-04-29` is already:

- use the `daily_health` row dated `2026-04-29`
- use only planned workouts dated `2026-04-29`

### The briefing cache is missing planned workouts

`_today_data_signature()` currently hashes:

- briefing date
- timezone
- today health fields
- today activities

But it does **not** hash today’s planned workouts.

Result:

- if the workout plan for `2026-04-29` changes later that morning, the cached daily briefing for `2026-04-29` can still be reused
- that stale cached text can mention workouts that are no longer scheduled for that date

This is the most likely cause of the incorrect workout names you saw.

### The AI prompt/output shape invites repetition

Current prompt asks for:

- separate `sleep_analysis`
- separate `activity_analysis`
- exactly 4 recommendations
- one caution

Current UI in `frontend/app/(app)/dashboard/coach-briefing-card.tsx` mainly surfaces:

- the recommendations list
- the caution

This has two bad effects:

- the AI is encouraged to produce multiple recommendation bullets that all repeat the same recovery limitation
- the UI hides the more useful narrative summary and over-emphasizes the repetitive recommendation list

## Proposed Approach

### 1. Fix correctness first: include planned workouts in the briefing signature

Update `_today_data_signature()` to also include the exact list of planned workouts for that local date.

Signature input should include, for each planned workout on the local date:

- `id`
- `discipline`
- `scheduled_date`
- `estimated_duration_seconds`
- `estimated_tss`

Reason:

- if the April 29 planned workout set changes, the April 29 briefing must regenerate
- this is the cleanest fix for stale workout references

### 2. Build a dedicated same-day planned-workout payload for the briefing

Add a small helper that selects planned workouts for the exact local date directly from the full workout set.

That helper should be used for:

- prompt input
- signature input
- tests for same-day filtering

Reason:

- avoid hidden dependence on the truncated dashboard upcoming list
- make the “April 29 means exactly April 29” rule explicit and testable

### 3. Make the prompt stricter and remove workout names from the AI payload

Update `BRIEFING_SYSTEM_PROMPT` so it explicitly says:

- `planned_workouts_today` is the full and only set of workouts scheduled exactly on the briefing date
- summarize planned workouts by discipline / load / duration, not by title
- do not invent workout names
- if there are multiple workouts today, summarize by type or intensity instead of repeating each workout separately
- suggestions must be non-overlapping and should not restate the same recovery warning in multiple bullets

Also sanitize the prompt payload so `planned_workouts_today` contains only the fields the model actually needs:

- `discipline`
- `estimated_duration_seconds`
- `estimated_tss`

Reason:

- even with a correct cache, the model should not have unnecessary title text to repeat or misuse
- this is a cleaner fix than trying to regex-filter every wrong workout name after generation

### 4. Simplify the content shape without changing the API contract more than necessary

Keep the existing briefing fields for compatibility:

- `sleep_analysis`
- `activity_analysis`
- `recommendations`
- `caution`

But change the briefing generation rules to behave like:

- `sleep_analysis`: concise recovery summary
- `activity_analysis`: concise training context summary
- `recommendations`: 2-3 non-overlapping suggestions instead of a padded 4-item list
- `caution`: unchanged watchout sentence

Reason:

- this avoids a larger type/API migration
- the frontend can combine `sleep_analysis` and `activity_analysis` into a “Summary” section
- `recommendations` can be relabeled as “Suggestions”

### 5. Update heuristic fallback and AI parser to match the simpler structure

Adjust:

- `_heuristic_briefing()` to produce a short summary plus 2-3 suggestions
- `_parse_ai_briefing()` to accept any length but normalize to 2-3 suggestions

Guardrails:

- no filler padding to 4
- no duplicate-ish fallback padding behavior
- keep mandatory non-empty caution

### 6. Update the dashboard card layout

Refactor `CoachBriefingCard` to render:

- `Summary`
  - recovery summary from `sleep_analysis`
  - training context from `activity_analysis`
- `Suggestions`
  - short list from `recommendations`
- `Watchout`
  - caution

Reason:

- this matches the requested presentation better than a numbered “Today’s Plan” list

## Tests To Add Or Update

### Backend

- `_today_data_signature()` changes when same-day planned workouts change
- same-day planned-workout helper includes only workouts scheduled on the exact local date
- prompt payload for `planned_workouts_today` contains sanitized same-day workout summaries, not names
- prompt content tests updated from “exactly 4 recommendations” to “2-3 non-overlapping suggestions”
- parser/heuristic property tests updated to the new recommendation count rules

### Frontend

- `CoachBriefingCard` renders summary, suggestions, and watchout
- old repetitive recommendation-only presentation is removed

## Risks

- Changing recommendation count touches several existing property tests.
- If we only change the prompt and not the signature, stale wrong workout names can still persist.
- If we only change the UI and not the generator, repetitive content remains, just with different headings.

## Guardrails

- Fix cache correctness first.
- Keep local-date filtering explicit and test-backed.
- Keep API shape stable unless a stronger reason appears during implementation.
- Prefer small backend/frontend changes over a full briefing-schema redesign.

## Acceptance Criteria

- On local date `2026-04-29`, the briefing only references workouts scheduled on `2026-04-29`.
- If planned workouts for `2026-04-29` change, the `2026-04-29` briefing regenerates.
- The dashboard card reads as summary + suggestions + watchout.
- Suggestions are shorter and less repetitive than the current 4-item output.
