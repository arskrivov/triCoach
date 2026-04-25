# Implementation Plan: Monthly Calendar View

## Overview

Replace the standalone plan pages with an inline monthly calendar view on the workouts page. Implementation proceeds bottom-up: pure calendar utility functions first (with property-based tests), then UI components (ViewToggle, MonthlyCalendar with MonthNavigator and CalendarCell), then integration into the workouts page (wiring toggle, state, modal), and finally cleanup of dead plan pages and links.

## Tasks

- [x] 1. Create calendar utility functions
  - [x] 1.1 Create `frontend/app/(app)/workouts/calendar-utils.ts` with pure functions
    - Implement `getMonday(date: Date): Date` — returns the Monday on or before the given date
    - Implement `getCalendarGrid(year: number, month: number): Date[][]` — generates 4–6 rows of 7 days (Mon–Sun) covering the target month plus padding days from adjacent months
    - Implement `toDateKey(date: Date): string` — formats a Date as `YYYY-MM-DD`
    - Implement `buildWorkoutMap(workouts): Record<string, PlanWorkoutResponse[]>` — groups workouts by `scheduled_date`, skipping null dates
    - Implement `buildRaceMap(races): Record<string, Goal[]>` — groups goals by `target_date`, skipping null dates
    - Implement `formatDurationCompact(seconds: number | null): string` — returns `"Xh"`, `"XhYm"`, or `"Xm"`
    - Implement `isDatePast(dateStr: string): boolean` and `isDateToday(dateStr: string): boolean`
    - _Requirements: 3.1, 3.4, 4.1, 4.3, 4.5, 5.1_

  - [x] 1.2 Write property test: Calendar grid structure and date coverage
    - **Property 1: Calendar grid structure and date coverage**
    - For any valid (year, month), `getCalendarGrid` returns 7 columns per row, 4–6 rows, every day of the target month exactly once, contiguous dates, padding days from adjacent months only
    - **Validates: Requirements 3.1, 3.4**

  - [x] 1.3 Write property test: Duration formatting produces valid compact strings
    - **Property 2: Duration formatting produces valid compact strings**
    - For any positive integer seconds, `formatDurationCompact` returns a string matching `Xh`, `XhYm`, or `Xm`, and the total minutes equals `Math.round(seconds / 60)`
    - **Validates: Requirements 4.3**

  - [x] 1.4 Write property test: Workout map preserves all workouts under correct date keys
    - **Property 3: Workout map preserves all workouts under correct date keys**
    - For any array of workouts with non-null `scheduled_date`, `buildWorkoutMap` produces a map where every workout appears exactly once under its `scheduled_date` key, and the sum of all entry lengths equals the input length
    - **Validates: Requirements 4.1, 4.5**

  - [x] 1.5 Write property test: Race map preserves all races under correct date keys
    - **Property 4: Race map preserves all races under correct date keys**
    - For any array of goals with non-null `target_date`, `buildRaceMap` produces a map where every goal appears exactly once under its `target_date` key, and the sum of all entry lengths equals the input length
    - **Validates: Requirements 5.1**

  - [x] 1.6 Write property test: Month navigation round-trip
    - **Property 5: Month navigation round-trip**
    - For any valid (year, month), navigating next then prev returns to the original month, and navigating prev then next also returns to the original month
    - **Validates: Requirements 6.3, 6.4**

- [x] 2. Checkpoint — Ensure all tests pass
  - Run `npm run test` in `frontend/` and ensure all property-based and unit tests pass. Ask the user if questions arise.

- [x] 3. Create the ViewToggle component
  - [x] 3.1 Create `frontend/app/(app)/workouts/view-toggle.tsx`
    - Implement a segmented control with "Week" and "Month" options
    - Accept `value: "week" | "month"` and `onChange: (view: "week" | "month") => void` props
    - Active segment styled with `bg-primary text-primary-foreground`; inactive with `text-muted-foreground`
    - Use Tailwind classes and `cn()` for conditional styling
    - _Requirements: 2.1, 2.4_

- [x] 4. Create the MonthlyCalendar component
  - [x] 4.1 Create `frontend/app/(app)/workouts/monthly-calendar.tsx` with MonthNavigator and CalendarCell
    - Implement `MonthNavigator` with prev/next/today buttons and month/year header label (e.g. "July 2025")
    - Implement `CalendarCell` rendering: date number, out-of-month muted styling, today highlight with primary border, race markers above workout cards, compact workout cards (discipline icon + duration + TSS), past-date muted styling, click handler for workout detail modal
    - Implement `MonthlyCalendar` container: receives workouts, races, currentMonth, onMonthChange, onWorkoutClick; computes calendar grid via `getCalendarGrid`; builds workout/race lookup maps via `useMemo`; renders day-of-week headers (Mon–Sun) and CalendarCell for each day
    - Race markers use accent color (`bg-amber-500/15 text-amber-600`) with truncated race description
    - Workout cards are single-line buttons: `🏊 45m · 55 TSS`, using `text-[10px]` or `text-xs`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2_

- [x] 5. Integrate monthly view into the workouts page
  - [x] 5.1 Wire ViewToggle, MonthlyCalendar, and state into `frontend/app/(app)/workouts/page.tsx`
    - Add `viewMode` state (`"week" | "month"`, default `"week"`) and `currentMonth` state (Date, default: first of current month)
    - Render `ViewToggle` in the header area between the phase indicator and the calendar, only when `activePlan` exists
    - Conditionally render the existing weekly view (week nav + 7-column grid) when `viewMode === "week"`, or `MonthlyCalendar` when `viewMode === "month"`
    - Pass `activePlan.workouts`, `goals`, `currentMonth`, `onMonthChange`, and `setSelectedWorkout` to `MonthlyCalendar`
    - Preserve the phase indicator, coach briefing, and races section regardless of view mode
    - Hide the ViewToggle when no active plan exists (existing empty state unchanged)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 7.1, 7.2, 8.1, 8.2_

- [x] 6. Remove standalone plan pages and dead links
  - [x] 6.1 Delete `frontend/app/(app)/workouts/plan/page.tsx` and `frontend/app/(app)/workouts/plan/[id]/page.tsx`
    - Remove the plan directory and all its contents
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 6.2 Remove dead links from `frontend/app/(app)/workouts/page.tsx`
    - Remove the "Full Plan View" `<Link>` button from the active plan header
    - Remove the `<Link href={/workouts/plan/${plan.id}}>` wrappers in the "Past Plans" section (keep past plans visible but without linking to deleted pages, or remove the section if no longer needed)
    - Remove the `import Link from "next/link"` if no longer used
    - _Requirements: 1.4_

- [x] 7. Final checkpoint — Verify build passes and no broken references
  - Run `npm run build` in `frontend/` to verify the production build succeeds with no errors
  - Run `npm run test` in `frontend/` to ensure all tests still pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- All data is already available client-side — no new backend endpoints or API calls needed
- The design specifies TypeScript throughout; all new files use `.ts` / `.tsx` extensions
