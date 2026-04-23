# Design Document: Dashboard Cleanup

## Overview

This design addresses technical debt in the dashboard codebase through systematic cleanup, component reusability analysis, and architectural improvements. The dashboard is the primary landing page of the Personal Coach application, aggregating recovery metrics, activity summaries, AI-generated coaching briefings, and workout timelines.

The cleanup effort focuses on:
- Removing unused code and partial implementations
- Identifying and documenting reusable components
- Consolidating duplicate utility functions
- Simplifying the backend dashboard service
- Optimizing type definitions
- Reducing prop drilling
- Standardizing error handling
- Documenting component dependencies

**Key Constraint**: All changes must preserve existing functionality and user experience. This is a refactoring effort with no user-facing changes.

## Architecture

### Current Architecture

The dashboard follows a three-tier architecture:

1. **Frontend Page Layer** (`frontend/app/(app)/dashboard/`)
   - `page.tsx`: Server component with Suspense boundary
   - `dashboard-content.tsx`: Client component managing state, API calls, and Garmin sync events

2. **Frontend Component Layer**
   - Card components: `CoachBriefingCard`, `RecoveryOverviewCard`, `ActivityOverviewCard`, `RecentActivitiesCard`, `UpcomingWorkoutsCard`
   - Shared components: `DashboardMetricTile`, `FitnessChart`

3. **Backend Service Layer** (`backend/app/services/dashboard.py`)
   - Single endpoint: `GET /api/v1/dashboard/overview`
   - Aggregates data from: activities, daily_health, workouts, goals, fitness timeline
   - Generates or retrieves daily coaching briefing
   - 818 lines with 30+ helper functions

### Data Flow

```
User → page.tsx (SSR)
  ↓
dashboard-content.tsx (CSR)
  ↓
GET /dashboard/overview (with X-User-Timezone header)
  ↓
build_dashboard_overview() in dashboard.py
  ↓ (parallel queries)
  ├─ activities (last 30 days)
  ├─ daily_health (last 30 days)
  ├─ workouts (all non-template)
  └─ goals (active only)
  ↓
Aggregation & calculation:
  ├─ Recovery metrics (9 metrics × 7d/30d averages)
  ├─ Activity summaries (by discipline, time windows)
  ├─ Fitness timeline (CTL/ATL/TSB)
  └─ Briefing (AI or heuristic)
  ↓
DashboardOverview response
  ↓
Card components render
```

### Cleanup Strategy

The cleanup will proceed in phases:

**Phase 1: Analysis & Documentation**
- Identify unused code (imports, functions, variables)
- Map component dependencies
- Document reusability potential
- Identify duplicate logic

**Phase 2: Type System Optimization**
- Remove unused type fields
- Correct optional vs required fields
- Ensure type accuracy

**Phase 3: Backend Refactoring**
- Extract reusable fitness logic to fitness service
- Decompose large functions (>50 lines)
- Remove single-use helper functions that add indirection
- Consolidate related helpers

**Phase 4: Frontend Refactoring**
- Consolidate duplicate formatting/transformation logic
- Reduce prop drilling
- Standardize error handling
- Remove commented code

**Phase 5: Validation**
- Verify tests pass
- Measure performance metrics
- Confirm identical API responses
- Validate UI rendering

## Components and Interfaces

### Frontend Components

#### Page Components

**`page.tsx`** (Server Component)
- **Purpose**: Dashboard route entry point
- **Reusability**: Not reusable (route-specific)
- **Dependencies**: None (static layout)
- **Status**: Clean, no changes needed

**`dashboard-content.tsx`** (Client Component)
- **Purpose**: Main dashboard orchestrator
- **Reusability**: Not reusable (dashboard-specific state management)
- **Dependencies**: 
  - API: `/dashboard/overview`
  - Events: Garmin sync events
  - Components: All card components
- **Cleanup Needed**:
  - Consolidate error message extraction logic
  - Standardize sync notification handling
  - Extract timezone utility to shared location

