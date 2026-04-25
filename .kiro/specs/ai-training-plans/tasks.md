# Implementation Plan: AI Training Plans

## Overview

This plan implements the AI training plan engine in phases: database schema first, then backend services, then API endpoints, then frontend UI. Each phase builds on the previous one. The plan reuses existing systems (workouts, coach, Garmin sync, fitness service) wherever possible.

## Tasks

- [x] 1. Database schema updates
  - [x] 1.1 Create `training_plans` table and extend `workouts` and `goals` tables
    - Apply Supabase migration to create `training_plans` table with: id, user_id (FK), goal_id (FK), name, status, race_date, start_date, end_date, weekly_hours, plan_structure (JSONB), adjustments (JSONB), created_at, updated_at
    - Add `plan_id` (FK to training_plans, nullable), `plan_week` (int, nullable), `plan_day` (int, nullable) columns to `workouts` table
    - Add `race_type` (text, nullable), `weekly_hours_budget` (float, nullable), `priority` (int, default 1) columns to `goals` table
    - Add indexes on `training_plans(user_id)` and `workouts(plan_id)`
    - Update `backend/schema.sql` to reflect the new schema
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 1.2 Update backend Pydantic models in `backend/app/models.py`
    - Add `TrainingPlanRow` model with all fields from the new table
    - Add `plan_id: str | None = None`, `plan_week: int | None = None`, `plan_day: int | None = None` to `WorkoutRow`
    - Add `race_type: str | None = None`, `weekly_hours_budget: float | None = None`, `priority: int = 1` to `GoalRow`
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 1.3 Update frontend TypeScript types in `frontend/lib/types.ts`
    - Add `TrainingPlan` interface with all plan fields
    - Add `PlanWorkout` interface extending existing workout type with plan_week, plan_day
    - Add `PlanCompliance` interface with overall and per-week compliance
    - Extend goal-related types with race_type, weekly_hours_budget, priority
    - _Requirements: 3.1, 7.1, 7.2_

- [x] 2. Backend plan generation service
  - [x] 2.1 Create `backend/app/services/plan_generator.py` with context builder and AI plan generation
    - Implement `PLAN_GENERATION_SYSTEM_PROMPT` — expert periodization coach persona that generates structured JSON plans with Base/Build/Peak/Taper phases, recovery weeks, discipline distribution, and structured workout content
    - Implement `build_plan_context(user_id, goal, sb) -> str` — assembles athlete profile, 7-week fitness timeline (CTL/ATL/TSB), 7-week health data, recent activities, and goal details into structured prompt text
    - Implement `generate_plan(user_id, goal_id, sb) -> dict` — calls OpenAI with system prompt + context, parses JSON response, validates plan structure, creates `training_plans` row and all `workouts` rows in DB
    - Implement `parse_plan_response(ai_text) -> dict` — parses AI JSON response with fallback handling for malformed output
    - Use `settings.openai_coach_model` (gpt-4.1) for plan generation (needs full reasoning capability)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [x] 2.2 Write property tests for plan generation validation
    - Property 1: Plan duration matches goal timeline (end_date within 7 days of target_date)
    - Property 2: Weekly hours respect budget (sum of workout durations ≤ budget × 1.1)
    - Property 4: All workouts have valid disciplines
    - Use Hypothesis with generated plan data dicts
    - _Requirements: 2.2, 2.4, 2.7_

