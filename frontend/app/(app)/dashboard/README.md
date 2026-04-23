# Dashboard

The dashboard is the primary landing page of Personal Coach. It aggregates recovery metrics, activity summaries, an AI-generated coaching briefing, and a workout timeline into a single daily view.

## Component Overview

| Component | File | Purpose |
|---|---|---|
| `DashboardContent` | `dashboard-content.tsx` | Client orchestrator — manages API calls, Garmin sync events, and state |
| `CoachBriefingCard` | `coach-briefing-card.tsx` | Daily AI or heuristic coaching briefing (sleep, activity, recommendations) |
| `RecoveryOverviewCard` | `recovery-overview-card.tsx` | 9 recovery metrics with 7d/30d trends and 30-day sparklines |
| `ActivityOverviewCard` | `activity-overview-card.tsx` | Activity summaries by discipline, fitness chart (CTL/ATL/TSB) |
| `RecentActivitiesCard` | `recent-activities-card.tsx` | Last 6 activities with links to detail views |
| `UpcomingWorkoutsCard` | `upcoming-workouts-card.tsx` | Next 6 scheduled workouts |

### Shared Components (moved to app-wide locations)

| Component | New Location | Notes |
|---|---|---|
| `MetricTile` | `components/ui/metric-tile.tsx` | Generic metric display tile — use this across the app |
| `FitnessChart` | `components/fitness-chart.tsx` | CTL/ATL/TSB chart — reusable on any page with fitness data |

## Data Flow

```
page.tsx (SSR, Suspense boundary)
  └─ DashboardContent (CSR)
       │
       ├─ GET /api/v1/dashboard/overview
       │    └─ X-User-Timezone header (from lib/timezone.ts)
       │
       ├─ CoachBriefingCard        ← data.briefing
       ├─ RecoveryOverviewCard     ← data.recovery + data.briefing?.sleep_analysis
       ├─ ActivityOverviewCard     ← data.activity + data.briefing?.activity_analysis + data.fitness_timeline
       ├─ RecentActivitiesCard     ← data.recent_activities
       └─ UpcomingWorkoutsCard     ← data.upcoming_workouts
```

### Backend Data Sources

The `/dashboard/overview` endpoint aggregates four parallel Supabase queries:

| Query | Table | Filter |
|---|---|---|
| Activities | `activities` | Last 30 days, ordered by `start_time DESC` |
| Health | `daily_health` | Last 30 days, ordered by `date DESC` |
| Workouts | `workouts` | Non-template, ordered by `updated_at ASC` |
| Goals | `goals` | Active only |

Plus an async call to `fitness.py → get_fitness_timeline()` for CTL/ATL/TSB.

## Dependency Map

See [DASHBOARD_DEPENDENCIES.md](./DASHBOARD_DEPENDENCIES.md) for the full component-to-backend dependency map, including which backend service functions provide data for each card.

## Reusability Notes

See [REUSABILITY_ASSESSMENT.md](./REUSABILITY_ASSESSMENT.md) for a detailed analysis of each component's reusability potential.

**Summary:**
- `MetricTile` and `FitnessChart` are fully generic and have been moved to shared locations
- `RecentActivitiesCard` and `UpcomingWorkoutsCard` are nearly generic — refactor when a second use case emerges
- `CoachBriefingCard`, `RecoveryOverviewCard`, and `ActivityOverviewCard` are dashboard-specific

## Shared Utilities

All dashboard components use utilities from `lib/`:

| Utility | File | Used for |
|---|---|---|
| `getUserTimezone()` | `lib/timezone.ts` | Reading user's IANA timezone for API headers |
| `extractApiError()` / `shouldRedirectToLogin()` | `lib/error-handling.ts` | Consistent API error handling |
| `formatNumber()` | `lib/format.ts` | Nullable number + unit formatting |
| `getTrendColor()` / `getTrendLabel()` | `lib/format.ts` | Metric trend direction display |
| `getRecoveryStatusColor()` / `getActivityStatusColor()` | `lib/format.ts` | Status badge colours |
| `calculateDelta()` | `lib/format.ts` | Week-over-week delta badges |
| `formatChartDate()` | `lib/format.ts` | Chart axis date labels |

## Garmin Sync Events

`DashboardContent` listens for three custom browser events from `lib/garmin-sync.ts`:

| Event | Action |
|---|---|
| `GARMIN_SYNC_STARTED_EVENT` | Show syncing spinner, clear notices |
| `GARMIN_SYNC_COMPLETED_EVENT` | Refresh dashboard data, show success notice |
| `GARMIN_SYNC_FAILED_EVENT` | Show error notice |

## Error Handling

All API errors go through `lib/error-handling.ts`:
- **401** → redirect to `/login`
- **Other errors** → display inline error with retry button
- **Sync errors** → show dismissible notice banner (auto-dismisses after 4s)

## Backend Service Structure

The backend service (`backend/app/services/dashboard.py`) is organised into:

| Module | File | Contents |
|---|---|---|
| Date utilities | `services/date_utils.py` | `to_float`, `to_zoneinfo`, `date_range`, `parse_date`, `parse_datetime`, `activity_local_date` |
| Metric utilities | `services/metrics.py` | `avg`, `extract_health_value`, `metric_direction` |
| Activity aggregation | `services/activity_aggregation.py` | `activity_summary_by_discipline`, `planned_summary`, `completion_rate_this_week`, etc. |
| Fitness utilities | `services/fitness.py` | `get_fitness_timeline`, `activity_training_load`, `load_direction` |
| Dashboard orchestration | `services/dashboard.py` | `build_dashboard_overview` and briefing generation |
