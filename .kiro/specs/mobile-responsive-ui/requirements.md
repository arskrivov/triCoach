# Requirements Document

## Introduction

The Personal Coach triathlon training app currently has a desktop-oriented layout that does not adapt to smaller screens. This spec covers a comprehensive responsive design overhaul targeting two reference devices: MacBook Air 13" (1440×900 CSS pixels, minimum desktop) and iPhone 12 Pro (390×844 CSS pixels, primary mobile). The goal is production-ready visual polish across all pages — proper responsive layouts, readable typography, accessible touch targets, a cohesive colour palette, and smooth transitions between breakpoints.

## Glossary

- **App_Shell**: The shared authenticated layout wrapping all app pages, including the top header bar, the slide-out navigation sidebar, and the main content area. Defined in `frontend/app/(app)/layout.tsx`.
- **Dashboard_Page**: The main landing page showing coach briefing, recovery overview, activity overview, recent activities, and upcoming workouts. Defined in `frontend/app/(app)/dashboard/`.
- **Activity_Feed**: The paginated, filterable list of all synced activities. Defined in `frontend/app/(app)/activities/activity-feed.tsx`.
- **Activity_Detail**: The single-activity view showing stats, map, exercise breakdown, and AI analysis. Defined in `frontend/app/(app)/activities/[id]/`.
- **Coach_Page**: The AI coach chat interface with a goals sidebar. Defined in `frontend/app/(app)/coach/page.tsx`.
- **Routes_Page**: The route planner with a Mapbox map and saved routes list. Defined in `frontend/app/(app)/routes/`.
- **Settings_Page**: The settings page with Garmin connection and athlete profile cards. Defined in `frontend/app/(app)/settings/`.
- **Workouts_Page**: The workout builder with a list of planned workouts. Defined in `frontend/app/(app)/workouts/`.
- **Auth_Pages**: The login and registration pages. Defined in `frontend/app/(auth)/`.
- **Metric_Tile**: The reusable single-metric display component used across dashboard cards. Defined in `frontend/components/ui/metric-tile.tsx`.
- **Discipline_Row**: The per-discipline breakdown row used in the Activity Overview card showing sessions, distance, delta, intensity, and optional VO₂max.
- **Trend_Row**: The per-metric trend row used in the Recovery Overview card showing current value, 7-day average, sparkline, and trend direction.
- **Mobile_Breakpoint**: Screen widths below 640px (Tailwind `sm`), targeting iPhone 12 Pro at 390px.
- **Desktop_Breakpoint**: Screen widths at or above 1024px (Tailwind `lg`), targeting MacBook Air 13" at 1440px.
- **Touch_Target**: An interactive element (button, link, filter pill) that must meet minimum size requirements for comfortable finger interaction on mobile.

## Requirements

### Requirement 1: Responsive App Shell and Navigation

**User Story:** As a mobile user, I want the navigation and header to adapt to my screen size, so that I can navigate the app comfortably on my phone without wasted space.

#### Acceptance Criteria

1. WHILE the viewport width is below the Mobile_Breakpoint, THE App_Shell SHALL display the header bar at a maximum height of 56px with compact padding (16px horizontal).
2. WHILE the viewport width is at or above the Desktop_Breakpoint, THE App_Shell SHALL display the navigation sidebar as a persistent, always-visible panel instead of a slide-out overlay.
3. WHEN a user taps the hamburger menu button on mobile, THE App_Shell SHALL open the slide-out navigation sidebar with a backdrop overlay.
4. THE App_Shell SHALL render all navigation link Touch_Targets with a minimum tappable area of 44×44 CSS pixels.
5. WHILE the viewport width is below the Mobile_Breakpoint, THE App_Shell SHALL apply horizontal page padding of 16px to the main content area.
6. WHILE the viewport width is at or above the Desktop_Breakpoint, THE App_Shell SHALL apply horizontal page padding of 24px to the main content area.

### Requirement 2: Responsive Dashboard Layout

**User Story:** As a triathlete, I want the dashboard to reflow into a single-column layout on my phone, so that I can read my recovery and training data without horizontal scrolling.

#### Acceptance Criteria

