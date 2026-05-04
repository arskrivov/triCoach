# Requirements Document

## Introduction

Rewrite the existing Next.js "Personal Coach" triathlon training application as an Expo (React Native) mobile app in a separate `mobile/` folder. The mobile app consumes the same FastAPI backend API unchanged. All existing user-facing functionality is preserved, adapted for native mobile UX patterns (tab navigation, pull-to-refresh, native gestures, platform maps and charts). The primary test target is iOS. Dead code and unused abstractions from the web frontend are not carried over — simplicity over complexity in code, but the design and feature set remain rich.

## Glossary

- **Mobile_App**: The Expo (React Native) application in the `mobile/` folder
- **API_Client**: The HTTP client module that communicates with the FastAPI backend, attaching Supabase JWT tokens
- **Auth_Module**: The authentication layer using Supabase Auth via `@supabase/supabase-js` for React Native
- **Navigation_Shell**: The root navigator structure (tab bar + stack navigators) that organises all screens
- **Dashboard_Screen**: The main screen showing coach briefing, recovery overview, activity overview, upcoming workouts, and fitness chart
- **Activity_Feed**: The scrollable list of past activities with filtering by discipline
- **Activity_Detail_Screen**: The detail view for a single activity showing map, laps, HR zones, and metrics
- **Coach_Screen**: The AI coach conversational chat interface with streaming responses
- **Workout_Hub**: The screen showing the active training plan with weekly/monthly calendar views, races, and plan generation
- **Workout_Builder**: The screen for creating and editing structured workouts across all disciplines
- **Workout_Detail_Screen**: The detail view for a single workout showing content, duration, and TSS
- **Route_Planner**: The screen for map-based route creation using GraphHopper and Mapbox
- **Account_Screen**: The screen for Garmin connection management and athlete profile editing
- **Chart_Component**: A native charting component replacing Recharts (e.g. `react-native-chart-kit`, `victory-native`, or `react-native-gifted-charts`)
- **Map_Component**: A native map component using `@rnmapbox/maps` (Mapbox for React Native)
- **Discipline**: One of `SWIM | RUN | RIDE_ROAD | RIDE_GRAVEL | STRENGTH | YOGA | MOBILITY | OTHER`
- **Garmin_Sync**: The process of triggering activity and health data synchronisation from Garmin via the backend API
- **Training_Plan**: An AI-generated periodised training plan with phases, weekly workouts, and Garmin sync

## Requirements

### Requirement 1: Expo Project Scaffolding

**User Story:** As a developer, I want a well-structured Expo project in a separate `mobile/` folder, so that the mobile app is independent from the web frontend and easy to develop and build.

#### Acceptance Criteria

1. THE Mobile_App SHALL be initialised as an Expo project using the Expo Router file-based routing convention inside a `mobile/` directory at the repository root
2. THE Mobile_App SHALL use TypeScript for all source files
3. THE Mobile_App SHALL target iOS as the primary platform with Expo development builds
4. THE Mobile_App SHALL include an `app.json` (or `app.config.ts`) with the app name "TriCoach", a bundle identifier, and Expo SDK configuration
5. THE Mobile_App SHALL include environment variable configuration for `API_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` using Expo's environment variable support
6. THE Mobile_App SHALL reuse the TypeScript type definitions from the web frontend (`lib/types.ts`) by copying them into a shared `types.ts` file, removing any web-only types that are dead code

### Requirement 2: Authentication

**User Story:** As a user, I want to sign in and register using my email and password, so that I can access my personal training data securely on my phone.

#### Acceptance Criteria

1. THE Auth_Module SHALL use `@supabase/supabase-js` initialised with `AsyncStorage` for session persistence on React Native
2. WHEN the Mobile_App launches, THE Auth_Module SHALL check for an existing Supabase session and navigate to the Dashboard_Screen if a valid session exists
3. WHEN no valid session exists, THE Auth_Module SHALL navigate to a Login screen
4. THE Login screen SHALL provide email and password input fields and a "Sign in" button
5. WHEN the user submits valid credentials, THE Auth_Module SHALL authenticate via Supabase Auth and navigate to the Dashboard_Screen
6. IF authentication fails, THEN THE Login screen SHALL display the error message to the user
7. THE Register screen SHALL provide name (optional), email, and password input fields and a "Create account" button
8. WHEN the user submits valid registration data, THE Auth_Module SHALL create the account via Supabase Auth and navigate to the Dashboard_Screen
9. IF registration fails, THEN THE Register screen SHALL display the error message to the user
10. THE Login screen SHALL include a link to the Register screen and vice versa

