# Dashboard Evolution Plan

## Goal

Turn the dashboard into a daily decision surface with two primary lenses:

- Activity: what I did, what I planned, where training is trending
- Recovery: how my body responded last night, over the last few days, over the last week, and over the last 30 days

The dashboard should answer one question quickly:

"How is my body doing, how is training going, and what should I do next?"

## Product Direction

The dashboard is not a chat.

It should feel like a concise daily coach briefing:

- clear
- evidence-based
- directional
- opinionated
- actionable

Tone target:

- smart coach note
- not hype
- not generic wellness advice
- closer to Huberman / Attia style than a motivational app

## Core Dashboard Structure

### 1. Morning Coach Briefing

Top card on dashboard.

Purpose:

- summarize recovery status
- summarize training status
- connect the two
- recommend what to do today

Rules:

- generate at most once per user per calendar day
- only generate after 09:00 in the user's timezone
- when dashboard opens before 09:00, show yesterday's latest valid briefing
- when dashboard opens after 09:00 and today's briefing is missing or stale, generate it after fresh Garmin sync completes

Output format:

- Recovery status: 1 short paragraph
- Training status: 1 short paragraph
- Today suggestion: 2 to 4 bullets
- Optional caution block if recovery and load disagree strongly

### 2. Recovery Panel

Purpose:

- show whether recovery is improving, stable, or deteriorating
- focus on last night, 7d trend, and 30d baseline

Primary metrics:

- Sleep score
- Sleep duration
- HRV
- Resting heart rate
- Respiration
- Stress
- Body Battery

Secondary metrics:

- Deep / REM / light sleep composition
- Pulse Ox if available and reliable
- Overnight heart rate profile if useful

Display principle:

- emphasize trend and deviation from baseline, not raw number only

Examples:

- "HRV is down vs 7d and 30d baseline"
- "Sleep duration recovered, but respiration and resting HR suggest incomplete recovery"

### 3. Activity Panel

Purpose:

- show whether training is progressing in the intended direction
- connect completed work, load trend, and planned work

Primary metrics:

- Last 7d load
- Last 30d load
- Acute vs chronic direction
- Discipline mix
- Number of completed sessions
- Duration / distance / TSS where available
- Planned vs completed workout compliance

Secondary metrics:

- Workout quality notes
- Long run / long ride frequency
- Intensity distribution
- Missed planned sessions

Display principle:

- emphasize direction, consistency, and alignment with plan

### 4. Bottom Timeline

Purpose:

- keep a useful operational view at the bottom

Content:

- recent completed activities
- upcoming planned workouts
- clear separation between completed and planned
- easy scanning by day

## UX Principles

- Two top-level groups only: Recovery and Activity
- AI message first, evidence second
- Show trends, baselines, and movement, not a wall of tiles
- Use color sparingly for state, not decoration
- Avoid visual noise and duplicate cards
- Put "what changed" ahead of "all available data"
- Always pair current value with comparison window where possible
- Keep cards readable on one laptop screen without scrolling through noise

## Target Information Architecture

### Top

- Morning Coach Briefing

### Middle

- Recovery overview card
- Activity overview card

### Below

- Recovery trends section
- Activity / load trends section

### Bottom

- Past activities
- Planned workouts

## Garmin Data To Use

### Recovery data available now in the installed backend library

- `get_sleep_data`
- `get_hrv_data`
- `get_stress_data`
- `get_body_battery`
- `get_heart_rates`
- `get_rhr_day`
- `get_respiration_data`
- `get_training_readiness`
- `get_morning_training_readiness`
- `get_spo2_data`
- `get_stats`
- `get_stats_and_body`
- `get_user_summary`

### Activity / readiness / trend data available now or near-now

- `get_activities_by_date`
- `get_activity_details`
- `get_training_status`
- `get_progress_summary_between_dates`
- `get_endurance_score`
- `get_hill_score`
- `get_training_plans`
- scheduled / stored workouts through app tables

### Upgrade note

Current repo dependency is pinned to an older fork of the Garmin library.

Planned change:

- move to the actively maintained upstream `cyberjunky/python-garminconnect`
- align on current token handling and current health endpoints
- confirm response shapes before widening schema

## Data Model Changes

### 1. Expand `daily_health`

Add fields for:

- respiration_avg
- resting_hr_confirmed
- overnight_avg_hr
- pulse_ox_avg
- training_readiness
- morning_training_readiness
- body_battery_end_of_day
- body_battery_start_of_day
- recovery_status_summary
- raw sleep / readiness payload snapshots where useful

### 2. Add `daily_briefings`

New table:

- `id`
- `user_id`
- `briefing_date`
- `timezone`
- `generated_at`
- `recovery_summary`
- `activity_summary`
- `today_recommendations`
- `model`
- `input_snapshot`
- `is_stale`

Purpose:

- cache daily coach note
- avoid regenerating repeatedly
- support "after 9AM only"

### 3. Strengthen workouts / planning linkage

Need a clear way to compare:

- planned workouts
- completed workouts / activities

May require:

- `scheduled_date`
- `planned_discipline`
- `planned_duration_seconds`
- `planned_tss`
- `completed_activity_id`
- `completion_status`

## Backend Work

### Phase 1. Data coverage audit

- inspect real Garmin payloads for sleep, HRV, respiration, readiness, heart rate
- document which fields are reliable for this user and this library version
- map Garmin payload names to stable internal field names

### Phase 2. Sync expansion

- extend Garmin sync to persist additional recovery metrics
- keep sync idempotent
- keep sync resilient to partial Garmin endpoint failures
- do not fail the entire sync because one secondary metric endpoint errors

### Phase 3. Dashboard aggregation API

Create a dashboard-specific endpoint that returns:

- recovery snapshot
- recovery trends
- activity snapshot
- activity trends
- planned workouts summary
- recent completed activities
- morning briefing

This should replace the current minimal `/activities/dashboard` payload.

### Phase 4. Daily briefing generation

Trigger rules:

- dashboard opened
- current time is after 09:00 local time
- today's sync completed
- no valid briefing exists for today

Generation inputs:

- last night recovery
- last 3 days
- last 7 days
- last 30 days
- actual workouts
- planned workouts
- activity load and compliance

### Phase 5. Scheduling

Optional follow-up:

- add scheduled background generation shortly after 09:00 local time
- fallback remains dashboard-open generation

## Frontend Work

### Phase 1. Replace tile-heavy summary

Move from:

- generic stat cards

To:

- briefing card
- recovery state card
- activity state card
- directional trend visuals

### Phase 2. Recovery visuals

Build:

- last night recovery strip
- 7d vs 30d baseline mini-trends
- direction badges: improving / flat / worsening

### Phase 3. Activity visuals

Build:

- load direction chart
- discipline mix
- planned vs completed block
- today's workout recommendation block

### Phase 4. Timeline

Build a bottom combined schedule:

- recent completed activities
- upcoming planned workouts
- grouped by day

## AI Briefing Rules

### Inputs

- recovery metrics:
- last night
- 3d
- 7d
- 30d

- activity metrics:
- last workout
- last 3d
- 7d
- 30d
- planned workouts
- compliance

### Output requirements

- concise
- no generic filler
- cite the pattern in plain English
- tell the user what to do today
- do not expose chain-of-thought

### Prompt style

- expert performance physician / coach
- practical
- high-signal
- no chatty phrasing

## Acceptance Criteria

- Opening dashboard shows one clear briefing at the top
- Recovery and Activity are the obvious primary groups
- Recovery section explains direction, not just numbers
- Activity section shows actuals vs plan
- Planned workouts are visible on the dashboard
- Briefing uses fresh synced Garmin data
- Briefing is generated only after 09:00 local time
- Dashboard still works if some Garmin secondary endpoints fail
- The user can understand today's recommendation in under 30 seconds

## Execution Order

1. Audit current Garmin payloads and library coverage.
2. Upgrade Garmin dependency to maintained upstream if required.
3. Expand backend schema for recovery metrics and daily briefings.
4. Extend sync to store richer daily recovery data.
5. Create new dashboard aggregation endpoint.
6. Implement briefing generation and daily caching.
7. Redesign dashboard layout around briefing, recovery, and activity.
8. Add planned-workout vs completed-workout view.
9. Validate with real synced data and refine thresholds / messaging.

## Open Questions

- Which timezone should be used per user for the 09:00 briefing gate?
- Should planned workouts come only from the app, Garmin calendar, or both?
- Should the coach briefing prefer performance optimization, recovery protection, or a balanced mode by default?