#### Card Components

**`CoachBriefingCard`**
- **Purpose**: Display AI/heuristic coaching briefing
- **Reusability**: Low (dashboard-specific data structure)
- **Interface**: `{ briefing: DashboardBriefing | null }`
- **Cleanup Needed**: None (clean implementation)

**`RecoveryOverviewCard`**
- **Purpose**: Display recovery metrics, trends, and sparklines
- **Reusability**: Medium (could be used in dedicated recovery page)
- **Interface**: `{ recovery: RecoveryOverview & { sparkline: HealthSparklinePoint[] }, analysis: string | null }`
- **Cleanup Needed**:
  - Extract sparkline chart logic to separate component
  - Consolidate formatting functions with lib/format.ts

**`ActivityOverviewCard`**
- **Purpose**: Display activity summaries, discipline breakdown, fitness chart
- **Reusability**: Medium (could be used in training log page)
- **Interface**: `{ activity: ActivityOverview, analysis: string | null, fitnessTimeline?: FitnessPoint[] }`
- **Cleanup Needed**:
  - Extract `DisciplineRow` to separate component
  - Consolidate delta calculation logic

**`RecentActivitiesCard`**
- **Purpose**: Display recent activity list with links
- **Reusability**: High (generic activity list)
- **Interface**: `{ activities: ActivitySummary[] }`
- **Cleanup Needed**: None (clean implementation)

**`UpcomingWorkoutsCard`**
- **Purpose**: Display upcoming planned workouts
- **Reusability**: High (generic workout list)
- **Interface**: `{ workouts: PlannedWorkout[] }`
- **Cleanup Needed**: Verify implementation (not in provided files)

#### Shared Components

**`DashboardMetricTile`**
- **Purpose**: Display single metric with label, value, subtitle
- **Reusability**: **HIGH** - Generic metric display component
- **Interface**: `{ label: string, value: string, subtitle?: string, valueClassName?: string, className?: string }`
- **Recommendation**: Move to `components/ui/metric-tile.tsx` for app-wide use
- **Cleanup Needed**: None (clean, well-designed)

**`FitnessChart`**
- **Purpose**: Display CTL/ATL/TSB fitness timeline with Recharts
- **Reusability**: **HIGH** - Can be used in fitness page, activity detail
- **Interface**: `{ data?: FitnessPoint[], embedded?: boolean }`
- **Recommendation**: Move to `components/fitness-chart.tsx` for app-wide use
- **Cleanup Needed**: None (clean implementation)

### Backend Service

**`dashboard.py`** (818 lines)

#### Helper Functions (30+)

**Utility Functions** (Reusable)
- `_to_float()`: Convert any value to float or None
- `_to_zoneinfo()`: Parse timezone string to ZoneInfo
- `_date_range()`: Calculate date range for queries
- `_parse_date()`: Parse ISO date string
- `_parse_datetime()`: Parse ISO datetime string
- `_activity_local_date()`: Convert activity UTC time to local date
- **Recommendation**: Extract to `app/services/date_utils.py`

**Metric Calculation Functions** (Reusable)
- `_avg()`: Calculate average of float list
- `_extract_health_value()`: Extract specific health metric from row
- `_metric_direction()`: Calculate trend direction (up/down/stable)
- **Recommendation**: Extract to `app/services/metrics.py`

**Dashboard-Specific Functions** (Keep in dashboard.py)
- `_recovery_status()`: Determine recovery status from metrics
- `_activity_status()`: Determine activity status from load
- `_heuristic_briefing()`: Generate rule-based briefing
- `_build_daily_prompt_digest()`: Build AI prompt data structure
- `_build_ai_prompt()`: Format prompt for OpenAI
- `_parse_ai_briefing()`: Parse OpenAI response
- `_today_data_signature()`: Generate cache key for briefing
- `_generate_briefing()`: Call OpenAI API
- `_resolve_briefing()`: Retrieve or generate briefing

