# Implementation Plan: Dashboard Cleanup

## Overview

This plan implements a systematic cleanup of the dashboard codebase through five phases: Analysis & Documentation, Type System Optimization, Backend Refactoring, Frontend Refactoring, and Validation. The cleanup removes technical debt, identifies reusable components, consolidates utilities, and improves maintainability while preserving all existing functionality.

**Key Constraint**: This is a refactoring effort with zero user-facing changes. All modifications must maintain identical API responses and UI behavior.

## Tasks

- [x] 1. Phase 1: Analysis & Documentation
  - [x] 1.1 Identify unused code across dashboard files
    - Run static analysis on all dashboard TypeScript files to find unused imports, variables, and functions
    - Search for commented-out code blocks in all dashboard files
    - Search for TODO comments indicating incomplete work
    - Document findings in a list for removal
    - _Requirements: 1.1, 1.2, 9.1, 9.2_

  - [x] 1.2 Create component dependency map
    - Map data flow from API endpoint through dashboard-content.tsx to each card component
    - Document which backend service functions provide data for each component
    - Create visual dependency diagram showing relationships
    - Save as `frontend/app/(app)/dashboard/DASHBOARD_DEPENDENCIES.md`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 1.3 Document component reusability assessment
    - Analyze each card component for reusability potential (CoachBriefingCard, RecoveryOverviewCard, ActivityOverviewCard, RecentActivitiesCard, UpcomingWorkoutsCard)
    - Analyze DashboardMetricTile and FitnessChart for app-wide use
    - Document interface and usage patterns for reusable components
    - Save as `frontend/app/(app)/dashboard/REUSABILITY_ASSESSMENT.md`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 1.4 Identify duplicate utility logic
    - Search for duplicate formatting logic across dashboard files
    - Search for duplicate data transformation logic in dashboard-content.tsx and card components
    - Compare with existing utilities in lib/format.ts
    - Document consolidation opportunities
    - _Requirements: 3.1, 3.2_

- [x] 2. Phase 2: Type System Optimization
  - [x] 2.1 Update RecoveryOverview type with union types
    - Change `status: string` to `status: "strong" | "strained" | "steady"` in lib/types.ts
    - Verify TypeScript compilation succeeds
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 2.2 Update ActivityOverview type with union types
    - Change `status: string` to `status: "idle" | "overreaching" | "building" | "lighter" | "steady"` in lib/types.ts
    - Change `fitness.direction: string` to `fitness.direction: "unknown" | "fatigued" | "training" | "fresh" | "balanced"` in lib/types.ts
    - Verify TypeScript compilation succeeds
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 2.3 Verify backend response compatibility
    - Check that backend dashboard.py returns values matching the new union types
    - Update backend response construction if needed to ensure type compatibility
    - Run backend tests to verify no type mismatches
    - _Requirements: 5.5_

- [x] 3. Checkpoint - Verify type changes compile
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Phase 3: Backend Refactoring - Extract Utility Modules
  - [x] 4.1 Create date_utils.py module
    - Create `backend/app/services/date_utils.py`
    - Extract `_to_float()`, `_to_zoneinfo()`, `_date_range()`, `_parse_date()`, `_parse_datetime()`, `_activity_local_date()` from dashboard.py
    - Add docstrings documenting each function's purpose and parameters
    - _Requirements: 4.1, 4.2_

  - [x] 4.2 Create metrics.py module
    - Create `backend/app/services/metrics.py`
    - Extract `_avg()`, `_extract_health_value()`, `_metric_direction()` from dashboard.py
    - Add docstrings documenting each function's purpose and parameters
    - _Requirements: 4.1, 4.2_

  - [x] 4.3 Create activity_aggregation.py module
    - Create `backend/app/services/activity_aggregation.py`
    - Extract `_prompt_activity_key()`, `_upcoming_workout_payload()`, `_completion_rate_this_week()`, `_planned_summary()`, `_activity_summary_by_discipline()`, `_sum_distance()`, `_sum_duration()`, `_sum_tss()` from dashboard.py
    - Add docstrings documenting each function's purpose and parameters
    - _Requirements: 4.1, 4.2_

  - [x] 4.4 Move fitness logic to fitness.py
    - Move `_load_direction()` from dashboard.py to `backend/app/services/fitness.py`
    - Add docstring documenting the function
    - _Requirements: 4.4_

  - [x] 4.5 Update imports in dashboard.py
    - Import extracted functions from new utility modules
    - Remove old function definitions from dashboard.py
    - Verify all function calls still work correctly
    - _Requirements: 4.1, 4.2_

