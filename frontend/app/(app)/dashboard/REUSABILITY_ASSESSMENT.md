# Dashboard Component Reusability Assessment

## Executive Summary

This document analyzes the reusability potential of all dashboard components to inform future development and prevent code duplication. Components are rated on a scale of **Low**, **Medium**, or **High** reusability based on their coupling to dashboard-specific data structures, interface generality, and potential use cases elsewhere in the application.

**Key Findings:**
- **2 components** are highly reusable and should be moved to shared locations
- **3 components** have medium reusability with some refactoring needed
- **2 components** are dashboard-specific and should remain in place

---

## Component Analysis

### 1. DashboardMetricTile

**File:** `dashboard-metric-tile.tsx`

**Reusability Rating:** ⭐⭐⭐ **HIGH**

#### Interface

```typescript
{
  label: string;
  value: string;
  subtitle?: string;
  valueClassName?: string;
  className?: string;
}
```

#### Analysis

**Strengths:**
- Completely generic interface with no dashboard-specific dependencies
- Clean, minimal design that fits multiple contexts
- Flexible styling via `valueClassName` and `className` props
- No external dependencies beyond UI utilities
- Self-contained with no side effects

**Current Usage:**
- RecoveryOverviewCard: 6 instances (sleep score, sleep time, HRV, resting HR, readiness, SpO2)
- ActivityOverviewCard: 6 instances (steps, calories, sessions, time, TSS, form)

**Potential Use Cases:**
- Settings page: athlete profile metrics (FTP, threshold pace, max HR)
- Activity detail page: activity summary metrics (distance, duration, pace, HR)
- Workout detail page: workout metrics (estimated TSS, duration, intensity)
- Route planner: route metrics (distance, elevation, estimated time)
- Any page requiring metric display in a consistent tile format

#### Recommendation

**Action:** Move to `frontend/components/ui/metric-tile.tsx`

**Rationale:** This component is a pure UI primitive with zero domain logic. It belongs alongside other shadcn/ui components like Button, Card, and Badge. Moving it to the shared UI library will:
- Make it discoverable for all developers
- Establish it as the standard metric display pattern
- Prevent duplicate implementations
- Enable consistent metric styling across the app

**Migration Impact:** Low
- Update 2 import statements in dashboard components
- No interface changes needed
- No breaking changes

---

### 2. FitnessChart

**File:** `fitness-chart.tsx`

**Reusability Rating:** ⭐⭐⭐ **HIGH**

#### Interface

```typescript
{
  data?: FitnessPoint[];
  embedded?: boolean;
}
```

Where `FitnessPoint` is:
```typescript
{
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  daily_tss: number;
}
```

#### Analysis

**Strengths:**
- Generic fitness data visualization (CTL/ATL/TSB)
- Flexible display mode via `embedded` prop
- Self-contained chart logic with no external state
- Comprehensive TSB status interpretation
- Works with any fitness timeline data

**Current Usage:**
- ActivityOverviewCard: embedded mode showing last 60 days

**Potential Use Cases:**
- Dedicated fitness/analytics page: full-page chart with extended timeline
- Activity detail page: show fitness context around activity date
- Training plan page: visualize planned vs actual fitness progression
- Coach page: display fitness trends as context for AI recommendations
- Settings page: show fitness history to inform profile updates (e.g., FTP changes)

**Domain Coupling:**
- Tightly coupled to fitness metrics (CTL/ATL/TSB) but these are universal training concepts
- TSB status thresholds (+10, 0, -10, -30) are standard in endurance training
- No dashboard-specific logic

#### Recommendation

**Action:** Move to `frontend/components/fitness-chart.tsx`