**Activity/Workout Functions** (Consider extracting)
- `_prompt_activity_key()`: Map discipline to prompt key
- `_upcoming_workout_payload()`: Format workout for response
- `_completion_rate_this_week()`: Calculate workout completion rate
- `_planned_summary()`: Aggregate planned workout data
- `_activity_summary_by_discipline()`: Aggregate activities by discipline
- `_sum_distance()`, `_sum_duration()`, `_sum_tss()`: Aggregate activity metrics
- **Recommendation**: Extract to `app/services/activity_aggregation.py`

**Fitness Functions** (Extract to fitness service)
- `_load_direction()`: Determine fitness direction from TSB
- **Recommendation**: Move to `app/services/fitness.py` (already has `get_fitness_timeline`)

#### Large Functions to Decompose

**`build_dashboard_overview()`** (150+ lines)
- **Issue**: Single function handles all aggregation logic
- **Refactoring Strategy**:
  1. Extract recovery aggregation to `_aggregate_recovery_data()`
  2. Extract activity aggregation to `_aggregate_activity_data()`
  3. Extract planned workout aggregation to `_aggregate_planned_data()`
  4. Keep main function as orchestrator

**`_build_daily_prompt_digest()`** (60+ lines)
- **Issue**: Complex nested loops and data transformation
- **Refactoring Strategy**:
  1. Extract health data formatting to `_format_health_for_prompt()`
  2. Extract training data aggregation to `_aggregate_training_for_prompt()`
  3. Keep main function as assembler

## Data Models

### Type Optimization Analysis

#### `DashboardOverview`

Current fields:
```typescript
{
  generated_at: string;
  timezone: string;
  last_sync_at: string | null;
  recovery: RecoveryOverview & { sparkline: HealthSparklinePoint[] };
  activity: ActivityOverview;
  briefing: DashboardBriefing | null;
  recent_activities: ActivitySummary[];
  upcoming_workouts: PlannedWorkout[];
  fitness_timeline: FitnessPoint[];
}
```

**Analysis**:
- `generated_at`: Always present → Keep as required
- `timezone`: Always present → Keep as required
- `last_sync_at`: Can be null (no sync yet) → Keep as nullable
- `recovery.sparkline`: Always present (empty array if no data) → Make required in intersection type
- `briefing`: Can be null (before 06:00 or no data) → Keep as nullable
- All other fields: Always present → Keep as required

**Recommendation**: No changes needed - types accurately reflect usage.

#### `RecoveryOverview`

Current fields:
```typescript
{
  status: string;
  headline: string;
  last_night: RecoveryLastNight;
  metrics: RecoveryMetricTrend[];
}
```

**Analysis**:
- All fields always present
- `status` should be union type: `"strong" | "strained" | "steady"`
- `metrics` always has 9 elements (RECOVERY_METRICS constant)

**Recommendation**:
```typescript
{
  status: "strong" | "strained" | "steady";
  headline: string;
  last_night: RecoveryLastNight;
  metrics: RecoveryMetricTrend[]; // Always length 9
}
```

#### `ActivityOverview`

Current fields:
```typescript
{
  status: string;
  headline: string;
  movement: { steps_avg_7d: number | null; daily_calories_avg_7d: number | null };
  last_7d: ActivityWindowSummary;
  previous_7d: ActivityWindowSummary;
  last_30d: { sessions: number; distance_km: number; duration_hours: number; discipline_breakdown: Record<string, number> };
  fitness: { ctl: number | null; atl: number | null; tsb: number | null; direction: string };
  planned: PlannedSummary;
}
```

**Analysis**:
- `status` should be union type: `"idle" | "overreaching" | "building" | "lighter" | "steady"`
- `fitness.direction` should be union type: `"unknown" | "fatigued" | "training" | "fresh" | "balanced"`
- All other fields correctly typed

