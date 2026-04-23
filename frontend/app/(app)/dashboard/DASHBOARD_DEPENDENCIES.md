# Dashboard Component Dependency Map

## Overview

This document maps the complete data flow from the backend API endpoint through the frontend dashboard components. It shows how data is aggregated in the backend, transmitted via the API, and distributed to each card component for rendering.

**Last Updated**: Task 1.2 - Dashboard Cleanup Phase 1

---

## Architecture Summary

The dashboard follows a three-tier architecture:

1. **Backend Service Layer** (`backend/app/services/dashboard.py`)
   - Single endpoint: `GET /api/v1/dashboard/overview`
   - Aggregates data from multiple database tables
   - Generates or retrieves AI/heuristic coaching briefing

2. **Frontend Orchestration Layer** (`frontend/app/(app)/dashboard/`)
   - `page.tsx`: Server component with Suspense boundary
   - `dashboard-content.tsx`: Client component managing API calls, state, and Garmin sync events

3. **Frontend Component Layer**
   - Five card components displaying different aspects of dashboard data
   - Two shared components (DashboardMetricTile, FitnessChart)

---

## Data Flow Diagram

```
User Browser
    ↓
page.tsx (SSR)
    ↓
dashboard-content.tsx (CSR)
    ↓ [GET /api/v1/dashboard/overview + X-User-Timezone header]
    ↓
Backend: build_dashboard_overview()
    ↓
    ├─ Parallel Supabase Queries:
    │   ├─ activities (last 30 days)
    │   ├─ daily_health (last 30 days)
    │   ├─ workouts (non-template)
    │   └─ goals (active only)
    ↓
    ├─ Aggregation & Calculation:
    │   ├─ Recovery metrics (9 metrics × 7d/30d averages)
    │   ├─ Activity summaries (by discipline, time windows)
    │   ├─ Fitness timeline (CTL/ATL/TSB via fitness.py)
    │   └─ Briefing (AI via OpenAI or heuristic fallback)
    ↓
DashboardOverview JSON Response
    ↓
dashboard-content.tsx distributes to:
    ├─ CoachBriefingCard
    ├─ RecoveryOverviewCard
    ├─ ActivityOverviewCard
    ├─ RecentActivitiesCard
    └─ UpcomingWorkoutsCard
```

---

## Backend Service Functions

### Main Endpoint Function

**`build_dashboard_overview(user, sb, timezone_name, allow_briefing_generation)`**
- **Location**: `backend/app/services/dashboard.py:718`
- **Purpose**: Main orchestrator that aggregates all dashboard data
- **Returns**: Complete `DashboardOverview` dictionary

### Database Queries (Parallel Execution)

The function executes four parallel queries using `asyncio.gather()`:

1. **Activities Query**
   - Table: `activities`
   - Filter: `user_id = current_user.id AND start_time >= (today - 30 days)`
   - Order: `start_time DESC`
   - Used for: Activity summaries, discipline breakdown, recent activities list

2. **Health Query**
   - Table: `daily_health`
   - Filter: `user_id = current_user.id AND date >= (today - 30 days)`
   - Order: `date DESC`
   - Used for: Recovery metrics, sparklines, last night data

3. **Workouts Query**
   - Table: `workouts`
   - Filter: `user_id = current_user.id AND is_template = false`
   - Order: `updated_at ASC`
   - Used for: Upcoming workouts, completion rate calculation

4. **Goals Query**
   - Table: `goals`
   - Filter: `user_id = current_user.id AND is_active = true`
   - Used for: AI briefing context (top 3 goals)

### External Service Calls

**`get_fitness_timeline(user_id, sb, days=90, timezone_name)`**
- **Location**: `backend/app/services/fitness.py`
- **Purpose**: Calculate CTL/ATL/TSB fitness metrics over 90 days
- **Returns**: List of `FitnessPoint` dictionaries
- **Used by**: ActivityOverview fitness data, fitness timeline chart

**`activity_training_load(activity_dict)`**
- **Location**: `backend/app/services/fitness.py`
- **Purpose**: Calculate TSS (Training Stress Score) for a single activity
- **Returns**: Float (TSS value)
- **Used by**: Activity aggregation, briefing generation

### Helper Functions (Organized by Purpose)

#### Date/Time Utilities
- `_to_zoneinfo(timezone_name)` - Parse timezone string to ZoneInfo
- `_date_range(days, tz)` - Calculate date range for queries
- `_parse_date(value)` - Parse ISO date string
- `_parse_datetime(value)` - Parse ISO datetime string
- `_activity_local_date(start_time, tz)` - Convert activity UTC time to local date