1. WHILE the viewport width is below the Mobile_Breakpoint, THE Dashboard_Page SHALL stack all dashboard cards in a single column with 16px vertical gaps.
2. WHILE the viewport width is at or above the Desktop_Breakpoint, THE Dashboard_Page SHALL arrange the recent activities card and upcoming workouts card side by side in a two-column grid.
3. WHILE the viewport width is below the Mobile_Breakpoint, THE Metric_Tile grid inside the Recovery Overview and Activity Overview cards SHALL display in a 2-column layout.
4. WHILE the viewport width is at or above the Desktop_Breakpoint, THE Metric_Tile grid inside the Recovery Overview and Activity Overview cards SHALL display in a 3-column or wider layout.
5. THE Metric_Tile SHALL have a minimum height of 100px on mobile to maintain readability of the label, value, and subtitle.

### Requirement 3: Responsive Discipline and Trend Rows

**User Story:** As a mobile user, I want the discipline breakdown and recovery trend tables to be readable on a narrow screen, so that I can review my per-sport stats without horizontal scrolling.

#### Acceptance Criteria

1. WHILE the viewport width is below the Mobile_Breakpoint, THE Discipline_Row SHALL reflow from a multi-column grid into a stacked or wrapped layout that fits within 390px without horizontal overflow.
2. WHILE the viewport width is below the Mobile_Breakpoint, THE Trend_Row SHALL reflow from a multi-column grid into a stacked or wrapped layout that fits within 390px without horizontal overflow.
3. WHILE the viewport width is at or above the Desktop_Breakpoint, THE Discipline_Row SHALL display all columns (name, sessions, distance, delta, intensity, VO₂max) in a single horizontal row.
4. WHILE the viewport width is at or above the Desktop_Breakpoint, THE Trend_Row SHALL display all columns (label, current, 7d avg, sparkline, trend) in a single horizontal row.

### Requirement 4: Responsive Coach Chat Page

**User Story:** As a mobile user, I want the AI coach chat to fill my screen with the conversation and hide the goals sidebar, so that I can chat comfortably on my phone.

#### Acceptance Criteria

1. WHILE the viewport width is below the Mobile_Breakpoint, THE Coach_Page SHALL hide the goals sidebar and display only the chat interface at full width.
2. WHILE the viewport width is below the Mobile_Breakpoint, THE Coach_Page SHALL provide an accessible toggle or button to reveal the goals panel as an overlay or slide-out drawer.
3. WHILE the viewport width is at or above the Desktop_Breakpoint, THE Coach_Page SHALL display the goals sidebar and chat interface side by side.
4. THE Coach_Page chat input area SHALL remain fixed at the bottom of the viewport on mobile so that the user can type without scrolling.
5. THE Coach_Page message bubbles SHALL have a maximum width of 85% of the chat container on mobile to prevent edge-to-edge text.

### Requirement 5: Responsive Activity Feed and Detail

**User Story:** As a mobile user, I want the activity feed and detail pages to display cleanly on my phone, so that I can browse and review my training sessions on the go.

#### Acceptance Criteria

1. WHILE the viewport width is below the Mobile_Breakpoint, THE Activity_Feed filter pills SHALL be horizontally scrollable within a single row instead of wrapping to multiple lines.
2. THE Activity_Feed activity cards SHALL display the discipline icon, name, date, and primary stat in a layout that fits within 390px without truncation of the primary stat.
3. WHILE the viewport width is below the Mobile_Breakpoint, THE Activity_Detail stat boxes SHALL display in a 2-column grid.
4. WHILE the viewport width is at or above the Desktop_Breakpoint, THE Activity_Detail stat boxes SHALL display in a 4-column grid.
5. THE Activity_Detail Mapbox map container SHALL maintain a 16:9 aspect ratio and fill the available width on all screen sizes.

### Requirement 6: Responsive Charts

**User Story:** As a mobile user, I want the fitness and recovery charts to be readable on my phone, so that I can track my trends without pinching or scrolling.

#### Acceptance Criteria

1. WHILE the viewport width is below the Mobile_Breakpoint, THE Recovery Trend Chart SHALL render at a minimum height of 160px and fill the available container width.
2. WHILE the viewport width is below the Mobile_Breakpoint, THE Fitness Chart SHALL render at a minimum height of 180px and fill the available container width.
3. WHILE the viewport width is below the Mobile_Breakpoint, THE chart legend items SHALL wrap to a second line when they exceed the available width, rather than overflowing.
4. THE chart axis labels SHALL use a minimum font size of 10px on all screen sizes to maintain legibility.
5. THE chart tooltip SHALL be positioned to remain within the viewport bounds on mobile screens.

### Requirement 7: Responsive Settings and Forms

**User Story:** As a mobile user, I want the settings forms to be easy to fill out on my phone, so that I can configure my athlete profile and Garmin connection without difficulty.

#### Acceptance Criteria