**Recommendation**:
```typescript
{
  status: "idle" | "overreaching" | "building" | "lighter" | "steady";
  headline: string;
  movement: { steps_avg_7d: number | null; daily_calories_avg_7d: number | null };
  last_7d: ActivityWindowSummary;
  previous_7d: ActivityWindowSummary;
  last_30d: { sessions: number; distance_km: number; duration_hours: number; discipline_breakdown: Record<string, number> };
  fitness: { ctl: number | null; atl: number | null; tsb: number | null; direction: "unknown" | "fatigued" | "training" | "fresh" | "balanced" };
  planned: PlannedSummary;
}
```

#### `DashboardBriefing`

Current fields:
```typescript
{
  source: "ai" | "heuristic";
  generated_for_date: string;
  generated_at: string;
  ai_enabled: boolean;
  sleep_analysis: string;
  activity_analysis: string;
  recommendations: string[];
  caution: string | null;
}
```

**Analysis**:
- All fields correctly typed
- `recommendations` always has 1-4 elements (capped in code)

**Recommendation**: No changes needed.

#### Unused Type Fields

**`DashboardStats`** interface:
- **Status**: Appears unused in current dashboard implementation
- **Recommendation**: Remove if confirmed unused across entire codebase

## Error Handling

### Current Error Handling Patterns

**dashboard-content.tsx** has three error handling patterns:

1. **Initial Load Error**:
```typescript
catch (error: unknown) {
  const axiosErr = error as { response?: { status?: number; data?: { detail?: string } }; message?: string };
  const status = axiosErr?.response?.status;
  if (status === 401) {
    window.location.href = "/login";
    return;
  }
  const detail = axiosErr?.response?.data?.detail ?? axiosErr?.message ?? "Unknown error";
  if (!cancelled) setLoadError(`Failed to load dashboard: ${detail}`);
}
```

2. **Sync Error**:
```typescript
catch (error: unknown) {
  showSyncNotice("error", getErrorMessage(error));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detail ?? "Sync failed.";
}
```

3. **Post-Sync Refresh Error**:
```typescript
.catch(() => {
  showSyncNotice("error", "Dashboard refresh failed after sync.");
});
```

### Standardization Strategy

**Create Unified Error Handler** (`lib/error-handling.ts`):

```typescript
export interface ApiError {
  status?: number;
  message: string;
  detail?: string;
}

export function extractApiError(error: unknown): ApiError {
  // Handle Axios errors
  const axiosErr = error as { 
    response?: { 
      status?: number; 
      data?: { detail?: string } 
    }; 
    message?: string 
  };
  
  if (axiosErr.response) {
    return {
      status: axiosErr.response.status,
      message: axiosErr.response.data?.detail ?? axiosErr.message ?? "Request failed",
      detail: axiosErr.response.data?.detail,
    };
  }
  
  // Handle Error instances
  if (error instanceof Error) {
    return {
      message: error.message,
    };
  }
  
  // Fallback
  return {
    message: "An unknown error occurred",
  };
}

export function shouldRedirectToLogin(error: ApiError): boolean {
  return error.status === 401;
}
```

**Usage in dashboard-content.tsx**:
```typescript
import { extractApiError, shouldRedirectToLogin } from "@/lib/error-handling";

// Initial load
catch (error: unknown) {
  const apiError = extractApiError(error);
  if (shouldRedirectToLogin(apiError)) {
    window.location.href = "/login";
    return;
  }
  if (!cancelled) setLoadError(`Failed to load dashboard: ${apiError.message}`);
}

// Sync error
catch (error: unknown) {
  const apiError = extractApiError(error);
  showSyncNotice("error", apiError.message);
}
```

## Testing Strategy

### Unit Tests

**Backend Tests** (`backend/tests/test_dashboard.py`):