#### Metric Calculation
- `_to_float(value)` - Convert any value to float or None
- `_avg(values)` - Calculate average of float list
- `_extract_health_value(row, key)` - Extract specific health metric from DailyHealthRow
- `_metric_direction(current, baseline, higher_is_better)` - Calculate trend direction (up/down/stable)

#### Recovery Analysis
- `_recovery_status(metrics)` - Determine recovery status from metric trends
  - Returns: `("strong" | "strained" | "steady", headline_string)`
  - Logic: 3+ down trends = "strained", 3+ up trends = "strong", else "steady"

#### Activity Analysis
- `_activity_status(last_7d_tss, previous_7d_tss, readiness)` - Determine activity status
  - Returns: `("idle" | "overreaching" | "building" | "lighter" | "steady", headline_string)`
  - Logic: Compares TSS change and readiness score
- `_activity_summary_by_discipline(items)` - Aggregate activities by discipline
  - Returns: Dict with keys: swim, bike, run, strength, mobility
- `_sum_distance(items)` - Sum distance across activities (km)
- `_sum_duration(items)` - Sum duration across activities (hours)
- `_sum_tss(items)` - Sum TSS across activities

#### Fitness Analysis
- `_load_direction(latest_point)` - Determine fitness direction from TSB
  - Returns: `"unknown" | "fatigued" | "training" | "fresh" | "balanced"`
  - Logic: TSB < -30 = fatigued, TSB < -10 = training, TSB > 10 = fresh, else balanced

#### Workout Planning
- `_upcoming_workout_payload(workout)` - Format workout for response
- `_completion_rate_this_week(activities, workouts, tz)` - Calculate workout completion rate
  - Logic: Matches activities to planned workouts within ±1 day by discipline
- `_planned_summary(workouts, activities, tz)` - Aggregate planned workout data
  - Returns: (PlannedSummary dict, upcoming_workouts list)

#### Briefing Generation
- `_heuristic_briefing(overview, local_date, local_time)` - Generate rule-based briefing
  - Returns: DashboardBriefing dict with 4 sections
  - Logic: Rule-based recommendations from recovery/activity status
- `_build_daily_prompt_digest(local_date, health_rows_7d, activities_7d, tz)` - Build AI prompt data
  - Returns: List of 7 daily summaries (health + training)
- `_build_ai_prompt(...)` - Format prompt JSON for OpenAI
- `_parse_ai_briefing(text, fallback)` - Parse OpenAI response
- `_today_data_signature(...)` - Generate cache key for briefing (SHA256 hash)
- `_generate_briefing(...)` - Call OpenAI API (async)
  - Model: `settings.openai_analysis_model` (gpt-4.1-mini)
  - Max tokens: 600
  - Fallback: Returns heuristic briefing on error
- `_resolve_briefing(...)` - Retrieve cached or generate new briefing
  - Logic: Check daily_briefings table, compare signature, generate if needed
  - Constraint: Only generates after 06:00 local time

---

## API Response Structure

### Endpoint
`GET /api/v1/dashboard/overview`

### Request Headers
- `Authorization: Bearer <supabase_jwt>`
- `X-User-Timezone: <IANA timezone>` (e.g., "America/New_York")

### Response Type: `DashboardOverview`

```typescript
{
  generated_at: string;              // ISO timestamp (UTC)
  timezone: string;                  // IANA timezone from request header
  last_sync_at: string | null;      // Last Garmin sync timestamp (from users.garmin_last_sync_at)
  
  recovery: {
    status: "strong" | "strained" | "steady";
    headline: string;                // Human-readable status description
    last_night: {
      date: string | null;           // ISO date of latest health data
      sleep_score: number | null;
      sleep_duration_hours: number | null;
      hrv_last_night: number | null;
      resting_hr: number | null;
      respiration_sleep: number | null;
      stress_avg: number | null;
      pulse_ox_avg: number | null;
      morning_training_readiness_score: number | null;
    };
    metrics: RecoveryMetricTrend[];  // 9 metrics (see RECOVERY_METRICS constant)
    sparkline: HealthSparklinePoint[]; // 30 days of sleep_score, hrv, resting_hr
  };
  
  activity: {
    status: "idle" | "overreaching" | "building" | "lighter" | "steady";
    headline: string;
    movement: {
      steps_avg_7d: number | null;
      daily_calories_avg_7d: number | null;
    };
    last_7d: ActivityWindowSummary;    // Current week
    previous_7d: ActivityWindowSummary; // Previous week (for comparison)
    last_30d: {
      sessions: number;
      distance_km: number;
      duration_hours: number;
      discipline_breakdown: Record<Discipline, number>; // Session count by discipline
    };
    fitness: {
      ctl: number | null;              // Chronic Training Load
      atl: number | null;              // Acute Training Load
      tsb: number | null;              // Training Stress Balance
      direction: "unknown" | "fatigued" | "training" | "fresh" | "balanced";
    };
    planned: {
      upcoming_count: number;
      next_workout: PlannedWorkout | null;
      completion_rate_this_week: number | null; // 0.0 to 1.0
    };
  };
  
  briefing: DashboardBriefing | null; // Null if before 06:00 or no data
  recent_activities: ActivitySummary[]; // Last 6 activities
  upcoming_workouts: PlannedWorkout[];  // Next 6 scheduled workouts
  fitness_timeline: FitnessPoint[];     // Last 42 days of CTL/ATL/TSB
}
```

