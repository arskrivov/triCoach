# Requirements Document

## Introduction

Replace the standalone plan pages (`/workouts/plan` and `/workouts/plan/[id]`) with an inline monthly calendar view on the main `/workouts` page. A toggle switches between the existing weekly grid view and a new Garmin Connect–style monthly calendar that shows workouts on their scheduled dates with discipline icons, duration, TSS, and race dates. Month navigation (prev/next, "Today" button) lets the athlete browse the full plan timeline. Clicking a workout opens the existing workout detail modal.

## Glossary

- **Workouts_Page**: The main workouts page at `/workouts` (`frontend/app/(app)/workouts/page.tsx`) that displays the active training plan, weekly calendar grid, coach briefing, and races section.
- **Weekly_View**: The existing 7-column Mon–Sun calendar grid on the Workouts_Page that shows one plan week at a time with workout cards.
- **Monthly_View**: A new calendar layout on the Workouts_Page that displays an entire calendar month with workout and race indicators on their scheduled dates.
- **View_Toggle**: A UI control on the Workouts_Page that switches between the Weekly_View and the Monthly_View.
- **Calendar_Cell**: A single date cell within the Monthly_View representing one day.
- **Workout_Card**: A compact visual element inside a Calendar_Cell showing a workout's discipline icon, name, duration, and TSS.
- **Race_Marker**: A visually distinct indicator inside a Calendar_Cell showing a race/goal event on its target date.
- **Month_Navigator**: A set of controls (previous month, next month, "Today" button) that change which calendar month the Monthly_View displays.
- **Workout_Detail_Modal**: The existing Dialog component that opens when a workout is clicked, showing structured workout content (warmup, main set, cooldown, coaching notes).
- **Plan_Page**: The standalone page at `/workouts/plan` that lists training plans and provides plan generation — to be removed.
- **Plan_Detail_Page**: The standalone page at `/workouts/plan/[id]` that shows a single plan with weekly calendar, compliance stats, and Garmin sync — to be removed.
- **Active_Plan**: The user's current training plan with status "active", containing all scheduled workouts.
- **Discipline_Icon**: An emoji icon representing a workout discipline (e.g. 🏊 for SWIM, 🏃 for RUN, 🚴 for RIDE_ROAD).

## Requirements

### Requirement 1: Remove Standalone Plan Pages

**User Story:** As a developer, I want to remove the redundant standalone plan pages, so that the workouts experience is consolidated on a single page.

#### Acceptance Criteria

1. WHEN the Plan_Page files at `/workouts/plan/page.tsx` are deleted, THE Workouts_Page SHALL remain fully functional without referencing the Plan_Page.
2. WHEN the Plan_Detail_Page files at `/workouts/plan/[id]/page.tsx` are deleted, THE Workouts_Page SHALL remain fully functional without referencing the Plan_Detail_Page.
3. WHEN a user navigates to `/workouts/plan` or `/workouts/plan/[id]`, THE application SHALL display a 404 page or redirect to `/workouts`.
4. THE Workouts_Page SHALL remove the "Full Plan View" link button that previously navigated to the Plan_Detail_Page.

### Requirement 2: View Toggle Between Weekly and Monthly

**User Story:** As a triathlete, I want to toggle between a weekly and monthly calendar view on the workouts page, so that I can see my training at different time scales without leaving the page.

#### Acceptance Criteria

1. THE Workouts_Page SHALL display a View_Toggle control that offers two options: "Week" and "Month".
2. WHEN the user selects "Week" on the View_Toggle, THE Workouts_Page SHALL display the Weekly_View with the existing 7-column calendar grid and week navigation.
3. WHEN the user selects "Month" on the View_Toggle, THE Workouts_Page SHALL display the Monthly_View replacing the Weekly_View area.
4. THE View_Toggle SHALL default to the "Week" option when the Workouts_Page loads.
5. WHEN the user switches views via the View_Toggle, THE Workouts_Page SHALL preserve the phase indicator, coach briefing, and races section without re-rendering those sections.
6. THE View_Toggle SHALL only be visible when an Active_Plan exists.

### Requirement 3: Monthly Calendar Layout