### Requirement 3: API Client

**User Story:** As a developer, I want a centralised API client that automatically attaches authentication tokens, so that all backend calls are authenticated and consistent.

#### Acceptance Criteria

1. THE API_Client SHALL be a configured Axios instance with a base URL pointing to the FastAPI backend's `/api/v1` prefix
2. THE API_Client SHALL attach the Supabase access token as a `Bearer` token in the `Authorization` header on every request via an Axios request interceptor
3. WHEN a request returns HTTP 401, THE API_Client SHALL navigate the user to the Login screen
4. THE API_Client SHALL attach the device timezone as an `X-User-Timezone` header on requests that require it (dashboard, sync endpoints)

### Requirement 4: Navigation Shell

**User Story:** As a user, I want a bottom tab bar to navigate between the main sections of the app, so that I can quickly switch between dashboard, workouts, coach, and account.

#### Acceptance Criteria

1. THE Navigation_Shell SHALL use Expo Router with a bottom tab bar containing four tabs: Dashboard, Workouts, AI Coach, and Account
2. EACH tab SHALL display an icon and a label matching the web app's navigation: Dashboard (📊), Workouts (🏋️), AI Coach (🤖), Account (⚙️)
3. THE Navigation_Shell SHALL highlight the active tab
4. THE Navigation_Shell SHALL use stack navigators within each tab for drill-down screens (e.g. Activity Detail, Workout Detail, Workout Builder)
5. WHILE the user is not authenticated, THE Navigation_Shell SHALL not be visible and the auth screens SHALL be shown instead

### Requirement 5: Dashboard Screen

**User Story:** As a triathlete, I want to see my daily coach briefing, recovery metrics, training load, and upcoming workouts in one place, so that I can make informed training decisions each morning.

#### Acceptance Criteria

1. WHEN the Dashboard_Screen loads, THE Mobile_App SHALL fetch data from `GET /dashboard/overview` with the `X-User-Timezone` header
2. THE Dashboard_Screen SHALL display a sync status bar showing the last sync time and a "Sync Now" button
3. WHEN the user taps "Sync Now", THE Mobile_App SHALL call `POST /sync/quick` and refresh the dashboard data upon completion
4. THE Dashboard_Screen SHALL display the Coach Briefing card showing the AI or heuristic briefing with sleep analysis, activity analysis, up to 2 recommendations, and an optional caution section
5. WHEN no briefing is available, THE Dashboard_Screen SHALL display a placeholder message explaining that the briefing appears after 06:00 once Garmin data is synced
6. THE Dashboard_Screen SHALL display a Recovery Overview section with 6 metric tiles (Sleep Score, Sleep Duration, HRV, Resting HR, SpO2, Readiness) and their last-night values
7. THE Dashboard_Screen SHALL display a 30-day recovery trend chart showing Sleep Score, HRV, and Resting HR lines using a native Chart_Component
8. THE Dashboard_Screen SHALL display a metric trend table showing current value, 7-day average, and trend direction for each recovery metric
9. THE Dashboard_Screen SHALL display an Activity Overview section with 6 metric tiles (Sessions 7d, Duration 7d, Load TSS, Fitness CTL, Fatigue ATL, Form TSB)
10. THE Dashboard_Screen SHALL display a discipline breakdown showing per-discipline sessions, distance or duration, week-over-week delta, average intensity, and VO2max where applicable
11. THE Dashboard_Screen SHALL display a Fitness & Form chart (CTL, ATL, TSB lines with daily TSS bars) using a native Chart_Component
12. THE Dashboard_Screen SHALL display an Upcoming Workouts section listing the next scheduled workouts with discipline icon, name, date, duration, and TSS
13. THE Dashboard_Screen SHALL support pull-to-refresh to reload all dashboard data
14. WHILE data is loading, THE Dashboard_Screen SHALL display skeleton placeholders for each section

### Requirement 6: Activity Feed and Detail

**User Story:** As a triathlete, I want to browse my activity history and view detailed metrics for each activity, so that I can review my training sessions.

#### Acceptance Criteria