1. **Helper Function Tests**:
   - `test_to_float_conversion()`: Test `_to_float()` with various inputs
   - `test_timezone_parsing()`: Test `_to_zoneinfo()` with valid/invalid timezones
   - `test_date_range_calculation()`: Test `_date_range()` across timezones
   - `test_metric_direction()`: Test `_metric_direction()` with various deltas
   - `test_recovery_status()`: Test `_recovery_status()` with different metric combinations
   - `test_activity_status()`: Test `_activity_status()` with various load scenarios

2. **Aggregation Tests**:
   - `test_activity_summary_by_discipline()`: Test discipline aggregation
   - `test_planned_summary()`: Test workout planning aggregation
   - `test_completion_rate_calculation()`: Test workout completion rate

3. **Briefing Tests**:
   - `test_heuristic_briefing_generation()`: Test rule-based briefing
   - `test_briefing_signature_generation()`: Test cache key generation
   - `test_briefing_caching()`: Test briefing retrieval vs regeneration

4. **Integration Tests**:
   - `test_dashboard_overview_endpoint()`: Test full endpoint with mock data
   - `test_dashboard_with_no_data()`: Test endpoint with new user (no activities/health)
   - `test_dashboard_timezone_handling()`: Test timezone conversion

**Frontend Tests** (`frontend/app/(app)/dashboard/__tests__/`):

1. **Component Tests**:
   - `test_coach_briefing_card_rendering()`: Test with/without briefing
   - `test_recovery_overview_card_metrics()`: Test metric display
   - `test_activity_overview_card_disciplines()`: Test discipline rows
   - `test_dashboard_metric_tile()`: Test metric tile variants

2. **Integration Tests**:
   - `test_dashboard_content_loading()`: Test loading state
   - `test_dashboard_content_error()`: Test error state
   - `test_dashboard_sync_flow()`: Test Garmin sync event handling

3. **Utility Tests**:
   - `test_error_extraction()`: Test error handling utility
   - `test_timezone_utility()`: Test timezone helper

### Property-Based Testing Assessment

**Is PBT Appropriate for Dashboard Cleanup?**

No. This feature is a refactoring effort focused on:
- Code removal (unused imports, commented code)
- Code reorganization (extracting functions, moving files)
- Type system improvements (adding union types)
- Documentation (dependency mapping)

These are structural changes, not algorithmic logic that would benefit from property-based testing.

**Testing Approach**:
- **Unit tests**: Verify specific helper functions work correctly
- **Integration tests**: Verify API responses remain identical before/after refactoring
- **Snapshot tests**: Verify UI rendering remains unchanged
- **Performance tests**: Verify no performance regression

**No Correctness Properties section needed** - this is infrastructure work, not feature development.

## Performance Validation

### Baseline Metrics to Capture

**Before Cleanup**:

1. **Backend Performance**:
   - `/dashboard/overview` response time (p50, p95, p99)
   - Database query count
   - Database query time
   - Memory usage during request

2. **Frontend Performance**:
   - Time to First Byte (TTFB)
   - First Contentful Paint (FCP)
   - Largest Contentful Paint (LCP)
   - Time to Interactive (TTI)
   - JavaScript bundle size

3. **Measurement Approach**:
   ```python
   # Backend: Add timing middleware
   import time
   from fastapi import Request
   
   @app.middleware("http")
   async def add_timing_header(request: Request, call_next):
       start = time.time()
       response = await call_next(request)
       duration = time.time() - start
       response.headers["X-Response-Time"] = str(duration)
       return response
   ```
   
   ```typescript
   // Frontend: Use Performance API
   const navigationTiming = performance.getEntriesByType("navigation")[0];
   const paintTiming = performance.getEntriesByType("paint");
   ```

**After Cleanup**:
- Re-measure all metrics
- Compare against baseline
- **Acceptance Criteria**: All metrics within 10% of baseline
- If any metric degrades >10%, investigate and fix before completion

### Expected Performance Impact