**User Story:** As a triathlete, I want to see a full month calendar showing my training plan, so that I can visualize my training load and schedule across the entire month.

#### Acceptance Criteria

1. THE Monthly_View SHALL display a calendar grid with 7 columns (Monday through Sunday) and 4–6 rows depending on the month.
2. THE Monthly_View SHALL display the month name and year as a header (e.g. "July 2025").
3. THE Monthly_View SHALL display abbreviated day-of-week labels (Mon, Tue, Wed, Thu, Fri, Sat, Sun) above the column headers.
4. WHEN a Calendar_Cell falls outside the displayed month, THE Monthly_View SHALL render the Calendar_Cell with muted styling to distinguish it from the current month's dates.
5. THE Monthly_View SHALL display the date number in each Calendar_Cell.
6. WHEN the Calendar_Cell date is today, THE Monthly_View SHALL highlight the Calendar_Cell with a distinct visual indicator (e.g. primary color border or background).

### Requirement 4: Workouts on Monthly Calendar

**User Story:** As a triathlete, I want to see my scheduled workouts on the monthly calendar, so that I can quickly scan my training distribution across the month.

#### Acceptance Criteria

1. WHEN a workout has a `scheduled_date` that falls within the displayed month, THE Monthly_View SHALL display a Workout_Card in the corresponding Calendar_Cell.
2. THE Workout_Card SHALL display the Discipline_Icon for the workout's discipline.
3. THE Workout_Card SHALL display the workout duration formatted as hours and minutes (e.g. "1h30m" or "45m").
4. THE Workout_Card SHALL display the estimated TSS value rounded to the nearest integer when the value is available.
5. WHEN multiple workouts are scheduled on the same date, THE Monthly_View SHALL display all Workout_Cards stacked within the Calendar_Cell.
6. WHEN a workout's scheduled_date is in the past, THE Workout_Card SHALL render with muted styling to indicate it is a past workout.

### Requirement 5: Race Dates on Monthly Calendar

**User Story:** As a triathlete, I want to see my race dates highlighted on the monthly calendar, so that I can see how my training builds toward race day.

#### Acceptance Criteria

1. WHEN a race (Goal) has a `target_date` that falls within the displayed month, THE Monthly_View SHALL display a Race_Marker in the corresponding Calendar_Cell.
2. THE Race_Marker SHALL be visually distinct from Workout_Cards using a different color scheme (e.g. accent or warning color) and a label showing the race description.
3. THE Race_Marker SHALL display above any Workout_Cards in the same Calendar_Cell.

### Requirement 6: Month Navigation

**User Story:** As a triathlete, I want to navigate between months on the calendar, so that I can review past training and preview upcoming weeks.

#### Acceptance Criteria

1. THE Month_Navigator SHALL include a "previous month" button and a "next month" button.
2. THE Month_Navigator SHALL include a "Today" button.
3. WHEN the user clicks the "previous month" button, THE Monthly_View SHALL display the preceding calendar month.
4. WHEN the user clicks the "next month" button, THE Monthly_View SHALL display the following calendar month.
5. WHEN the user clicks the "Today" button, THE Monthly_View SHALL navigate to the month containing today's date.
6. WHEN the Monthly_View first renders, THE Monthly_View SHALL display the month containing today's date.

### Requirement 7: Workout Click Opens Detail Modal

**User Story:** As a triathlete, I want to click a workout on the monthly calendar to see its full details, so that I can review the structured workout content.

#### Acceptance Criteria

1. WHEN the user clicks a Workout_Card in the Monthly_View, THE Workouts_Page SHALL open the Workout_Detail_Modal displaying the clicked workout's full content.
2. THE Workout_Detail_Modal opened from the Monthly_View SHALL display the same information as when opened from the Weekly_View (discipline, type, date, duration, TSS, warmup, main set, cooldown, coaching notes).

### Requirement 8: No-Plan Empty State

**User Story:** As a triathlete without an active plan, I want the workouts page to guide me toward creating one, so that I understand how to get started.

#### Acceptance Criteria

1. WHILE no Active_Plan exists, THE Workouts_Page SHALL hide the View_Toggle.
2. WHILE no Active_Plan exists, THE Workouts_Page SHALL display the existing empty state with the races section and plan generation prompt.