1. THE Activity_Feed SHALL fetch activities from `GET /activities` with pagination (limit/offset) and display them in a scrollable list
2. EACH activity item SHALL display the discipline icon, activity name, date, duration, distance (where applicable), and average heart rate
3. THE Activity_Feed SHALL support filtering by discipline via a horizontal filter bar at the top
4. THE Activity_Feed SHALL support infinite scroll to load more activities as the user scrolls down
5. WHEN the user taps an activity, THE Mobile_App SHALL navigate to the Activity_Detail_Screen
6. THE Activity_Detail_Screen SHALL fetch full activity data from `GET /activities/{id}`
7. THE Activity_Detail_Screen SHALL display a map with the activity polyline using the Map_Component when a polyline is available
8. THE Activity_Detail_Screen SHALL display lap data in a table or list format when laps are available
9. THE Activity_Detail_Screen SHALL display HR zone distribution as a horizontal bar chart when HR zone data is available
10. THE Activity_Detail_Screen SHALL display key metrics: duration, distance, elevation gain, average HR, max HR, average pace or power, cadence, TSS, and training effect
11. THE Activity_Detail_Screen SHALL display exercise details (name, sets, reps, weight) for strength activities when exercise data is available
12. IF the activity has an AI analysis, THEN THE Activity_Detail_Screen SHALL display the AI analysis text

### Requirement 7: AI Coach Chat

**User Story:** As a triathlete, I want to chat with my AI coach on my phone, so that I can get training advice and adjust my plan conversationally.

#### Acceptance Criteria

1. WHEN the Coach_Screen loads, THE Mobile_App SHALL fetch conversation history from `GET /coach/history`
2. THE Coach_Screen SHALL display messages in a chat bubble layout with user messages right-aligned and assistant messages left-aligned
3. THE Coach_Screen SHALL render assistant messages as Markdown using a React Native Markdown renderer
4. WHEN the user sends a message, THE Mobile_App SHALL stream the response from `POST /coach/chat` using Server-Sent Events (SSE) and display tokens incrementally
5. WHILE the assistant is responding, THE Coach_Screen SHALL display a typing indicator (animated dots)
6. WHEN the assistant response includes tool execution results (plan modifications), THE Coach_Screen SHALL display them as inline status messages
7. THE Coach_Screen SHALL display suggested prompts when the conversation is empty (e.g. "How is my fitness trending?", "Skip today's run")
8. THE Coach_Screen SHALL provide a "Clear history" button that calls `DELETE /coach/history` and resets the conversation
9. THE Coach_Screen SHALL keep the message input fixed at the bottom of the screen with proper keyboard avoidance behaviour
10. THE Coach_Screen SHALL auto-scroll to the latest message when new content arrives

### Requirement 8: Training Plan and Workout Hub

**User Story:** As a triathlete, I want to view my training plan, see weekly and monthly workout calendars, and manage my races, so that I can follow my periodised training programme.

#### Acceptance Criteria

1. WHEN the Workout_Hub loads, THE Mobile_App SHALL fetch all plans from `GET /plans` and the active plan with workouts from `GET /plans/{id}`
2. WHEN an active plan exists, THE Workout_Hub SHALL display the plan name, date range, weekly hours, and a phase indicator bar showing all training phases with the current phase highlighted
3. THE Workout_Hub SHALL display a weekly coach briefing fetched from `GET /plans/{id}/week-briefing/{week}` for the current week
4. THE Workout_Hub SHALL display a weekly calendar view with 7 day columns, each showing the day's workouts as tappable cards with discipline icon, name, duration, TSS, and completion status (completed, today, skipped, upcoming)
5. THE Workout_Hub SHALL provide week navigation controls (previous, next, today) and display the current week number out of total weeks
6. THE Workout_Hub SHALL provide a toggle to switch between weekly and monthly calendar views
7. THE monthly calendar view SHALL display a full month grid with workout indicators, race markers, and completion status per day
8. WHEN the user taps a workout card, THE Workout_Hub SHALL display a workout detail modal showing discipline, type, duration, TSS, HR zone target, warmup, main set, cooldown, and completion info
9. THE Workout_Hub SHALL provide a "Generate & Sync" button that calls `POST /plans/{id}/enrich-week/{week}` followed by `POST /plans/{id}/sync-garmin` to generate detailed workout programs and sync them to Garmin
10. WHEN no active plan exists, THE Workout_Hub SHALL display an empty state prompting the user to add a race and generate a plan
11. THE Workout_Hub SHALL include a Races section where users can add, edit, and delete races (goals) via `POST /coach/goals`, `DELETE /coach/goals/{id}`
12. THE Workout_Hub SHALL provide a "Generate Season Plan" button that calls `POST /plans/generate` to create an AI training plan from the configured races
13. WHEN the user taps a workout card's delete action, THE Mobile_App SHALL call `DELETE /workouts/{id}` after confirmation and refresh the plan

### Requirement 9: Workout Builder

**User Story:** As a triathlete, I want to create and edit structured workouts for any discipline on my phone, so that I can plan custom training sessions.

#### Acceptance Criteria