---

## Frontend Component Dependencies

### 1. CoachBriefingCard

**File**: `frontend/app/(app)/dashboard/coach-briefing-card.tsx`

**Props Interface**:
```typescript
{ briefing: DashboardBriefing | null }
```

**Data Source**: `data.briefing` from API response

**Backend Functions**:
- `_resolve_briefing()` - Main briefing orchestrator
- `_generate_briefing()` - AI generation (if enabled and after 06:00)
- `_heuristic_briefing()` - Fallback rule-based briefing
- `_build_ai_prompt()` - OpenAI prompt construction
- `_today_data_signature()` - Cache key generation

**Database Tables**:
- `daily_briefings` - Cached briefings (upserted on generation)
- `activities` - Last 7 days (for AI context)
- `daily_health` - Last 7 days (for AI context)
- `goals` - Active goals (for AI context)

**External Services**:
- OpenAI API (gpt-4.1-mini) - AI briefing generation

**Displays**:
- Source badge (AI-enhanced or Rule-based)
- Sleep analysis (2-3 sentences)
- Activity analysis (2-3 sentences)
- Recommendations (1-4 actionable items)
- Caution (optional warning)

---

### 2. RecoveryOverviewCard

**File**: `frontend/app/(app)/dashboard/recovery-overview-card.tsx`

**Props Interface**:
```typescript
{
  recovery: RecoveryOverview & { sparkline: HealthSparklinePoint[] };
  analysis: string | null;
}
```

**Data Sources**:
- `data.recovery` from API response
- `data.briefing?.sleep_analysis` (falls back to `recovery.headline`)

**Backend Functions**:
- `_recovery_status()` - Status calculation (strong/strained/steady)
- `_extract_health_value()` - Extract metrics from DailyHealthRow
- `_metric_direction()` - Calculate trend direction
- `_avg()` - Calculate 7d and 30d averages

**Database Tables**:
- `daily_health` - Last 30 days

**Displays**:
- Status badge (strong/strained/steady with color coding)
- Analysis text (from AI briefing or headline)
- 6 metric tiles (sleep score, sleep time, HRV, resting HR, readiness, SpO2)
- 30-day sparkline charts (sleep score, HRV, resting HR)
- 5 detailed metric rows with current/7d/30d/trend

**Recovery Metrics** (from `RECOVERY_METRICS` constant):
1. Sleep score
2. Sleep duration (hours)
3. HRV (ms)
4. Resting HR (bpm)
5. Sleep respiration (breaths/min)
6. Stress (0-100)
7. SpO2 (%)
8. Body Battery high
9. Morning readiness score

**Shared Components**:
- `DashboardMetricTile` (6 instances)
- Recharts `LineChart` (3 sparklines)

---

### 3. ActivityOverviewCard

**File**: `frontend/app/(app)/dashboard/activity-overview-card.tsx`

**Props Interface**:
```typescript
{
  activity: ActivityOverview;
  analysis: string | null;
  fitnessTimeline?: FitnessPoint[];
}
```

**Data Sources**:
- `data.activity` from API response
- `data.briefing?.activity_analysis` (falls back to `activity.headline`)
- `data.fitness_timeline` (last 42 days)

**Backend Functions**:
- `_activity_status()` - Status calculation (idle/overreaching/building/lighter/steady)
- `_activity_summary_by_discipline()` - Aggregate by discipline
- `_sum_distance()`, `_sum_duration()`, `_sum_tss()` - Aggregation helpers
- `_load_direction()` - Fitness direction from TSB
- `get_fitness_timeline()` - CTL/ATL/TSB calculation (from fitness.py)

**Database Tables**:
- `activities` - Last 30 days
- `daily_health` - Last 7 days (for steps/calories)