- [x] 3. Backend plan management endpoints
  - [x] 3.1 Create `backend/app/routers/plans.py` with CRUD and generation endpoints
    - `POST /plans/generate` — accepts goal_id, calls `generate_plan`, returns plan with workouts
    - `GET /plans` — list user's plans (active, completed, archived)
    - `GET /plans/{id}` — get plan with all workouts, ordered by plan_week + plan_day
    - `PUT /plans/{id}` — update plan metadata (name, status)
    - `DELETE /plans/{id}` — archive plan (set status='archived')
    - `GET /plans/{id}/compliance` — calculate and return plan compliance stats
    - Register router in `backend/app/main.py`
    - _Requirements: 2.9, 3.7, 7.1, 7.2_

  - [x] 3.2 Update goal endpoints in `backend/app/routers/coach.py`
    - Extend `GoalCreate` and `GoalResponse` models with `race_type`, `weekly_hours_budget`, `priority` fields
    - Update the create and list endpoints to handle the new fields
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 4. Backend plan adjustment service
  - [x] 4.1 Create `backend/app/services/plan_adjuster.py` for AI-powered plan modifications
    - Implement `adjust_plan(plan_id, user_message, user_id, sb) -> dict` — reads current plan state + this week's workouts + health data, calls OpenAI to generate adjustment, updates affected workout rows, logs adjustment in plan.adjustments JSONB
    - Implement `PLAN_ADJUSTMENT_SYSTEM_PROMPT` — coach persona that modifies specific workouts based on athlete constraints (injury, schedule, fatigue)
    - Only modify current or future workouts, never past
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.2 Add plan adjustment endpoint to `backend/app/routers/plans.py`
    - `POST /plans/{id}/adjust` — accepts message string, calls `adjust_plan`, returns modified workouts
    - _Requirements: 4.1, 4.5_

  - [x] 4.3 Extend AI coach context to include active plan state
    - Modify `backend/app/services/coach_context.py` to include current plan info (this week's workouts, phase, compliance) when an active plan exists
    - This allows the coach chat to naturally handle plan-related questions
    - _Requirements: 4.6_

- [x] 5. Garmin workout sync service
  - [x] 5.1 Create `backend/app/services/garmin_workout_sync.py` for pushing workouts to Garmin
    - Implement `convert_workout_to_garmin(workout_row) -> dict` — converts workout content JSONB to Garmin workout format (steps with target zones, durations, repeats)
    - Implement `sync_plan_to_garmin(plan_id, user_id, sb) -> dict` — fetches upcoming 14 days of unsynced workouts, converts each, uploads via `garminconnect`, stores `garmin_workout_id`, schedules on Garmin calendar
    - Handle partial failures (skip failed workouts, continue with others)
    - _Requirements: 5.1, 5.2, 5.5_

  - [x] 5.2 Add Garmin sync endpoint to `backend/app/routers/plans.py`
    - `POST /plans/{id}/sync-garmin` — calls `sync_plan_to_garmin`, returns sync results
    - Check Garmin connection status before syncing, return 400 if not connected
    - _Requirements: 5.1, 5.4, 5.5_

- [x] 6. Checkpoint — Backend complete, run all tests
  - Run `cd backend && pytest tests/ -x -q` to verify all existing tests pass
  - Verify new endpoints respond correctly with mocked data

- [x] 7. Frontend goal enhancement
  - [x] 7.1 Extend goal form in `frontend/app/(app)/coach/page.tsx`
    - Add race_type dropdown (marathon, half_marathon, ironman, ironman_70_3, olympic_tri, 10k, century_ride, custom)
    - Add weekly_hours_budget number input (3-30 hours)
    - Add priority toggle (primary/secondary)
    - Keep existing goal fields (description, target_date, sport)
    - Style consistently with existing coach page design
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 8. Frontend plan generation UI
  - [x] 8.1 Create plan generation page at `frontend/app/(app)/workouts/plan/page.tsx`
    - Show list of goals with "Generate Plan" button for each
    - When clicked: show loading state, call `POST /plans/generate`, redirect to plan view on success
    - Show error state if generation fails
    - Also show existing plans list with links to plan view
    - _Requirements: 2.9, 3.7_

  - [x] 8.2 Create plan view page at `frontend/app/(app)/workouts/plan/[id]/page.tsx`
    - Week-by-week calendar layout with day columns (Mon-Sun)
    - Each day shows: discipline icon, workout type, duration, completion status (✓/✗/upcoming)
    - Phase indicator bar at top (Base/Build/Peak/Taper with current position)
    - Weekly TSS target vs actual with compliance percentage
    - Week navigation (prev/next, jump to current week)
    - Workout detail modal/drawer when clicking a workout
    - "Sync to Garmin" button in header
    - "Adjust with Coach" button that navigates to coach page with plan context
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 9. Frontend Garmin sync integration
  - [x] 9.1 Add Garmin sync button and status to plan view
    - "Sync to Garmin" button calls `POST /plans/{id}/sync-garmin`
    - Show loading state during sync
    - Show success/failure message with count of synced workouts
    - Show "Connect Garmin" message if not connected
    - Show sync status icon on individual workouts (synced/not synced)
    - _Requirements: 5.1, 5.4, 5.5_

- [x] 10. Final checkpoint — Full integration test
  - Run backend tests
  - Verify frontend compiles with zero TypeScript errors
  - Verify plan generation → plan view → Garmin sync flow works end-to-end

## Notes

- Tasks marked with `*` are optional property-based tests
- The plan reuses existing `workouts` table rows — no new workout storage needed
- Garmin workout sync uses the existing `garminconnect` library already in the project
- The AI coach context extension (task 4.3) enables natural plan adjustments via the existing chat interface
- Route suggestions are deferred — the existing route planner is available separately
- Plan compliance uses the same activity-matching logic as the dashboard's completion_rate_this_week