1. THE Workout_Builder SHALL provide a name input, discipline picker (Run, Swim, Road Bike, Gravel, Strength, Yoga, Mobility), and a scheduled date picker
2. WHEN the user selects an endurance discipline (Run, Swim, Road Bike, Gravel), THE Workout_Builder SHALL display the endurance builder with step-based workout construction (warmup, interval, recovery, cooldown, repeat) with duration, target type (HR zone, pace, power zone, RPE, open), and target value
3. WHEN the user selects Strength, THE Workout_Builder SHALL display the strength builder with block-based construction (exercise, superset, circuit, AMRAP, EMOM) containing exercises with sets, reps, weight, RPE, and rest
4. WHEN the user selects Yoga or Mobility, THE Workout_Builder SHALL display the yoga builder with a pose sequence (name, duration, side, notes)
5. THE Workout_Builder SHALL provide a "Save as template" checkbox that clears the scheduled date when enabled
6. WHEN the user saves a new workout, THE Mobile_App SHALL call `POST /workouts` with the workout payload
7. WHEN the user saves an existing workout, THE Mobile_App SHALL call `PUT /workouts/{id}` with the updated payload
8. THE Workout_Builder SHALL display estimated duration and volume summaries (total minutes for endurance, total sets and volume for strength, total minutes for yoga)
9. THE Workout_Builder SHALL navigate back to the Workout_Hub after a successful save

### Requirement 10: Workout Detail Screen

**User Story:** As a triathlete, I want to view the full details of a saved workout, so that I can review the program before or during a session.

#### Acceptance Criteria

1. THE Workout_Detail_Screen SHALL fetch workout data from `GET /workouts/{id}`
2. THE Workout_Detail_Screen SHALL display the workout name, discipline badge, scheduled date, description, estimated duration, and estimated TSS
3. THE Workout_Detail_Screen SHALL provide an "Edit" button that navigates to the Workout_Builder pre-filled with the workout data
4. THE Workout_Detail_Screen SHALL provide a back navigation button

### Requirement 11: Route Planner

**User Story:** As a triathlete, I want to plan running and cycling routes on a map on my phone, so that I can explore new training routes.

#### Acceptance Criteria

1. THE Route_Planner SHALL display a full-screen Mapbox map using the Map_Component
2. THE Route_Planner SHALL allow the user to place waypoints on the map by tapping
3. WHEN two or more waypoints are placed, THE Mobile_App SHALL call the backend route generation endpoint to compute a route via GraphHopper
4. THE Route_Planner SHALL display the computed route as a polyline on the map
5. THE Route_Planner SHALL display route statistics: total distance, estimated duration, and elevation gain
6. THE Route_Planner SHALL allow the user to select the activity type (running, road cycling, gravel cycling) which determines the GraphHopper routing profile
7. THE Route_Planner SHALL allow the user to remove waypoints and recompute the route

### Requirement 12: Account and Garmin Management

**User Story:** As a triathlete, I want to manage my Garmin connection and athlete profile on my phone, so that I can keep my training data and thresholds up to date.

#### Acceptance Criteria

1. THE Account_Screen SHALL display the Garmin connection status fetched from `GET /garmin/status` with a badge showing "Connected", "Session Expired", or "Not connected"
2. WHEN Garmin is not connected, THE Account_Screen SHALL provide a credentials form (email, password) and a "Connect Garmin" button that calls `POST /garmin/connect-and-sync`
3. WHEN Garmin is not connected, THE Account_Screen SHALL provide an alternative token import form for pasting `garmin_tokens.json` contents that calls `POST /garmin/connect/token-store`
4. WHEN Garmin is connected, THE Account_Screen SHALL display the connected email, last sync time, a "Sync Now" button, and a "Disconnect" button
5. WHEN the user taps "Sync Now", THE Mobile_App SHALL call `POST /sync/now` with the device timezone and display the sync result
6. WHEN the user taps "Disconnect", THE Mobile_App SHALL call `DELETE /garmin/disconnect` after confirmation
7. THE Account_Screen SHALL display the Athlete Profile form with sections: Training Preferences, Endurance Thresholds, Heart Rate, Strength, Body, and Athlete Notes
8. EACH athlete profile field SHALL display a source badge (Manual, Garmin, Default) indicating where the current value comes from
9. WHEN the user modifies profile fields and taps "Save profile", THE Mobile_App SHALL call `PUT /activities/profile/athlete` with the updated values
10. THE Account_Screen SHALL fetch the athlete profile from `GET /activities/profile/athlete` on load

### Requirement 13: Garmin Sync Lifecycle

