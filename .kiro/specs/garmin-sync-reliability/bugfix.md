# Bugfix Requirements Document

## Introduction

The Garmin sync and AI Coach briefing pipeline has multiple reliability issues that degrade the user experience. Users encounter "Sync Failed" errors after connecting Garmin, missing Coach briefing text on the dashboard, and stale "Connected" status badges that mask expired sessions. These bugs span the backend sync service, briefing generation, Garmin session management, and frontend error propagation. The combined effect is that the morning sync workflow — the app's most critical daily touchpoint — is unreliable.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN briefing generation fails during sync (e.g. OpenAI timeout, malformed response, or any exception in `_generate_briefing`) THEN the system silently swallows the error via a bare `except Exception` in `_run_sync()` and returns a successful sync response with no briefing, and no log entry indicating which briefing path was taken (AI vs heuristic vs failure)

1.2 WHEN `_generate_briefing()` calls the OpenAI API THEN the system makes the call with no request timeout, allowing the sync request to hang indefinitely if OpenAI is slow or unresponsive

1.3 WHEN a user completes `POST /garmin/connect` and the frontend immediately calls `syncHistory("settings")` which triggers a 90-day sync THEN the system may fail with a 401 because `sync_activities()` calls `get_garmin_client()` which re-fetches from DB, decrypts, and calls `restore_client()` — and if the freshly-created OAuth token triggers a refresh check that fails, the entire sync errors out while the UI simultaneously shows "Garmin connected"

1.4 WHEN `GET /garmin/status` is called THEN the system only checks whether `garmin_session_data` is not null, reporting "Connected" even when the stored session has expired or become invalid — the user sees a stale "Connected" badge for days until a sync attempt fails

1.5 WHEN the backend returns a non-JSON error response (e.g. 502 HTML gateway error) during sync THEN `postGarminSync()` in `garmin-sync-api.ts` catches the JSON parse failure silently and returns the generic message "Sync failed." — the backend's detailed error in the `detail` field is lost

1.6 WHEN any single Garmin API call (activity fetch, health metric fetch, token refresh) encounters a transient network error THEN the system fails immediately with no retry, causing the entire sync to fail on a single network hiccup despite Garmin's API being known for intermittent failures

1.7 WHEN individual health metric fetches (HRV, body battery, stress, sleep, respiration, SpO2, readiness) fail during `sync_daily_health()` THEN the system catches each error silently and continues with partial data, and the subsequent briefing generation uses this incomplete data with no indication to the user or the AI prompt that metrics are missing

### Expected Behavior (Correct)

2.1 WHEN briefing generation fails during sync THEN the system SHALL log the failure with the exception details at ERROR level, record which briefing path was attempted (AI vs heuristic), and still return the sync response successfully — but the briefing field in the dashboard overview SHALL include a `source` field indicating `"failed"` so the frontend can inform the user that the Coach tip is temporarily unavailable

2.2 WHEN `_generate_briefing()` calls the OpenAI API THEN the system SHALL enforce a request timeout (e.g. 30 seconds) so that a slow or unresponsive OpenAI endpoint does not block the sync indefinitely, and SHALL fall back to the heuristic briefing if the timeout is exceeded

2.3 WHEN a user completes `POST /garmin/connect` and the frontend triggers the initial sync THEN the system SHALL use the Garmin client instance already authenticated during the connect step (or persist the session so that the immediate `get_garmin_client()` call reliably restores it without a token refresh race), ensuring the first sync after connect succeeds without a 401

2.4 WHEN `GET /garmin/status` is called THEN the system SHALL perform a lightweight validation of the stored Garmin session (e.g. check token expiry timestamp or attempt a low-cost API probe) and return a status that distinguishes between `connected` (session valid), `expired` (session needs reconnection), and `not_connected` — so the user sees accurate connection state

2.5 WHEN the backend returns a non-JSON error response during sync THEN `postGarminSync()` SHALL extract the response text or status code and include it in the thrown error message instead of falling back to the generic "Sync failed." string

2.6 WHEN a Garmin API call encounters a transient network error (timeout, connection reset, 5xx response) THEN the system SHALL retry the call up to 2 additional times with exponential backoff before failing, so that intermittent Garmin API flakiness does not cause full sync failures

2.7 WHEN individual health metric fetches fail during `sync_daily_health()` THEN the system SHALL track which metrics failed, log a summary of missing metrics at WARNING level, and pass a `missing_metrics` list into the briefing generation context so the AI prompt (or heuristic) can acknowledge data gaps rather than silently reasoning over incomplete data

### Unchanged Behavior (Regression Prevention)

3.1 WHEN all Garmin API calls succeed and OpenAI responds normally THEN the system SHALL CONTINUE TO sync activities and health data, generate an AI briefing, and return the full dashboard overview exactly as it does today

3.2 WHEN a user has never connected Garmin THEN the system SHALL CONTINUE TO return `connected: false` from `GET /garmin/status` and reject sync attempts with a 400 error

3.3 WHEN a sync is triggered and no new data has changed (same `data_signature`) THEN the system SHALL CONTINUE TO return the cached briefing without regenerating it

3.4 WHEN the OpenAI API key is not configured THEN the system SHALL CONTINUE TO fall back to the heuristic briefing without attempting an AI call

3.5 WHEN a user disconnects Garmin via `DELETE /garmin/disconnect` THEN the system SHALL CONTINUE TO clear all Garmin session data and return the disconnected state

3.6 WHEN sync completes successfully THEN the system SHALL CONTINUE TO dispatch `garmin-sync-completed` custom events in the frontend so the dashboard refreshes automatically

3.7 WHEN individual activity detail fetches fail (details, splits, HR zones, weather) THEN the system SHALL CONTINUE TO log warnings and proceed with partial activity data — this existing graceful degradation for activity-level fetches must be preserved