1. WHILE the viewport width is below the Mobile_Breakpoint, THE Settings_Page athlete profile form fields SHALL display in a single-column layout instead of the current 2-column grid.
2. WHILE the viewport width is at or above the Desktop_Breakpoint, THE Settings_Page athlete profile form fields SHALL display in a 2-column grid.
3. THE Settings_Page form input fields SHALL have a minimum height of 44px to provide comfortable Touch_Targets on mobile.
4. WHILE the viewport width is below the Mobile_Breakpoint, THE Settings_Page SHALL use full-width cards with 16px horizontal margin.
5. THE Garmin connection status row SHALL reflow from a horizontal layout to a stacked layout on mobile, placing action buttons below the status text.

### Requirement 8: Responsive Auth Pages

**User Story:** As a new user on mobile, I want the login and registration pages to be centered and properly sized on my phone, so that I can sign up without layout issues.

#### Acceptance Criteria

1. THE Auth_Pages login and registration cards SHALL be centered both vertically and horizontally on all screen sizes.
2. WHILE the viewport width is below the Mobile_Breakpoint, THE Auth_Pages cards SHALL expand to fill the available width with 16px horizontal margin.
3. WHILE the viewport width is at or above the Desktop_Breakpoint, THE Auth_Pages cards SHALL have a maximum width of 400px.
4. THE Auth_Pages form input fields SHALL have a minimum height of 44px for comfortable Touch_Targets on mobile.

### Requirement 9: Typography Scale

**User Story:** As a user on any device, I want text to be consistently sized and readable, so that I can consume training data without straining.

#### Acceptance Criteria

1. THE App_Shell SHALL use the Geist Sans font family as the primary typeface across all pages and screen sizes.
2. WHILE the viewport width is below the Mobile_Breakpoint, THE page titles (h1) SHALL render at 20px–22px font size.
3. WHILE the viewport width is at or above the Desktop_Breakpoint, THE page titles (h1) SHALL render at 24px–28px font size.
4. THE body text across all pages SHALL use a minimum font size of 14px for primary content and 12px for secondary/caption text.
5. THE Metric_Tile value text SHALL use a font size of 20px–24px on mobile and 24px–28px on desktop to maintain visual hierarchy.

### Requirement 10: Colour Palette and Visual Polish

**User Story:** As a user, I want the app to have a cohesive, professional colour scheme, so that it feels production-ready and trustworthy.

#### Acceptance Criteria

1. THE App_Shell SHALL use a consistent colour palette derived from the existing shadcn/ui CSS custom properties (--primary, --secondary, --accent, --muted, --destructive, --border).
2. THE status badges (recovery status, activity status, coach briefing source) SHALL use semantically meaningful colours: emerald tones for positive states, amber for caution states, and rose for negative states.
3. THE App_Shell background SHALL use the --background custom property (currently white in light mode) with card surfaces using --card for visual separation.
4. THE interactive elements (buttons, links, filter pills) SHALL display visible focus rings using the --ring custom property when focused via keyboard navigation.
5. THE discipline icons across all pages SHALL use consistent background colour mappings as defined in the `getDisciplineMeta` function in `lib/format.ts`.

### Requirement 11: Responsive Workouts and Routes Pages

**User Story:** As a mobile user, I want the workouts and routes pages to be usable on my phone, so that I can manage my training plan and routes on the go.

#### Acceptance Criteria

1. WHILE the viewport width is below the Mobile_Breakpoint, THE Workouts_Page and Routes_Page header rows SHALL stack the title and action button vertically with the button at full width.
2. WHILE the viewport width is at or above the Desktop_Breakpoint, THE Workouts_Page and Routes_Page header rows SHALL display the title and action button side by side.
3. THE Workouts_Page workout cards and Routes_Page route cards SHALL fill the available width on mobile with appropriate padding (16px).
4. WHILE the viewport width is below the Mobile_Breakpoint, THE Routes_Page map container SHALL have a minimum height of 250px and fill the available width.

### Requirement 12: No Horizontal Overflow

**User Story:** As a mobile user, I want to never encounter horizontal scrolling on any page, so that the app feels native and polished on my phone.

#### Acceptance Criteria

1. THE App_Shell SHALL prevent horizontal overflow on the `<html>` and `<body>` elements by applying `overflow-x: hidden` at the root level.
2. WHEN any page is rendered at the Mobile_Breakpoint (390px width), THE page content SHALL fit within the viewport width without triggering a horizontal scrollbar.
3. IF a data table or grid row contains content wider than the viewport, THEN THE containing element SHALL either reflow the content or enable horizontal scrolling within that specific component only.