**User Story:** As a triathlete, I want Garmin sync operations to be coordinated across all screens, so that I see consistent loading states and data refreshes regardless of where I trigger a sync.

#### Acceptance Criteria

1. THE Mobile_App SHALL maintain a global sync state (syncing, completed, failed) accessible from any screen
2. WHEN a Garmin sync starts from any screen, THE Mobile_App SHALL update the global sync state to "syncing" and all visible screens SHALL reflect the syncing state
3. WHEN a Garmin sync completes, THE Mobile_App SHALL update the global sync state with the result and all visible screens SHALL refresh their data
4. IF a Garmin sync fails, THEN THE Mobile_App SHALL update the global sync state with the error message and display it to the user
5. WHILE a sync is in progress, THE Mobile_App SHALL disable additional sync triggers to prevent concurrent syncs

### Requirement 14: Charts and Data Visualisation

**User Story:** As a triathlete, I want to see my training and recovery data visualised in charts on my phone, so that I can spot trends and make informed decisions.

#### Acceptance Criteria

1. THE Mobile_App SHALL use a React Native charting library (e.g. `victory-native`, `react-native-gifted-charts`, or `react-native-chart-kit`) to replace Recharts from the web app
2. THE Chart_Component SHALL render the Recovery Trend chart with Sleep Score, HRV, and Resting HR lines on dual Y-axes
3. THE Chart_Component SHALL render the Fitness & Form chart with CTL, ATL lines on the left axis, TSB line and daily TSS bars on the right axis, and coloured TSB zone backgrounds
4. THE Chart_Component SHALL render HR zone distribution as horizontal bars in the Activity Detail screen
5. THE Chart_Component SHALL support touch-based tooltips showing data point values when the user taps or long-presses on a chart

### Requirement 15: Maps

**User Story:** As a triathlete, I want to see activity routes and plan new routes on a native map, so that I get smooth map interactions on my phone.

#### Acceptance Criteria

1. THE Mobile_App SHALL use `@rnmapbox/maps` for all map rendering
2. THE Map_Component SHALL render activity polylines decoded from the backend's encoded polyline format
3. THE Map_Component SHALL auto-fit the camera bounds to the polyline extent when displaying an activity route
4. THE Map_Component SHALL support standard map gestures (pinch to zoom, pan, rotate)
5. THE Map_Component SHALL support waypoint placement via tap gesture for the Route Planner

### Requirement 16: Formatting and Display Utilities

**User Story:** As a developer, I want shared formatting utilities for durations, dates, metrics, and discipline metadata, so that display logic is consistent across all screens.

#### Acceptance Criteria

1. THE Mobile_App SHALL include a `format.ts` utility module ported from the web frontend containing: `formatDuration`, `formatDate`, `formatNumber`, `formatHRV`, `formatSleepScore`, `getDisciplineMeta`, `getTrendColor`, `getTrendLabel`, `getRecoveryStatusColor`, `getActivityStatusColor`, and `calculateDelta`
2. THE formatting functions SHALL produce identical output to the web frontend for the same inputs
3. THE `getDisciplineMeta` function SHALL return discipline label, emoji icon, and colour values adapted for React Native styling (not Tailwind classes)

### Requirement 17: Error Handling and Offline Resilience

**User Story:** As a user, I want clear error messages when something goes wrong and graceful handling of network issues, so that the app remains usable even with intermittent connectivity.

#### Acceptance Criteria

1. WHEN an API call fails with a network error, THE Mobile_App SHALL display a user-friendly error message with a retry option
2. WHEN an API call returns an error response with a `detail` field, THE Mobile_App SHALL display that detail message to the user
3. IF the backend returns HTTP 401 on any authenticated request, THEN THE Mobile_App SHALL clear the session and navigate to the Login screen
4. THE Mobile_App SHALL display loading indicators (skeleton screens or spinners) while data is being fetched
5. WHEN pull-to-refresh fails, THE Mobile_App SHALL display the error without clearing the previously loaded data

### Requirement 18: Theming and Visual Design

**User Story:** As a user, I want the mobile app to have a polished, native-feeling design consistent with the web app's visual identity, so that the experience feels cohesive.

#### Acceptance Criteria

1. THE Mobile_App SHALL support both light and dark colour themes, following the device system setting
2. THE Mobile_App SHALL use a colour palette consistent with the web app's design tokens (primary, foreground, muted, status-positive, status-negative, status-caution)
3. THE Mobile_App SHALL use native platform conventions for touch targets (minimum 44pt), spacing, and typography
4. THE Mobile_App SHALL use consistent card-based layouts for content sections matching the web app's visual hierarchy