- [x] 5. Phase 3: Backend Refactoring - Decompose Large Functions
  - [x] 5.1 Decompose build_dashboard_overview()
    - Extract recovery aggregation logic to `_aggregate_recovery_data()` helper function
    - Extract activity aggregation logic to `_aggregate_activity_data()` helper function
    - Extract planned workout aggregation logic to `_aggregate_planned_data()` helper function
    - Keep main `build_dashboard_overview()` as orchestrator calling these helpers
    - _Requirements: 4.2, 4.3_

  - [x] 5.2 Decompose _build_daily_prompt_digest()
    - Extract health data formatting to `_format_health_for_prompt()` helper function
    - Extract training data aggregation to `_aggregate_training_for_prompt()` helper function
    - Keep main `_build_daily_prompt_digest()` as assembler calling these helpers
    - _Requirements: 4.2, 4.3_

  - [x] 5.3 Write unit tests for extracted backend utilities
    - Test date_utils functions with various inputs and timezones
    - Test metrics functions with edge cases
    - Test activity_aggregation functions with sample data
    - Test fitness._load_direction() with various TSB values
    - _Requirements: 4.5_

- [x] 6. Checkpoint - Verify backend refactoring
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Phase 4: Frontend Refactoring - Error Handling
  - [x] 7.1 Create unified error handling utility
    - Create `frontend/lib/error-handling.ts`
    - Implement `ApiError` interface with status, message, and detail fields
    - Implement `extractApiError(error: unknown): ApiError` function handling Axios errors, Error instances, and fallback
    - Implement `shouldRedirectToLogin(error: ApiError): boolean` function
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 7.2 Update dashboard-content.tsx to use unified error handler
    - Replace inline error extraction logic with `extractApiError()` calls
    - Replace inline 401 check with `shouldRedirectToLogin()` call
    - Standardize all error message formatting
    - _Requirements: 7.3, 7.4, 7.5_

- [x] 8. Phase 4: Frontend Refactoring - Component Extraction
  - [x] 8.1 Move DashboardMetricTile to shared components
    - Move `frontend/app/(app)/dashboard/dashboard-metric-tile.tsx` to `frontend/components/ui/metric-tile.tsx`
    - Update all imports in dashboard components to use new path
    - Add JSDoc comment documenting the component's interface and usage
    - _Requirements: 2.2, 2.5_

  - [x] 8.2 Move FitnessChart to shared components
    - Move `frontend/app/(app)/dashboard/fitness-chart.tsx` to `frontend/components/fitness-chart.tsx`
    - Update all imports in dashboard components to use new path
    - Add JSDoc comment documenting the component's interface and usage
    - _Requirements: 2.3, 2.5_

  - [x] 8.3 Extract timezone utility
    - Create `frontend/lib/timezone.ts`
    - Extract timezone detection logic from dashboard-content.tsx to `getUserTimezone()` function
    - Update dashboard-content.tsx to import and use the utility
    - _Requirements: 3.3, 3.4_