**External Services**:
- `fitness.py` service - Fitness timeline calculation

**Displays**:
- Status badge (idle/overreaching/building/lighter/steady with color coding)
- Analysis text (from AI briefing or headline)
- 6 metric tiles (steps, calories, sessions, time, TSS, form/TSB)
- 5 discipline rows (swim, bike, run, strength, mobility) with week-over-week comparison
- Fitness chart (42-day CTL/ATL/TSB timeline)

**Discipline Aggregation**:
- Swim: distance_km, sessions, duration_hours
- Bike: distance_km, sessions, duration_hours (combines RIDE_ROAD + RIDE_GRAVEL)
- Run: distance_km, sessions, duration_hours
- Strength: sessions, duration_hours (no distance)
- Mobility: sessions, duration_hours (combines YOGA + MOBILITY, no distance)

**Shared Components**:
- `DashboardMetricTile` (6 instances)
- `FitnessChart` (embedded mode)

---

### 4. RecentActivitiesCard

**File**: `frontend/app/(app)/dashboard/recent-activities-card.tsx`

**Props Interface**:
```typescript
{ activities: ActivitySummary[] }
```

**Data Source**: `data.recent_activities` from API response (last 6 activities)

**Backend Functions**:
- Direct mapping from `activities` query results
- No aggregation or calculation

**Database Tables**:
- `activities` - Last 30 days, ordered by `start_time DESC`, limited to 6

**Displays**:
- List of 6 most recent activities
- Each activity shows:
  - Discipline icon and color
  - Activity name (or discipline label if no name)
  - Relative date and duration
  - Primary stat (distance for endurance, sets for strength)

**Format Utilities Used**:
- `getDisciplineMeta()` - Icon, label, color for discipline
- `formatRelativeDate()` - "2 days ago", "Yesterday", etc.
- `formatDuration()` - "1h 23m"
- `primaryStat()` - Discipline-specific primary metric

**Navigation**:
- Links to `/activities` (view all)
- Links to `/activities/[id]` (activity detail)

---

### 5. UpcomingWorkoutsCard

**File**: `frontend/app/(app)/dashboard/upcoming-workouts-card.tsx`

**Props Interface**:
```typescript
{ workouts: PlannedWorkout[] }
```

**Data Source**: `data.upcoming_workouts` from API response (next 6 workouts)

**Backend Functions**:
- `_planned_summary()` - Filter and sort upcoming workouts
- `_upcoming_workout_payload()` - Format workout for response

**Database Tables**:
- `workouts` - Non-template workouts with `scheduled_date >= today`, limited to 6

**Displays**:
- List of 6 upcoming scheduled workouts
- Each workout shows:
  - Discipline icon and color
  - Workout name
  - Scheduled date
  - Estimated duration (if available)
  - Estimated TSS (if available)

**Format Utilities Used**:
- `getDisciplineMeta()` - Icon, label, color for discipline
- `formatDate()` - "Jan 15, 2024"
- `formatDuration()` - "1h 30m"

**Navigation**:
- Links to `/workouts` (manage workouts)

---

## Shared Components

### DashboardMetricTile

**File**: `frontend/app/(app)/dashboard/dashboard-metric-tile.tsx`

**Props Interface**:
```typescript
{
  label: string;
  value: string;
  subtitle?: string;
  valueClassName?: string;
  className?: string;
}
```

**Used By**:
- RecoveryOverviewCard (6 instances)
- ActivityOverviewCard (6 instances)

**Reusability**: **HIGH** - Generic metric display component suitable for app-wide use

**Recommendation**: Move to `components/ui/metric-tile.tsx` for broader reuse

---

### FitnessChart

**File**: `frontend/app/(app)/dashboard/fitness-chart.tsx`

**Props Interface**:
```typescript
{
  data?: FitnessPoint[];
  embedded?: boolean;
}
```

**Data Structure**:
```typescript
FitnessPoint {
  date: string;
  ctl: number;  // Chronic Training Load
  atl: number;  // Acute Training Load
  tsb: number;  // Training Stress Balance
  daily_tss: number;
}
```

**Used By**:
- ActivityOverviewCard (embedded mode)

**Backend Source**:
- `get_fitness_timeline()` from `backend/app/services/fitness.py`
- Calculates exponentially weighted moving averages of TSS

**Reusability**: **HIGH** - Can be used in fitness page, activity detail, training log

**Recommendation**: Move to `components/fitness-chart.tsx` for broader reuse

---

## Format Utilities

**File**: `frontend/lib/format.ts`

Used extensively across dashboard components:

- `formatDuration(seconds)` - "1h 23m"
- `formatPace(sec_per_km)` - "5:23 /km"
- `formatDistance(meters)` - "10.5 km"
- `formatSteps(steps)` - "8,234"
- `formatCalories(calories)` - "2,450 kcal"
- `formatHRV(ms)` - "65 ms"
- `formatSleepScore(score)` - Returns `{ text: string, color: string }`
- `formatDate(iso_string)` - "Jan 15, 2024"
- `formatRelativeDate(iso_string)` - "2 days ago"
- `getDisciplineMeta(discipline)` - Returns `{ label, icon, color }`
- `primaryStat(activity)` - Discipline-specific primary metric

---

## State Management (dashboard-content.tsx)

### Local State
- `data: DashboardOverview | null` - API response data
- `loading: boolean` - Initial load state
- `loadError: string | null` - Error message
- `syncing: boolean` - Garmin sync in progress
- `syncNotice: SyncNotice | null` - Sync result notification
- `nowMs: number | null` - Current timestamp (for relative dates)

### Event Listeners
- `GARMIN_SYNC_STARTED_EVENT` - Set syncing state
- `GARMIN_SYNC_COMPLETED_EVENT` - Refresh dashboard, show success notice
- `GARMIN_SYNC_FAILED_EVENT` - Show error notice

### API Calls
- `loadDashboard()` - GET /dashboard/overview with timezone header
- `syncLastWeek()` - POST /sync/now, then refresh dashboard

---

## Performance Considerations

### Backend
- **Parallel Queries**: 4 database queries execute concurrently via `asyncio.gather()`
- **Query Optimization**: All queries filtered by `user_id` and date ranges
- **Caching**: Briefings cached in `daily_briefings` table with data signature
- **Lazy AI Generation**: Only generates after 06:00 local time and when data changes

### Frontend
- **Server Component**: `page.tsx` renders on server (no client JS)
- **Client Component**: `dashboard-content.tsx` handles interactivity
- **Suspense Boundary**: Prevents blocking page render during data fetch
- **Debounced Updates**: Sync notices auto-dismiss after 4 seconds
- **Relative Date Updates**: Timestamp refreshes every 60 seconds

---

## Error Handling

### Backend Errors
- **Database Errors**: Caught and logged, returns empty arrays
- **OpenAI Errors**: Falls back to heuristic briefing
- **Timezone Errors**: Falls back to UTC

### Frontend Errors
- **401 Unauthorized**: Redirects to `/login`
- **Network Errors**: Displays error message with retry button
- **Sync Errors**: Displays error notice (auto-dismisses)

---

## Testing Implications

### Backend Tests Needed
- Unit tests for each helper function (date utils, metric calculations, aggregations)
- Integration test for `build_dashboard_overview()` with mock data
- Test briefing caching and signature generation
- Test timezone handling across different timezones

### Frontend Tests Needed
- Component tests for each card with various data states
- Integration test for `dashboard-content.tsx` loading/error/sync flows
- Test Garmin sync event handling
- Test error extraction and display

---

## Future Refactoring Opportunities

### Backend
1. **Extract Utility Modules**:
   - `date_utils.py` - Date/timezone functions
   - `metrics.py` - Metric calculation functions
   - `activity_aggregation.py` - Activity aggregation functions

2. **Decompose Large Functions**:
   - `build_dashboard_overview()` - Extract recovery/activity/planned aggregation
   - `_build_daily_prompt_digest()` - Extract health/training formatting

3. **Move Fitness Logic**:
   - `_load_direction()` → `fitness.py`

### Frontend
1. **Move Shared Components**:
   - `DashboardMetricTile` → `components/ui/metric-tile.tsx`
   - `FitnessChart` → `components/fitness-chart.tsx`

2. **Extract Utilities**:
   - Timezone detection → `lib/timezone.ts`
   - Error handling → `lib/error-handling.ts`

3. **Reduce Prop Drilling**:
   - Pass only required fields to components
   - Destructure large objects at component boundaries

---

## Conclusion

The dashboard data flow is well-structured with clear separation of concerns:

- **Backend** handles all data aggregation, calculation, and AI generation
- **API** provides a single comprehensive endpoint with timezone awareness
- **Frontend orchestrator** manages state, events, and data distribution
- **Card components** are focused on presentation with minimal logic

The main complexity lies in the backend's `build_dashboard_overview()` function (150+ lines), which could benefit from decomposition into smaller, testable functions. The frontend components are clean and well-scoped, with two components (DashboardMetricTile, FitnessChart) identified as highly reusable across the application.