**Rationale:** Fitness metrics are a core domain concept used across multiple features. This chart should be a shared component at the app level (not in `/ui` since it's domain-specific, not a primitive). Moving it will:
- Enable fitness visualization on any page
- Establish consistent fitness interpretation across the app
- Support future analytics features
- Maintain single source of truth for TSB status logic

**Migration Impact:** Low
- Update 1 import statement in ActivityOverviewCard
- No interface changes needed
- No breaking changes

---

### 3. CoachBriefingCard

**File:** `coach-briefing-card.tsx`

**Reusability Rating:** ⭐ **LOW**

#### Interface

```typescript
{
  briefing: DashboardBriefing | null;
}
```

Where `DashboardBriefing` is:
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

#### Analysis

**Strengths:**
- Clean visual design with accent bars and numbered recommendations
- Handles null state gracefully with informative message
- Self-contained rendering logic

**Limitations:**
- Tightly coupled to `DashboardBriefing` data structure
- Specific to daily morning briefing use case
- "Morning Briefing" and "Coach Readout" labels are hardcoded
- Null state message references dashboard-specific timing ("after 06:00")

**Current Usage:**
- Dashboard only: displays daily AI/heuristic coaching briefing

**Potential Use Cases:**
- Coach page: could display historical briefings or detailed analysis
- Activity detail page: could show activity-specific coaching insights

**Refactoring for Reusability:**
To make this component reusable, it would need:
1. Generic title/subtitle props instead of hardcoded "Morning Briefing"
2. Configurable null state message
3. Optional sections (hide sleep_analysis/activity_analysis if not needed)
4. Renamed to `CoachingInsightCard` or similar

However, the effort required likely exceeds the benefit since coaching briefings are primarily a dashboard feature.

#### Recommendation

**Action:** Keep in `frontend/app/(app)/dashboard/coach-briefing-card.tsx`

**Rationale:** This component is purpose-built for the dashboard's daily briefing feature. While it could theoretically be generalized, the dashboard is its primary (and likely only) use case. The cost of abstraction outweighs the benefit. If coaching insights are needed elsewhere, consider:
- Creating a new component for that specific use case
- Extracting shared sub-components (e.g., `BriefingPanel`) if patterns emerge

---

### 4. RecoveryOverviewCard

**File:** `recovery-overview-card.tsx`

**Reusability Rating:** ⭐⭐ **MEDIUM**

#### Interface

```typescript
{
  recovery: RecoveryOverview & { sparkline: HealthSparklinePoint[] };
  analysis: string | null;
}
```

Where `RecoveryOverview` is:
```typescript
{
  status: string;
  headline: string;
  last_night: RecoveryLastNight;
  metrics: RecoveryMetricTrend[];
}
```

#### Analysis

**Strengths:**
- Comprehensive recovery data visualization
- Reusable sub-components: `DashboardMetricTile`, sparkline charts
- Clean separation of concerns (metrics, trends, sparklines)
- Flexible metric display (handles null values gracefully)

**Limitations:**
- Tightly coupled to `RecoveryOverview` data structure from dashboard API
- Hardcoded "Recovery" and "Body Response" labels
- Displays exactly 6 metric tiles in specific order (sleep score, sleep time, HRV, resting HR, readiness, SpO2)
- Sparkline section assumes 30-day data
- Metric trend table shows first 5 metrics only

**Current Usage:**
- Dashboard only: displays recovery metrics and trends

**Potential Use Cases:**
- Dedicated recovery/health page: full-screen recovery dashboard
- Activity detail page: show recovery context before/after activity
- Settings page: display recovery trends to inform profile updates
- Coach page: show recovery data as context for AI recommendations

**Refactoring for Reusability:**
To make this component reusable, consider:
1. Extract sparkline chart to separate `HealthSparklineChart` component
2. Extract metric trend table to separate `MetricTrendTable` component
3. Make metric tile layout configurable (which metrics to show, order)
4. Make labels configurable via props
5. Rename to `RecoveryCard` or `HealthMetricsCard`

#### Recommendation

**Action:** Keep in `frontend/app/(app)/dashboard/recovery-overview-card.tsx` for now

**Rationale:** While this component has reuse potential, it's currently optimized for the dashboard's specific layout and data structure. Before moving it:
1. Wait for a concrete second use case to emerge
2. Extract sub-components (sparkline, trend table) if they're needed independently
3. Refactor based on actual requirements rather than speculative needs

**Future Consideration:** If a dedicated recovery/health page is built, extract shared logic at that time.

---

### 5. ActivityOverviewCard

**File:** `activity-overview-card.tsx`

**Reusability Rating:** ⭐⭐ **MEDIUM**

#### Interface

```typescript
{
  activity: ActivityOverview;
  analysis: string | null;
  fitnessTimeline?: FitnessPoint[];
}
```

Where `ActivityOverview` is:
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

#### Analysis

**Strengths:**
- Comprehensive activity data visualization
- Reusable sub-components: `DashboardMetricTile`, `FitnessChart`, `DisciplineRow`
- Clean discipline breakdown with delta calculations
- Flexible fitness chart integration

**Limitations:**
- Tightly coupled to `ActivityOverview` data structure from dashboard API
- Hardcoded "Activity" and "Training Direction" labels
- Displays exactly 6 metric tiles in specific order (steps, calories, sessions, time, TSS, form)
- Discipline rows hardcoded to 5 disciplines (swim, bike, run, strength, mobility)
- Delta calculation logic embedded in component

**Current Usage:**
- Dashboard only: displays activity summary and trends

**Potential Use Cases:**
- Dedicated training log/analytics page: full-screen activity dashboard
- Activity feed page: summary card at top showing recent trends
- Coach page: show activity data as context for AI recommendations
- Settings page: display activity trends to inform profile updates

**Refactoring for Reusability:**
To make this component reusable, consider:
1. Extract `DisciplineRow` to separate component (already identified in design doc)
2. Extract delta calculation logic to utility function
3. Make metric tile layout configurable
4. Make discipline list configurable (which disciplines to show)
5. Make labels configurable via props
6. Rename to `ActivitySummaryCard` or `TrainingOverviewCard`

**Sub-component: DisciplineRow**

The `DisciplineRow` component is a good candidate for extraction:

```typescript
interface DisciplineRowProps {
  label: string;
  icon: string;
  current: DisciplineSummary;
  previous: DisciplineSummary;
  showDistance: boolean;
}
```

This could be used in:
- Training log page: show discipline breakdown by week/month
- Activity feed: filter/group by discipline
- Analytics page: compare disciplines over time

#### Recommendation

**Action:** Keep in `frontend/app/(app)/dashboard/activity-overview-card.tsx` for now

**Rationale:** Similar to RecoveryOverviewCard, this component is optimized for the dashboard's specific needs. Before moving it:
1. Wait for a concrete second use case
2. Extract `DisciplineRow` if needed independently (likely candidate)
3. Extract delta calculation logic to `lib/format.ts` or new `lib/metrics.ts`

**Immediate Action:** Extract `deltaBadge` function to `lib/format.ts` as it's a generic utility:

```typescript
// lib/format.ts
export function formatDelta(
  current: number,
  previous: number,
  unit: string,
  precision: number = 1
): { text: string; color: string } | null {
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return null;
  const sign = diff > 0 ? "+" : "";
  const formatted = Number.isInteger(diff) ? diff.toFixed(0) : diff.toFixed(precision);
  return {
    text: `${sign}${formatted}${unit}`,
    color: diff > 0 ? "text-emerald-600" : "text-rose-500",
  };
}
```

---

### 6. RecentActivitiesCard

**File:** `recent-activities-card.tsx`

**Reusability Rating:** ⭐⭐⭐ **HIGH** (with minor refactoring)

#### Interface

```typescript
{
  activities: ActivitySummary[];
}
```

Where `ActivitySummary` is:
```typescript
{
  id: string;
  garmin_activity_id: number | null;
  discipline: Discipline;
  name: string | null;
  start_time: string;
  duration_seconds: number | null;
  calories: number | null;
  distance_meters: number | null;
  elevation_gain_meters: number | null;
  avg_hr: number | null;
  avg_pace_sec_per_km: number | null;
  avg_power_watts: number | null;
  tss: number | null;
  total_sets: number | null;
  total_volume_kg: number | null;
  session_type: string | null;
}
```

#### Analysis

**Strengths:**
- Generic activity list display
- Uses standard `ActivitySummary` type (shared across app)
- Clean, accessible list design with hover states
- Handles empty state gracefully
- Uses shared formatting utilities (`getDisciplineMeta`, `formatDuration`, `formatRelativeDate`, `primaryStat`)

**Limitations:**
- Hardcoded "Recent activities" title
- Hardcoded "View all →" link to `/activities`
- Empty state message references Garmin connection (dashboard-specific)

**Current Usage:**
- Dashboard: displays last 5 activities

**Potential Use Cases:**
- Activity feed page: could use same component for filtered lists
- Coach page: show recent activities as context
- Workout detail page: show recent activities of same discipline
- Settings page: show recent activities to verify sync status
- Any page needing a compact activity list

**Refactoring for Reusability:**
Simple changes to make this fully reusable:

```typescript
interface ActivityListCardProps {
  activities: ActivitySummary[];
  title?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  emptyMessage?: string | React.ReactNode;
  maxItems?: number;
}
```

With defaults:
- `title = "Recent activities"`
- `viewAllHref = "/activities"`
- `viewAllLabel = "View all →"`
- `emptyMessage = "No activities yet."`
- `maxItems = undefined` (show all)

#### Recommendation

**Action:** Refactor and move to `frontend/components/activity-list-card.tsx`

**Rationale:** This component is nearly generic already. With minor prop additions, it becomes a highly reusable activity list component. The refactoring cost is minimal and the benefit is high.

**Migration Steps:**
1. Add optional props for title, links, and empty state
2. Move to `frontend/components/activity-list-card.tsx`
3. Update dashboard to use new component with default props
4. Use in other pages as needed

**Alternative:** Keep as `RecentActivitiesCard` in dashboard and create a separate `ActivityListCard` when needed elsewhere. This avoids premature abstraction.

**Recommended Approach:** Wait for second use case, then refactor.

---

### 7. UpcomingWorkoutsCard

**File:** `upcoming-workouts-card.tsx`

**Reusability Rating:** ⭐⭐⭐ **HIGH** (with minor refactoring)

#### Interface

```typescript
{
  workouts: PlannedWorkout[];
}
```

Where `PlannedWorkout` is:
```typescript
{
  id: string;
  name: string;
  discipline: Discipline;
  scheduled_date: string;
  estimated_duration_seconds: number | null;
  estimated_tss: number | null;
  description: string | null;
}
```

#### Analysis

**Strengths:**
- Generic workout list display
- Uses standard `PlannedWorkout` type (shared across app)
- Clean card design with discipline icons
- Handles empty state gracefully
- Uses shared formatting utilities (`getDisciplineMeta`, `formatDate`, `formatDuration`)

**Limitations:**
- Hardcoded "Planned workouts" title
- Hardcoded "Manage" button linking to `/workouts`
- Empty state message is dashboard-specific

**Current Usage:**
- Dashboard: displays upcoming planned workouts

**Potential Use Cases:**
- Workout page: could use same component for filtered lists
- Activity detail page: show upcoming workouts of same discipline
- Coach page: show upcoming workouts as context for recommendations
- Calendar view: show workouts for selected date range
- Any page needing a compact workout list

**Refactoring for Reusability:**
Simple changes to make this fully reusable:

```typescript
interface WorkoutListCardProps {
  workouts: PlannedWorkout[];
  title?: string;
  actionButton?: { label: string; href: string } | null;
  emptyMessage?: string | React.ReactNode;
  maxItems?: number;
  showDate?: boolean;
}
```

With defaults:
- `title = "Planned workouts"`
- `actionButton = { label: "Manage", href: "/workouts" }`
- `emptyMessage = "No scheduled workouts yet."`
- `maxItems = undefined` (show all)
- `showDate = true`

#### Recommendation

**Action:** Refactor and move to `frontend/components/workout-list-card.tsx`

**Rationale:** Similar to RecentActivitiesCard, this component is nearly generic. With minor prop additions, it becomes highly reusable. The refactoring cost is minimal.

**Migration Steps:**
1. Add optional props for title, action button, and empty state
2. Move to `frontend/components/workout-list-card.tsx`
3. Update dashboard to use new component with default props
4. Use in other pages as needed

**Alternative:** Wait for second use case, then refactor.

**Recommended Approach:** Wait for second use case, then refactor.

---

## Summary Table

| Component | Reusability | Current Location | Recommended Action | Priority |
|-----------|-------------|------------------|-------------------|----------|
| DashboardMetricTile | ⭐⭐⭐ High | `dashboard/` | Move to `components/ui/metric-tile.tsx` | **High** |
| FitnessChart | ⭐⭐⭐ High | `dashboard/` | Move to `components/fitness-chart.tsx` | **High** |
| RecentActivitiesCard | ⭐⭐⭐ High* | `dashboard/` | Refactor when second use case emerges | Medium |
| UpcomingWorkoutsCard | ⭐⭐⭐ High* | `dashboard/` | Refactor when second use case emerges | Medium |
| RecoveryOverviewCard | ⭐⭐ Medium | `dashboard/` | Keep in place; extract sub-components if needed | Low |
| ActivityOverviewCard | ⭐⭐ Medium | `dashboard/` | Keep in place; extract `deltaBadge` utility | Low |
| CoachBriefingCard | ⭐ Low | `dashboard/` | Keep in place | N/A |

\* Requires minor refactoring to add configurable props

---

## Utility Function Extraction

### Immediate Extractions

These utility functions should be extracted to `lib/format.ts` or a new `lib/metrics.ts`:

#### 1. Delta Calculation (from ActivityOverviewCard)

```typescript
// lib/format.ts or lib/metrics.ts
export function formatDelta(
  current: number,
  previous: number,
  unit: string,
  precision: number = 1
): { text: string; color: string } | null {
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return null;
  const sign = diff > 0 ? "+" : "";
  const formatted = Number.isInteger(diff) ? diff.toFixed(0) : diff.toFixed(precision);
  return {
    text: `${sign}${formatted}${unit}`,
    color: diff > 0 ? "text-emerald-600" : "text-rose-500",
  };
}
```

**Usage:** ActivityOverviewCard, potentially other comparison views

#### 2. Metric Formatting (from RecoveryOverviewCard)

```typescript
// lib/format.ts
export function formatMetricValue(
  value: number | null,
  unit: string,
  precision?: number
): string {
  if (value === null) return "—";
  const p = precision ?? (Number.isInteger(value) ? 0 : 1);
  const rounded = value.toFixed(p);
  return `${rounded}${unit ? ` ${unit}` : ""}`;
}
```

**Usage:** RecoveryOverviewCard, potentially other metric displays

#### 3. Trend Direction Label (from RecoveryOverviewCard)

```typescript
// lib/format.ts
export function formatTrendDirection(direction: string): string {
  if (direction === "up") return "Improving";
  if (direction === "down") return "Softening";
  if (direction === "stable") return "Stable";
  return "—";
}

export function getTrendColor(direction: string): string {
  if (direction === "up") return "text-emerald-600";
  if (direction === "down") return "text-rose-500";
  return "text-zinc-400";
}
```

**Usage:** RecoveryOverviewCard, potentially other trend displays

### Future Extractions

These could be extracted if additional use cases emerge:

- `statusColor()` functions (recovery, activity) → `lib/status-colors.ts`
- `TrendRow` component (from RecoveryOverviewCard) → `components/health-sparkline.tsx`
- `DisciplineRow` component (from ActivityOverviewCard) → `components/discipline-row.tsx`

---

## Implementation Recommendations

### Phase 1: High-Priority Moves (Immediate)

1. **Move DashboardMetricTile to shared UI**
   - Target: `frontend/components/ui/metric-tile.tsx`
   - Impact: 2 import updates in dashboard
   - Benefit: Establishes standard metric display pattern
   - Effort: 15 minutes

2. **Move FitnessChart to shared components**
   - Target: `frontend/components/fitness-chart.tsx`
   - Impact: 1 import update in dashboard
   - Benefit: Enables fitness visualization across app
   - Effort: 10 minutes

3. **Extract delta calculation utility**
   - Target: `frontend/lib/format.ts` (add `formatDelta` function)
   - Impact: 1 function replacement in ActivityOverviewCard
   - Benefit: Reusable comparison logic
   - Effort: 20 minutes

**Total Phase 1 Effort:** ~45 minutes

### Phase 2: Medium-Priority Refactoring (When Needed)

4. **Refactor RecentActivitiesCard**
   - Trigger: When second use case emerges (e.g., coach page, workout detail)
   - Add configurable props (title, links, empty state)
   - Move to `frontend/components/activity-list-card.tsx`
   - Effort: 1 hour

5. **Refactor UpcomingWorkoutsCard**
   - Trigger: When second use case emerges (e.g., calendar view, coach page)
   - Add configurable props (title, action button, empty state)
   - Move to `frontend/components/workout-list-card.tsx`
   - Effort: 1 hour

### Phase 3: Low-Priority Extractions (Optional)

6. **Extract metric formatting utilities**
   - Add `formatMetricValue`, `formatTrendDirection`, `getTrendColor` to `lib/format.ts`
   - Update RecoveryOverviewCard to use utilities
   - Effort: 30 minutes

7. **Extract sub-components if needed**
   - `DisciplineRow` → `components/discipline-row.tsx`
   - `TrendRow` → `components/health-sparkline.tsx`
   - Only if used independently elsewhere
   - Effort: 1-2 hours per component

---

## Design Patterns Observed

### 1. Status Badge Pattern

Multiple components use status badges with color coding:

```typescript
// RecoveryOverviewCard
function statusColor(status: string) {
  if (status === "strong") return "bg-emerald-50 text-emerald-700";
  if (status === "strained") return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}

// ActivityOverviewCard
function statusColor(status: string) {
  if (status === "building") return "bg-emerald-50 text-emerald-700";
  if (status === "overreaching") return "bg-rose-50 text-rose-700";
  if (status === "idle") return "bg-zinc-100 text-zinc-500";
  return "bg-amber-50 text-amber-700";
}
```

**Recommendation:** Create a shared `StatusBadge` component or utility function if this pattern is used elsewhere.

### 2. Section Label Pattern

Consistent uppercase label styling:

```typescript
const SECTION_LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400";
```

**Recommendation:** Consider extracting to `lib/styles.ts` or creating a `SectionLabel` component if used widely.

### 3. Metric Tile Grid Pattern

Both RecoveryOverviewCard and ActivityOverviewCard use similar grid layouts:

```typescript
<div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
  <DashboardMetricTile ... />
  <DashboardMetricTile ... />
  ...
</div>
```

**Recommendation:** This pattern works well. No extraction needed, but document as standard approach.

---

## Testing Recommendations

When moving components to shared locations, ensure:

1. **Visual Regression Testing**
   - Dashboard should render identically after moves
   - Take screenshots before/after for comparison

2. **Unit Tests**
   - Test moved components in isolation
   - Test with various prop combinations
   - Test edge cases (null values, empty arrays)

3. **Integration Tests**
   - Test dashboard still loads correctly
   - Test all card components render
   - Test interactions (links, hover states)

4. **Accessibility Testing**
   - Verify keyboard navigation works
   - Verify screen reader compatibility
   - Verify color contrast ratios

---

## Conclusion

The dashboard components demonstrate good separation of concerns and reusability potential. The immediate priority is moving `DashboardMetricTile` and `FitnessChart` to shared locations, as they are fully generic and have clear use cases across the application.

For the remaining components, the recommended approach is to wait for concrete second use cases before refactoring. This avoids premature abstraction while keeping the door open for future reuse.

The utility function extractions (delta calculation, metric formatting) should be done during the current cleanup phase to establish shared patterns and prevent future duplication.

---

**Document Version:** 1.0  
**Last Updated:** 2024  
**Related Documents:**
- `DASHBOARD_DEPENDENCIES.md` - Component dependency map
- `UNUSED_CODE_FINDINGS.md` - Unused code analysis
- `.kiro/specs/dashboard-cleanup/design.md` - Cleanup design document