- [x] 9. Phase 4: Frontend Refactoring - Code Cleanup
  - [x] 9.1 Consolidate duplicate formatting logic
    - Review findings from task 1.4
    - Move any duplicate formatting functions to lib/format.ts
    - Update all call sites to use consolidated utilities
    - Verify output values remain unchanged
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

  - [x] 9.2 Remove unused code and comments
    - Remove all unused imports identified in task 1.1
    - Remove all commented-out code blocks identified in task 1.1
    - Remove TODO comments for incomplete work identified in task 1.1
    - Verify no broken references remain
    - _Requirements: 1.3, 1.4, 9.3, 9.4, 9.5_

  - [x] 9.3 Reduce prop drilling in dashboard components
    - Identify props passed through multiple layers without being used
    - Identify components receiving large objects but using only subset of fields
    - Refactor to pass only required fields where prop drilling exceeds two levels
    - Destructure to pass only used fields where component uses <50% of prop object fields
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 10. Checkpoint - Verify frontend refactoring
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Phase 5: Documentation
  - [x] 11.1 Create dashboard README
    - Create `frontend/app/(app)/dashboard/README.md`
    - Include component overview describing each card component
    - Include data flow diagram from API to UI
    - Include dependency map (reference DASHBOARD_DEPENDENCIES.md)
    - Include reusability notes (reference REUSABILITY_ASSESSMENT.md)
    - _Requirements: 8.5_

  - [x] 11.2 Add JSDoc comments to components
    - Add JSDoc comments to all card components documenting their props and purpose
    - Add JSDoc comments to dashboard-content.tsx documenting state and data flow
    - Add JSDoc comments to all extracted utility functions
    - _Requirements: 2.5, 8.1_

- [x] 12. Phase 5: Performance Validation
  - [x] 12.1 Measure backend performance metrics
    - Measure `/dashboard/overview` API response time (p50, p95, p99)
    - Measure database query count and time
    - Compare against baseline (if available) or document as new baseline
    - _Requirements: 10.3, 10.4_

  - [x] 12.2 Measure frontend performance metrics
    - Measure Time to First Byte (TTFB) using Performance API
    - Measure First Contentful Paint (FCP) and Largest Contentful Paint (LCP)
    - Measure JavaScript bundle size for dashboard route
    - Compare against baseline (if available) or document as new baseline
    - _Requirements: 10.1, 10.2, 10.4_

  - [x] 12.3 Validate performance within acceptable range
    - Verify all performance metrics are within 10% of pre-cleanup baseline
    - If any metric degrades >10%, investigate root cause and address before completion
    - Document final performance comparison in dashboard README
    - _Requirements: 10.4, 10.5_

- [x] 13. Phase 5: Testing
  - [x] 13.1 Write backend unit tests for dashboard helpers
    - Test `_recovery_status()` with different metric combinations
    - Test `_activity_status()` with various load scenarios
    - Test `_heuristic_briefing()` generation logic
    - Test `_today_data_signature()` cache key generation
    - _Requirements: 4.5_

  - [x] 13.2 Write backend integration tests
    - Test `/dashboard/overview` endpoint with mock data
    - Test endpoint with new user (no activities/health data)
    - Test timezone handling across different timezones
    - Verify API response structure unchanged after refactoring
    - _Requirements: 4.5_

  - [x] 13.3 Write frontend component tests
    - Test CoachBriefingCard rendering with and without briefing
    - Test RecoveryOverviewCard metric display
    - Test ActivityOverviewCard discipline rows
    - Test DashboardMetricTile variants
    - _Requirements: 7.5_

  - [x] 13.4 Write frontend integration tests
    - Test dashboard-content.tsx loading state
    - Test dashboard-content.tsx error state with unified error handler
    - Test Garmin sync event handling and dashboard refresh
    - _Requirements: 7.5_

- [-] 14. Final Checkpoint - Complete validation
  - Run full test suite (backend and frontend)
  - Manually test dashboard loading, sync, and error states
  - Verify all card components render correctly
  - Verify all links navigate correctly
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster completion
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- This is a refactoring effort - no user-facing changes should occur
- All API responses must remain structurally identical
- Performance must remain within 10% of baseline
- Backend uses Python 3.11+ with FastAPI and Supabase client
- Frontend uses TypeScript 5 with Next.js 16 App Router
- Testing uses pytest for backend, standard React testing tools for frontend