**Backend**:
- **Neutral to Positive**: Extracting functions should have no runtime impact (same code, different organization)
- **Potential Improvement**: Removing unused code may slightly reduce module load time

**Frontend**:
- **Neutral**: Removing unused imports may slightly reduce bundle size
- **Neutral**: Moving components to different files has no runtime impact
- **Potential Improvement**: Consolidating duplicate logic may reduce bundle size

## Implementation Strategy

### Phase 1: Analysis & Documentation (1-2 hours)

**Tasks**:
1. Run static analysis to identify unused imports/variables
2. Search for commented-out code blocks
3. Search for TODO comments
4. Map component dependencies (create dependency diagram)
5. Document reusability assessment for each component
6. Identify duplicate logic patterns

**Deliverables**:
- `DASHBOARD_DEPENDENCIES.md`: Component dependency map
- `REUSABILITY_ASSESSMENT.md`: Component reusability analysis
- List of unused code to remove
- List of duplicate logic to consolidate

### Phase 2: Type System Optimization (1 hour)

**Tasks**:
1. Update `RecoveryOverview.status` to union type
2. Update `ActivityOverview.status` to union type
3. Update `ActivityOverview.fitness.direction` to union type
4. Verify TypeScript compilation
5. Update backend response to match (if needed)

**Validation**:
- `npm run build` succeeds
- No TypeScript errors
- API response matches types

### Phase 3: Backend Refactoring (3-4 hours)

**Tasks**:
1. Create `app/services/date_utils.py` and move date/timezone utilities
2. Create `app/services/metrics.py` and move metric calculation utilities
3. Create `app/services/activity_aggregation.py` and move activity aggregation functions
4. Move `_load_direction()` to `app/services/fitness.py`
5. Decompose `build_dashboard_overview()` into sub-functions
6. Decompose `_build_daily_prompt_digest()` into sub-functions
7. Update imports in `dashboard.py`
8. Remove unused helper functions (if any identified)

**Validation**:
- All tests pass
- API response structure unchanged (use snapshot comparison)
- Performance within 10% of baseline

### Phase 4: Frontend Refactoring (2-3 hours)

**Tasks**:
1. Create `lib/error-handling.ts` and implement unified error handler
2. Update `dashboard-content.tsx` to use unified error handler
3. Move `DashboardMetricTile` to `components/ui/metric-tile.tsx`
4. Move `FitnessChart` to `components/fitness-chart.tsx`
5. Update imports in dashboard components
6. Extract timezone utility to `lib/timezone.ts`
7. Consolidate formatting logic (if duplicates found)
8. Remove commented-out code
9. Remove unused imports

**Validation**:
- `npm run build` succeeds
- Dashboard renders identically
- All interactions work (sync, error states)
- Performance within 10% of baseline

### Phase 5: Documentation & Validation (1 hour)

**Tasks**:
1. Create `frontend/app/(app)/dashboard/README.md` with:
   - Component overview
   - Data flow diagram
   - Dependency map
   - Reusability notes
2. Update component JSDoc comments
3. Run full test suite
4. Measure final performance metrics
5. Compare against baseline

**Deliverables**:
- Dashboard README
- Performance comparison report
- Test coverage report

## Dependency Map

### Frontend Dependencies

```
page.tsx
  └─ dashboard-content.tsx
      ├─ CoachBriefingCard
      │   └─ DashboardBriefing type
      ├─ RecoveryOverviewCard
      │   ├─ RecoveryOverview type
      │   ├─ HealthSparklinePoint type
      │   ├─ DashboardMetricTile
      │   └─ Recharts (LineChart)
      ├─ ActivityOverviewCard
      │   ├─ ActivityOverview type
      │   ├─ FitnessPoint type
      │   ├─ DashboardMetricTile
      │   └─ FitnessChart
      │       └─ Recharts (LineChart)
      ├─ RecentActivitiesCard
      │   ├─ ActivitySummary type
      │   └─ lib/format utilities
      └─ UpcomingWorkoutsCard
          └─ PlannedWorkout type
```

