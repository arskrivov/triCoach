# Requirements Document

## Introduction

The AI Training Plans feature adds an intelligent periodized training plan engine to the Personal Coach app. Athletes set a race goal (e.g., marathon, Ironman 70.3) with a target date and weekly hours budget, and the AI generates a multi-week training plan spanning Base → Build → Peak → Taper phases. Plans include swim, cycle, run, strength, and yoga/mobility sessions tailored to the athlete's current fitness level, health data, and profile thresholds. Plans are adjustable via the AI coach chat and sync to Garmin for execution on the watch.

## Glossary

- **Training_Plan**: A periodized multi-week training program stored in the `training_plans` table, containing metadata (name, dates, weekly hours) and a `plan_structure` JSONB with phases and TSS targets.
- **Plan_Workout**: A single workout session within a Training_Plan, stored as a row in the existing `workouts` table with a `plan_id` foreign key linking it to the plan.
- **Periodization_Phase**: One of four training phases — Base (aerobic foundation), Build (race-specific intensity), Peak (race simulation), Taper (volume reduction for freshness).
- **Recovery_Week**: A planned low-volume week (30-50% TSS reduction) inserted every 3-4 load weeks to allow adaptation.
- **Plan_Compliance**: The percentage of planned workouts completed within ±1 day of their scheduled date.
- **Plan_Adjustment**: A modification to one or more Plan_Workouts triggered by the athlete via the AI coach chat (e.g., injury, schedule change).
- **Race_Type**: A predefined goal category (marathon, half_marathon, ironman, ironman_70_3, olympic_tri, 10k, century_ride, custom) that determines discipline distribution and periodization structure.
- **Weekly_Hours_Budget**: The maximum number of training hours per week the athlete has available.
- **Garmin_Workout_Sync**: The process of converting Plan_Workouts to Garmin-readable format and uploading them to Garmin Connect for execution on the watch.
- **Plan_Context**: The comprehensive athlete data assembled for the AI prompt — includes athlete profile, 7-week fitness timeline (CTL/ATL/TSB), health data, recent activities, and active goals.

## Requirements

### Requirement 1: Goal Enhancement for Plan Generation

**User Story:** As a triathlete, I want to set a race goal with a specific race type, target date, and weekly hours budget, so that the AI can generate a training plan tailored to my event and availability.

#### Acceptance Criteria

1. WHEN the user creates or edits a goal, THE goal form SHALL include fields for race_type (dropdown: marathon, half_marathon, ironman, ironman_70_3, olympic_tri, 10k, century_ride, custom), weekly_hours_budget (number input, hours per week), and priority (primary or secondary).
2. WHEN the user selects a race_type, THE system SHALL store it on the goal record alongside the existing description, target_date, and sport fields.
3. WHEN the user sets a weekly_hours_budget, THE value SHALL be a positive number between 3 and 30 hours.
4. THE existing goal management in the AI Coach page SHALL be extended to include the new fields without breaking existing goal functionality.

### Requirement 2: AI Plan Generation

**User Story:** As a triathlete, I want the AI to generate a periodized training plan based on my goal, fitness level, and weekly availability, so that I have a structured path to race day.

#### Acceptance Criteria

1. WHEN the user clicks "Generate Plan" for a goal, THE system SHALL read the athlete's profile (FTP, threshold pace, max HR, weight), 7-week fitness timeline (CTL/ATL/TSB), 7-week health data (sleep, HRV, recovery), and recent activities to build context for the AI.
2. WHEN the AI generates a plan, THE plan SHALL follow periodization principles with Base → Build → Peak → Taper phases, where phase durations are proportional to the total plan length.
3. WHEN the AI generates a plan, THE plan SHALL include recovery weeks every 3-4 load weeks with 30-50% TSS reduction.
4. WHEN the AI generates a plan, THE weekly workout durations SHALL not exceed the weekly_hours_budget by more than 10%.
5. WHEN the AI generates a plan, THE plan SHALL distribute weekly hours across disciplines based on the race_type (e.g., Ironman 70.3: ~15% swim, ~35% bike, ~30% run, ~12% strength, ~8% mobility).
6. WHEN the AI generates a plan, EACH workout SHALL include structured content with warmup, main set, cooldown, target zones, estimated TSS, and coaching notes.
7. WHEN the goal has a target_date, THE plan end_date SHALL be within 7 days of the target_date. WHEN no target_date is set, THE system SHALL generate a 12-week progressive plan.
8. WHEN the athlete has no fitness data, THE system SHALL generate a conservative beginner-level plan with lower TSS targets.
9. THE generated plan and all its workouts SHALL be stored in the database immediately after generation.

### Requirement 3: Plan View and Management

**User Story:** As a triathlete, I want to view my training plan in a weekly calendar layout showing each workout, phase indicators, and compliance tracking, so that I can follow and monitor my training.

