# Implementation Plan: Expo Mobile Rewrite

## Overview

Incremental implementation of the TriCoach Expo (React Native) mobile app in `mobile/`. Foundation layers first (scaffolding, auth, API client, navigation, theme), then screens from simplest to most complex, with property-based and unit tests integrated alongside each feature. The backend is unchanged — the mobile app consumes the same FastAPI `/api/v1` endpoints.

## Tasks

- [x] 1. Expo project scaffolding and shared utilities
  - [x] 1.1 Initialise Expo project with Expo Router, TypeScript, and app.json
    - Run `npx create-expo-app mobile --template tabs` (or blank + manual Expo Router setup)
    - Configure `app.json` with name "TriCoach", bundleIdentifier, Expo SDK version
    - Set up `tsconfig.json`, `babel.config.js`, `package.json` scripts
    - Add `.env` with `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 Port TypeScript types from web frontend
    - Copy `frontend/lib/types.ts` to `mobile/lib/types.ts`
    - Remove any web-only types (none expected, but audit)
    - Add mobile-specific types: `GarminStatus`, `GarminSyncResponse`, `ChatMessage`, `WorkoutStatus`
    - _Requirements: 1.6_

  - [x] 1.3 Create theme system with light/dark colour tokens
    - Create `mobile/lib/theme.ts` with `lightColors`, `darkColors`, and `useThemeColors()` hook
    - Colour palette matches web app design tokens (primary, foreground, muted, status-positive, status-negative, status-caution, discipline colours)
    - Theme follows device system setting via `useColorScheme()`
    - _Requirements: 18.1, 18.2_

  - [x] 1.4 Port formatting utilities from web frontend
    - Create `mobile/lib/format.ts` ported from `frontend/lib/format.ts`
    - Port all functions: `formatDuration`, `formatDate`, `formatNumber`, `formatHRV`, `formatSleepScore`, `getDisciplineMeta`, `getTrendColor`, `getTrendLabel`, `getRecoveryStatusColor`, `getActivityStatusColor`, `calculateDelta`
    - Adapt `getDisciplineMeta` to return React Native colour values instead of Tailwind classes
    - Adapt `formatSleepScore`, `getTrendColor`, `getRecoveryStatusColor`, `getActivityStatusColor` to return React Native colour values
    - _Requirements: 16.1, 16.3_

  - [x] 1.5 Write property tests for formatting utilities
    - **Property 11: Format functions produce identical output to web frontend**
    - **Property 12: getDisciplineMeta returns valid data for all disciplines**
    - **Validates: Requirements 16.2, 16.3**

  - [x] 1.6 Create error handling utilities
    - Create `mobile/lib/error-handling.ts` ported from web frontend
    - Implement `extractApiError()` that normalises Axios error shapes into `ApiError` objects
    - _Requirements: 17.1, 17.2_

  - [x] 1.7 Write property test for error extraction
    - **Property 13: Error extraction returns backend detail message**
    - **Validates: Requirements 17.2**

  - [x] 1.8 Create polyline decode and bounding box utilities
    - Create `mobile/lib/polyline.ts` with `decodePolyline()` and `computeBounds()`
    - Standard Google polyline decoding algorithm
    - _Requirements: 15.2, 15.3_

  - [x] 1.9 Write property tests for polyline utilities
    - **Property 9: Polyline decode round-trip preserves coordinates**
    - **Property 10: Bounding box contains all coordinates**
    - **Validates: Requirements 15.2, 15.3**

- [x] 2. Authentication and API client
  - [x] 2.1 Set up Supabase client with AsyncStorage
    - Install `@supabase/supabase-js`, `@react-native-async-storage/async-storage`
    - Create `mobile/lib/supabase.ts` initialised with AsyncStorage, `autoRefreshToken`, `persistSession`, `detectSessionInUrl: false`
    - _Requirements: 2.1_

  - [x] 2.2 Create Axios API client with JWT interceptor
    - Create `mobile/lib/api.ts` with Axios instance, base URL `${EXPO_PUBLIC_API_URL}/api/v1`
    - Request interceptor: read token from `supabase.auth.getSession()`, attach as `Bearer` in `Authorization` header
    - Response interceptor: on 401, call `supabase.auth.signOut()` (auth provider handles navigation)
    - Attach `X-User-Timezone` header via `Intl.DateTimeFormat().resolvedOptions().timeZone`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 2.3 Write property test for API client JWT interceptor
    - **Property 1: API client attaches Bearer token on every request**
    - **Validates: Requirements 3.2**

  - [x] 2.4 Create Auth provider and hook
    - Create `mobile/hooks/useAuth.ts` with `AuthState` interface: `session`, `loading`, `signIn`, `signUp`, `signOut`
    - Listen to `supabase.auth.onAuthStateChange` to track session
    - On app launch, check for existing session
    - _Requirements: 2.2, 2.3_

  - [x] 2.5 Create Login and Register screens
    - Create `mobile/app/(auth)/_layout.tsx` — auth layout with no tab bar
    - Create `mobile/app/(auth)/login.tsx` — email/password inputs, "Sign in" button, link to register, error display
    - Create `mobile/app/(auth)/register.tsx` — name (optional), email, password inputs, "Create account" button, link to login, error display
    - On success, navigate to dashboard (handled by auth state change)
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

- [x] 3. Navigation shell and UI primitives
  - [x] 3.1 Create root layout with providers
    - Create `mobile/app/_layout.tsx` — wraps app in auth provider, theme provider, checks session, redirects to auth or tabs
    - _Requirements: 4.5_

  - [x] 3.2 Create tab bar layout with 4 tabs
    - Create `mobile/app/(tabs)/_layout.tsx` — bottom tab bar with Dashboard (📊), Workouts (🏋️), AI Coach (🤖), Account (⚙️)
    - Highlight active tab, display icon + label
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 3.3 Create stack navigators for drill-down screens
    - Create `mobile/app/(tabs)/dashboard/_layout.tsx` — stack for Dashboard → Activity Detail, Route Planner
    - Create `mobile/app/(tabs)/workouts/_layout.tsx` — stack for Workout Hub → Workout Detail → Workout Builder
    - _Requirements: 4.4_

  - [x] 3.4 Create shared UI primitives
    - Create `mobile/components/ui/Card.tsx`, `Button.tsx`, `Input.tsx`, `Badge.tsx`, `Skeleton.tsx`, `Alert.tsx`
    - Use theme colours, minimum 44pt touch targets, consistent spacing
    - _Requirements: 18.3, 18.4_

- [x] 4. Checkpoint — Foundation complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Garmin sync store and hooks
  - [x] 5.1 Create Zustand sync store
    - Install `zustand`
    - Create `mobile/stores/sync-store.ts` with `SyncState` interface: `isSyncing`, `lastCompletedAt`, `lastResult`, `lastError`, `syncVersion`, `startSync()`, `completedSync()`, `failSync()`
    - `startSync()` returns false if already syncing (guard against concurrent syncs)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 5.2 Write property test for sync guard
    - **Property 8: Sync guard prevents concurrent syncs**
    - **Validates: Requirements 13.5**

  - [x] 5.3 Create sync hooks
    - Create `mobile/hooks/useSyncState.ts` — thin wrapper around Zustand store
    - Create `mobile/hooks/useRefreshOnSync.ts` — subscribes to `syncVersion`, calls `onRefresh` callback when version increments
    - _Requirements: 13.2, 13.3_

- [x] 6. Dashboard screen
  - [x] 6.1 Create SyncStatusBar component
    - Display last sync time, "Sync Now" button
    - Tapping "Sync Now" calls `POST /sync/quick`, updates sync store, refreshes dashboard on completion
    - Disable button while syncing
    - _Requirements: 5.2, 5.3, 13.5_

  - [x] 6.2 Create MetricTile component
    - Reusable tile showing label, value, unit, optional trend indicator
    - Used by both Recovery Overview and Activity Overview sections
    - _Requirements: 5.6, 5.9_

  - [x] 6.3 Create BriefingCard component
    - Display AI/heuristic briefing: sleep analysis, activity analysis, up to 2 recommendations, optional caution
    - Show placeholder when no briefing available (before 06:00 or no Garmin data)
    - _Requirements: 5.4, 5.5_

  - [x] 6.4 Create RecoveryOverview component
    - 6 metric tiles: Sleep Score, Sleep Duration, HRV, Resting HR, SpO2, Readiness
    - Metric trend table: current value, 7-day average, trend direction
    - _Requirements: 5.6, 5.8_

  - [x] 6.5 Create RecoveryTrendChart component
    - Install `victory-native` and `@shopify/react-native-skia`
    - Line chart with Sleep Score, HRV, Resting HR on dual Y-axes
    - 30-day data, touch-based tooltips
    - _Requirements: 5.7, 14.1, 14.2, 14.5_

  - [x] 6.6 Create ActivityOverview component
    - 6 metric tiles: Sessions 7d, Duration 7d, Load TSS, Fitness CTL, Fatigue ATL, Form TSB
    - Discipline breakdown: per-discipline sessions, distance/duration, week-over-week delta, avg intensity, VO2max
    - _Requirements: 5.9, 5.10_

  - [x] 6.7 Create FitnessFormChart component
    - Line chart: CTL, ATL lines (left axis), TSB line + daily TSS bars (right axis)
    - Coloured TSB zone backgrounds, touch-based tooltips
    - _Requirements: 5.11, 14.3, 14.5_

  - [x] 6.8 Create UpcomingWorkouts component
    - List of next scheduled workouts: discipline icon, name, date, duration, TSS
    - _Requirements: 5.12_

  - [x] 6.9 Assemble Dashboard screen
    - Create `mobile/app/(tabs)/dashboard/index.tsx`
    - Fetch `GET /dashboard/overview` with `X-User-Timezone` header on mount
    - Compose all dashboard components in a ScrollView
    - Pull-to-refresh via RefreshControl
    - Skeleton placeholders while loading
    - Auto-refresh on sync completion via `useRefreshOnSync`
    - _Requirements: 5.1, 5.13, 5.14_

- [x] 7. Checkpoint — Dashboard complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Activity feed and detail
  - [x] 8.1 Create ActivityListItem component
    - Display discipline icon, activity name, date, duration, distance (when applicable), average HR
    - _Requirements: 6.2_

  - [x] 8.2 Write property test for ActivityListItem
    - **Property 2: Activity list item displays all required fields**
    - **Validates: Requirements 6.2**

  - [x] 8.3 Create DisciplineFilter component
    - Horizontal filter bar with discipline chips
    - _Requirements: 6.3_

  - [x] 8.4 Create Activity Feed screen
    - Create activity feed within the Dashboard tab stack (or as a section of dashboard with "See all" navigation)
    - Fetch `GET /activities` with pagination (limit/offset)
    - Infinite scroll via FlatList `onEndReached`
    - Filter by discipline via DisciplineFilter
    - Tap navigates to Activity Detail
    - _Requirements: 6.1, 6.3, 6.4, 6.5_

  - [x] 8.5 Create ActivityMap component
    - Install `@rnmapbox/maps`
    - Decode encoded polyline via `decodePolyline()`, render as ShapeSource + LineLayer
    - Auto-fit camera bounds to polyline extent via `computeBounds()`
    - Standard map gestures (pinch, pan, rotate)
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 8.6 Create LapTable and HRZoneChart components
    - LapTable: display lap data in a list/table format
    - HRZoneChart: horizontal bar chart for HR zone distribution using victory-native
    - _Requirements: 6.8, 6.9, 14.4_

  - [x] 8.7 Create ExerciseList component
    - Display exercise details (name, sets, reps, weight) for strength activities
    - _Requirements: 6.11_

  - [x] 8.8 Create Activity Detail screen
    - Create `mobile/app/(tabs)/dashboard/activity/[id].tsx`
    - Fetch `GET /activities/{id}`
    - Display map (when polyline available), key metrics, laps, HR zones, exercises, AI analysis
    - Key metrics: duration, distance, elevation gain, avg HR, max HR, avg pace/power, cadence, TSS, training effect
    - _Requirements: 6.6, 6.7, 6.10, 6.12_

  - [x] 8.9 Write property test for Activity Detail metric display
    - **Property 3: Activity detail displays all non-null key metrics**
    - **Validates: Requirements 6.10**

- [x] 9. Checkpoint — Activity feed and detail complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. AI Coach chat
  - [x] 10.1 Create Coach chat screen
    - Create `mobile/app/(tabs)/coach.tsx`
    - Fetch conversation history from `GET /coach/history` on mount
    - Chat bubble layout: user messages right-aligned, assistant messages left-aligned
    - Render assistant messages as Markdown using `react-native-markdown-display` or similar
    - Suggested prompts when conversation is empty ("How is my fitness trending?", "Skip today's run", etc.)
    - "Clear history" button calls `DELETE /coach/history`
    - _Requirements: 7.1, 7.2, 7.7, 7.8_

  - [x] 10.2 Write property test for Markdown rendering
    - **Property 4: Assistant messages render as formatted Markdown**
    - **Validates: Requirements 7.3**

  - [x] 10.3 Implement SSE streaming for coach responses
    - On send, POST to `/coach/chat` using fetch with ReadableStream
    - Parse SSE `data:` lines, extract `token` fields, accumulate into assistant message
    - Display typing indicator (animated dots) while streaming
    - Handle tool execution results as inline status messages
    - Auto-scroll to latest message
    - Message input fixed at bottom with keyboard avoidance (KeyboardAvoidingView)
    - AbortController for cancelling in-flight streams on navigation
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.9, 7.10_

- [x] 11. Training plan and Workout Hub
  - [x] 11.1 Create PhaseIndicator component
    - Horizontal bar showing all training phases with current phase highlighted
    - Phase colours: Base (blue), Build (amber), Peak (red), Taper (emerald), Recovery (purple)
    - _Requirements: 8.2_

  - [x] 11.2 Create WorkoutCard component
    - Tappable card: discipline icon, name, duration, TSS, completion status (completed, today, skipped, upcoming)
    - Status-based styling (green for completed, primary for today, amber for skipped, default for upcoming)
    - _Requirements: 8.4_

  - [x] 11.3 Create WeeklyCalendar component
    - 7 day columns, each showing day's workouts as WorkoutCards
    - Week navigation: previous, next, today buttons
    - Display current week number out of total weeks
    - _Requirements: 8.4, 8.5_

  - [x] 11.4 Write property test for workout day placement
    - **Property 5: Workouts are placed in the correct day column**
    - **Validates: Requirements 8.4**

  - [x] 11.5 Create MonthlyCalendar component
    - Full month grid with workout indicators, race markers, completion status per day
    - Month navigation controls
    - _Requirements: 8.7_

  - [x] 11.6 Create WorkoutDetailModal component
    - Modal showing discipline, type, duration, TSS, HR zone target, warmup, main set, cooldown, completion info
    - Delete action with confirmation
    - _Requirements: 8.8, 8.13_

  - [x] 11.7 Create RacesSection component
    - List of active races/goals
    - Add race form (description, target date, sport, race type, priority)
    - Delete race with confirmation
    - "Generate Season Plan" button
    - _Requirements: 8.11, 8.12_

  - [x] 11.8 Assemble Workout Hub screen
    - Create `mobile/app/(tabs)/workouts/index.tsx`
    - Fetch `GET /plans` and `GET /plans/{id}` on mount
    - Display plan name, date range, weekly hours, phase indicator
    - Weekly coach briefing from `GET /plans/{id}/week-briefing/{week}`
    - Toggle between weekly and monthly calendar views
    - "Generate & Sync" button: `POST /plans/{id}/enrich-week/{week}` then `POST /plans/{id}/sync-garmin`
    - Empty state when no active plan: prompt to add race and generate plan
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.9, 8.10_

- [x] 12. Checkpoint — Workout Hub complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Workout Builder and Detail
  - [x] 13.1 Create EnduranceBuilder component
    - Step-based workout construction: warmup, interval, recovery, cooldown, repeat
    - Each step: duration, target type (HR zone, pace, power zone, RPE, open), target value
    - _Requirements: 9.2_

  - [x] 13.2 Create StrengthBuilder component
    - Block-based construction: exercise, superset, circuit, AMRAP, EMOM
    - Each exercise: sets, reps, weight, RPE, rest
    - Exercise library search via `GET /workouts/exercises/library`
    - _Requirements: 9.3_

  - [x] 13.3 Create YogaBuilder component
    - Pose sequence: name, duration, side, notes
    - _Requirements: 9.4_

  - [x] 13.4 Assemble Workout Builder screen
    - Create `mobile/app/(tabs)/workouts/builder.tsx`
    - Name input, discipline picker, scheduled date picker
    - Switch between EnduranceBuilder, StrengthBuilder, YogaBuilder based on discipline
    - "Save as template" checkbox (clears scheduled date)
    - Estimated duration and volume summaries
    - Save: `POST /workouts` (new) or `PUT /workouts/{id}` (edit)
    - Navigate back to Workout Hub on success
    - _Requirements: 9.1, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [x] 13.5 Write property test for workout duration/volume summaries
    - **Property 6: Workout builder duration and volume summaries are correct**
    - **Validates: Requirements 9.8**

  - [x] 13.6 Create Workout Detail screen
    - Create `mobile/app/(tabs)/workouts/[id].tsx`
    - Fetch `GET /workouts/{id}`
    - Display name, discipline badge, scheduled date, description, estimated duration, estimated TSS
    - "Edit" button navigates to Workout Builder pre-filled
    - Back navigation
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 14. Route Planner
  - [x] 14.1 Create RoutePlannerMap component
    - Full-screen Mapbox map using `@rnmapbox/maps`
    - Tap to place waypoints, display as markers
    - Remove waypoints and recompute route
    - _Requirements: 11.1, 11.2, 11.7, 15.5_

  - [x] 14.2 Create Route Planner screen
    - Create `mobile/app/(tabs)/dashboard/routes.tsx`
    - Activity type selector: running, road cycling, gravel cycling
    - When 2+ waypoints placed, call backend route generation endpoint (GraphHopper)
    - Display computed route as polyline on map
    - Display route stats: total distance, estimated duration, elevation gain
    - _Requirements: 11.3, 11.4, 11.5, 11.6_

- [x] 15. Account screen
  - [x] 15.1 Create GarminConnectCard component
    - Fetch `GET /garmin/status` — display connection badge ("Connected", "Session Expired", "Not connected")
    - Not connected: credentials form (email, password) + "Connect Garmin" button → `POST /garmin/connect-and-sync`
    - Not connected: alternative token import form → `POST /garmin/connect/token-store`
    - Connected: display email, last sync time, "Sync Now" button → `POST /sync/now`, "Disconnect" button → `DELETE /garmin/disconnect`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 15.2 Create AthleteProfileForm component
    - Fetch `GET /activities/profile/athlete` on mount
    - Sections: Training Preferences, Endurance Thresholds, Heart Rate, Strength, Body, Athlete Notes
    - Each field displays source badge (Manual, Garmin, Default) from `field_sources`
    - "Save profile" button → `PUT /activities/profile/athlete`
    - _Requirements: 12.7, 12.8, 12.9, 12.10_

  - [x] 15.3 Write property test for athlete profile source badges
    - **Property 7: Athlete profile source badges match field_sources**
    - **Validates: Requirements 12.8**

  - [x] 15.4 Assemble Account screen
    - Create `mobile/app/(tabs)/account.tsx`
    - Compose GarminConnectCard and AthleteProfileForm in a ScrollView
    - _Requirements: 12.1, 12.7_

- [x] 16. Final checkpoint — All features complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major feature area
- Property tests validate the 13 correctness properties defined in the design document using `fast-check`
- Unit tests validate specific examples, edge cases, and component rendering
- The backend is unchanged — all work is in the `mobile/` directory
- All code is TypeScript targeting iOS via Expo development builds
