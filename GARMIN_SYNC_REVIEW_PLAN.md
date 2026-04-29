# Garmin Sync Review And Simplification Plan

## Goal

Fix the current Garmin sync UX so that:

1. Pages do not require a manual browser refresh after sync.
2. Pages show stable placeholder layouts while data is loading or being re-fetched.
3. The solution is shared across the app instead of implemented separately per page.
4. The backend reports Garmin auth/session failures clearly instead of leaking low-level login wording.

## Current Findings

### Sync entry points

- `frontend/app/(app)/layout.tsx`
  - Sidebar `Sync Garmin` button posts to `/sync/now`.
  - Dispatches sync start / complete / fail browser events.
- `frontend/app/(app)/dashboard/dashboard-content.tsx`
  - Dashboard has its own `Sync Now` button.
  - It also listens to Garmin sync events and manually re-fetches dashboard data.
- `frontend/app/(app)/account/garmin-connect-card.tsx`
  - Manual sync and connect-and-sync run here too.
  - It dispatches events, but only the dashboard currently reacts by reloading its data.

### Why manual refresh is still needed

- Dashboard is the only page that reloads data after Garmin sync completion.
- `Workouts`, `Account/AthleteProfile`, and `Coach` each fetch data locally on mount and then keep stale state.
- That means sync can succeed, backend data can update, and the UI still looks stale until a full page reload.

### Loading UX gaps

- Dashboard initial load returns a plain `Loading…` line before content.
- Dashboard sync shows a banner/spinner, but not in-place card placeholders.
- Workouts has a custom pulse layout for the initial fetch only.
- Athlete profile renders live inputs immediately and fills them later.
- There is no shared “page is refreshing because sync is running” state.

### Backend/auth handling observations

- `/sync/now` and `/sync/quick` use stored Garmin session data.
- Expired-session detection exists in `backend/app/routers/sync.py`, but matching is string-based and narrow.
- `restore_client()` in `backend/app/services/garmin.py` already converts several auth refresh failures to `401`.
- The user-reported “login/password not provided” style error is likely another Garmin auth/session message that is not yet normalized consistently.

## Proposed Simplified Approach

### 1. Extend the existing Garmin sync event module into one app-level sync state source

Instead of adding a new state library or a heavy provider, extend `frontend/lib/garmin-sync.ts` so it also keeps a tiny in-memory sync snapshot that components can read via a hook.

That shared state should track:

- `isSyncing`
- `lastCompletedAt`
- `lastError`
- optional `lastSource`

Reason:

- Keep the existing event mechanism.
- Avoid adding React Query / SWR / a new global state dependency.
- Avoid even a dedicated provider if a tiny store on top of the current event file is enough.
- Give every page the same source of truth for “sync is in progress” and “sync just completed”.

### 2. Add a small shared “sync-aware reload” hook

Create a simple helper for client pages that already fetch their own data:

- Accepts an async reload function.
- Runs that reload function when Garmin sync completes.
- Exposes whether the current page should render in placeholder mode:
  - initial load
  - sync-triggered reload

Target pages for automatic reload:

- Dashboard
- Workouts
- Account athlete profile
- Account Garmin status card

Explicitly not a first target:

- `Coach` chat history, unless inspection during implementation shows a real Garmin-data dependency.

Reason:

- The coach chat page is conversational state, not a Garmin-derived dashboard.
- Blanking an active conversation during sync would be a UX regression.

Reason:

- Minimal refactor.
- Reuses existing local state rather than replacing page logic wholesale.

### 3. Standardize loading placeholders instead of full-page empty states

Implement light skeleton/blinking placeholders that preserve layout shape:

- Dashboard
  - keep header / actions visible
  - replace card content with skeleton blocks while loading/reloading
- Workouts
  - keep page frame and week layout visible
  - blank out workout cards / phase sections with pulse placeholders
- Account
  - keep cards rendered
  - show pulsing placeholders in fields/status sections until data arrives
- Coach
  - if included, show placeholder bubbles/history blocks instead of a blank page

Rule:

- Prefer `animate-pulse`/existing `Skeleton` over new animation complexity.
- No spinner-only loading states for page content.

### 4. Refresh page data automatically after sync completion

On Garmin sync completion:

- Dashboard reloads overview data.
- Workouts reloads plan list / active plan / weekly briefing.
- Athlete profile reloads effective Garmin-derived profile fields.
- Garmin account card reloads status.
- Keep updates local; do not force `window.location.reload()` or `router.refresh()` for Garmin sync.

Important nuance:

- Connect-and-sync must also enter the same sync lifecycle.
- Right now `connect-and-sync` emits only a completion event in the account card, so other pages cannot show loading placeholders during first connection.
- The implementation should normalize all sync entry points so they emit:
  - started
  - completed
  - failed

### 5. Tighten Garmin auth/session error normalization

Expand server-side Garmin auth/session mapping so stored-session failures reliably return one clear message:

- Prefer:
  - `Garmin session expired — please reconnect your Garmin account in Settings.`
- Catch additional Garmin error strings similar to:
  - missing login/password
  - missing credentials
  - not logged in
  - authentication required

Reason:

- Prevent false-looking failures after partial sync attempts.
- Keep UI messaging stable regardless of Garmin library wording.

## Implementation Outline

1. Extend `frontend/lib/garmin-sync.ts` into a tiny shared sync store plus hook.
2. Add a shared helper for:
   - reading sync state
   - subscribing page reloads to sync completion
3. Normalize sync lifecycle dispatching for:
   - sidebar sync
   - dashboard sync
   - account manual sync
   - account connect-and-sync
4. Refactor dashboard loading state to use in-place skeleton versions of existing sections.
5. Refactor workouts page to:
   - extract its load routine into a reusable reload function
   - reload automatically after sync completion
   - render skeleton layout during initial load and sync reload
6. Refactor account cards to:
   - expose proper initial loading states
   - reload after sync completion
7. Refine backend Garmin auth/session message mapping in:
   - `backend/app/services/garmin.py`
   - `backend/app/routers/sync.py`
8. Add/update targeted tests.

## Tests To Add Or Update

### Frontend

- Dashboard:
  - reloads after Garmin sync complete event
  - shows placeholders while reloading
- Athlete profile:
  - shows loading placeholders before data loads
  - reloads on Garmin sync complete event
- Garmin connect card:
  - status refreshes after sync completion event or local sync
- Shared sync state:
  - start / complete / fail events update state correctly

### Backend

- Garmin auth error normalization:
  - “missing login/password” style message maps to reconnect/session-expired response

## Risks

- Over-scoping into a full data-fetching architecture rewrite.
- Triggering duplicate reloads if local sync buttons both reload directly and also react to completion events.
- Flicker if reloading clears data too aggressively instead of preserving page chrome and swapping only content areas.
- Over-applying sync placeholders to pages whose primary state is user-authored conversation or form state.

## Guardrails

- Keep existing API endpoints.
- Keep existing browser events.
- Do not introduce a new fetch library.
- Do not replace local page state with a large abstraction.
- Prefer one small shared sync layer plus targeted page reload hooks.
- Do not blank user-entered form state or active chat state just because Garmin sync is running.

## Acceptance Criteria

- Clicking sync from sidebar, dashboard, or account updates visible data without manual page refresh.
- During load/reload, pages keep their structure and show pulsing empty placeholders.
- Garmin session/auth failures show one clean reconnect message instead of low-level Garmin credential wording.
- No `window.location.reload()` is required for Garmin-sync-driven updates.