#### Acceptance Criteria

1. THE plan view SHALL display a week-by-week layout with each day showing the workout discipline icon, workout type (easy, tempo, intervals, etc.), duration, and completion status.
2. THE plan view SHALL display the current periodization phase name and week number (e.g., "Build — Week 8/16").
3. THE plan view SHALL display weekly TSS target vs actual TSS with a compliance percentage.
4. THE plan view SHALL allow the user to navigate between weeks (previous/next) and jump to the current week.
5. THE plan view SHALL visually distinguish completed workouts, upcoming workouts, and missed workouts.
6. WHEN the user clicks on a workout in the plan view, THE system SHALL show the full workout details (warmup, main set, cooldown, zones, notes).
7. THE plan list page SHALL show all user plans with name, status (active/completed/archived), date range, and goal.

### Requirement 4: Plan Adjustment via AI Coach

**User Story:** As a triathlete, I want to tell the AI coach about schedule changes or injuries and have it automatically adjust my training plan, so that my plan stays realistic and safe.

#### Acceptance Criteria

1. WHEN the user has an active training plan and sends a message to the AI coach (e.g., "I can't cycle today", "my knee hurts"), THE coach SHALL recognize plan-related requests and suggest specific workout modifications.
2. WHEN the coach suggests a plan adjustment, THE adjustment SHALL modify only current or future workouts — never past workouts.
3. WHEN the coach adjusts for an injury (e.g., knee pain), THE adjusted workouts SHALL include appropriate modifications (e.g., swap running for swimming, add warm-up/mobility).
4. WHEN the coach adjusts for a schedule change (e.g., "I can't train Thursday"), THE coach SHALL redistribute the missed workout's training load across remaining days in the week.
5. EACH plan adjustment SHALL be logged in the plan's adjustments history with the date, reason, and what was changed.
6. THE AI coach context SHALL include the current plan state (this week's workouts, compliance, current phase) when an active plan exists.

### Requirement 5: Garmin Workout Sync

**User Story:** As a triathlete, I want to sync my planned workouts to my Garmin watch so that I can follow the structured workout during training.

#### Acceptance Criteria

1. WHEN the user clicks "Sync to Garmin" on the plan view, THE system SHALL convert upcoming workouts (next 14 days) to Garmin-readable format and upload them to Garmin Connect.
2. WHEN a workout is synced to Garmin, THE system SHALL store the `garmin_workout_id` on the workout record and schedule it on the Garmin calendar for the correct date.
3. WHEN a synced workout is later adjusted by the AI coach, THE system SHALL remove the old Garmin workout and push the updated version.
4. WHEN the user's Garmin account is not connected, THE system SHALL display a message directing them to connect in Settings.
5. THE Garmin sync SHALL report the number of workouts synced and any failures.

### Requirement 6: Enhanced Athlete Profile

**User Story:** As a triathlete, I want my training thresholds (FTP, paces, HR zones) to be automatically derived from my Garmin data or manually entered, so that the AI can set appropriate training zones in my plan.

#### Acceptance Criteria

1. THE athlete profile SHALL continue to auto-derive FTP, threshold pace, swim CSS, max HR, resting HR, and strength 1RMs from synced Garmin data (existing functionality).
2. THE athlete profile page SHALL clearly show which values are auto-derived vs manually entered, with the ability to override any auto-derived value.
3. WHEN generating a training plan, THE system SHALL use the effective athlete profile (manual overrides take precedence over auto-derived) to set workout zones.

### Requirement 7: Plan Compliance Tracking

**User Story:** As a triathlete, I want to see how well I'm following my training plan, so that I can stay accountable and the AI can adapt if I'm falling behind.

#### Acceptance Criteria

1. THE system SHALL calculate plan compliance by matching completed activities (from Garmin sync) to planned workouts within ±1 day and matching discipline.
2. THE plan view SHALL display overall compliance percentage and per-week compliance.
3. WHEN compliance drops below 70% for two consecutive weeks, THE AI coach SHALL proactively suggest plan adjustments in the next briefing or chat interaction.

### Requirement 8: Database Schema Updates

**User Story:** As a developer, I want the database schema to support training plans with proper relationships to goals and workouts, so that the system can store and query plan data efficiently.

#### Acceptance Criteria

1. A new `training_plans` table SHALL be created with fields: id, user_id, goal_id, name, status, race_date, start_date, end_date, weekly_hours, plan_structure (JSONB), adjustments (JSONB), created_at, updated_at.
2. THE `workouts` table SHALL be extended with `plan_id` (FK to training_plans), `plan_week` (int), and `plan_day` (int, 0=Monday through 6=Sunday).
3. THE `goals` table SHALL be extended with `race_type` (text), `weekly_hours_budget` (float), and `priority` (int, default 1).
4. ALL new columns on existing tables SHALL be nullable with sensible defaults to maintain backward compatibility.