### Backend Dependencies

```
GET /dashboard/overview
  └─ build_dashboard_overview()
      ├─ Supabase queries
      │   ├─ activities (last 30d)
      │   ├─ daily_health (last 30d)
      │   ├─ workouts (non-template)
      │   └─ goals (active)
      ├─ get_fitness_timeline() [fitness.py]
      ├─ activity_training_load() [fitness.py]
      ├─ _resolve_briefing()
      │   ├─ _today_data_signature()
      │   ├─ _generate_briefing()
      │   │   ├─ _heuristic_briefing()
      │   │   ├─ _build_ai_prompt()
      │   │   │   └─ _build_daily_prompt_digest()
      │   │   └─ OpenAI API
      │   └─ Supabase (daily_briefings table)
      └─ Multiple aggregation helpers
```

### Shared Utilities

```
lib/format.ts
  ├─ formatDuration()
  ├─ formatPace()
  ├─ formatDistance()
  ├─ formatSteps()
  ├─ formatCalories()
  ├─ formatHRV()
  ├─ formatSleepScore()
  ├─ formatDate()
  ├─ formatRelativeDate()
  ├─ getDisciplineMeta()
  └─ primaryStat()

lib/types.ts
  ├─ Discipline
  ├─ ActivitySummary
  ├─ DashboardOverview
  ├─ RecoveryOverview
  ├─ ActivityOverview
  ├─ DashboardBriefing
  └─ [20+ other types]
```

## Risk Assessment

### Low Risk Changes

- Removing unused imports
- Removing commented-out code
- Adding JSDoc comments
- Creating documentation files
- Moving components to different files (with import updates)
- Extracting helper functions to new modules (with import updates)

### Medium Risk Changes

- Consolidating duplicate logic (must verify identical behavior)
- Decomposing large functions (must verify identical output)
- Changing type definitions (must verify API compatibility)
- Standardizing error handling (must verify all error paths work)

### High Risk Changes

- None identified (this is a refactoring effort with no logic changes)

### Mitigation Strategies

1. **Snapshot Testing**: Capture API response before refactoring, compare after
2. **Incremental Changes**: Make one change at a time, test after each
3. **Git Branching**: Use feature branch, can revert if issues arise
4. **Performance Monitoring**: Measure before/after, rollback if degradation >10%
5. **Manual Testing**: Test all dashboard interactions after each phase

## Success Criteria

### Functional Requirements

- ✅ Dashboard loads without errors
- ✅ All card components render correctly
- ✅ Garmin sync triggers and updates dashboard
- ✅ Error states display correctly
- ✅ All links navigate correctly
- ✅ API response structure unchanged

### Code Quality Requirements

- ✅ No unused imports
- ✅ No commented-out code
- ✅ No TODO comments for incomplete work
- ✅ All functions <50 lines (except main orchestrators)
- ✅ No duplicate logic (consolidated to utilities)
- ✅ Consistent error handling pattern
- ✅ All components documented

### Performance Requirements

- ✅ API response time within 10% of baseline
- ✅ Page load time within 10% of baseline
- ✅ Bundle size not increased (ideally decreased)

### Documentation Requirements

- ✅ Component dependency map created
- ✅ Reusability assessment documented
- ✅ Dashboard README created
- ✅ All extracted utilities documented

## Conclusion

This design provides a comprehensive plan for cleaning up the dashboard codebase while maintaining functionality and performance. The phased approach allows for incremental validation and reduces risk. The focus on reusability assessment and documentation will benefit future development efforts.

Key outcomes:
- Cleaner, more maintainable codebase
- Identified reusable components for app-wide use
- Consolidated utility functions
- Improved type safety
- Standardized error handling
- Comprehensive documentation

The cleanup effort requires approximately 8-11 hours of development time and will significantly improve code quality without impacting users.
