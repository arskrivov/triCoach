# Implementation Tasks

## Task 1: Add Garmin API retry helper and apply to sync functions
- [x] 1.1 Add `garmin_retry()` helper function to `backend/app/services/garmin_sync.py` with transient error detection, exponential backoff (max 2 retries, 1s base delay), and immediate raise for auth errors
- [x] 1.2 Apply `garmin_retry()` to `client.get_activities_by_date()` in `sync_activities()`
- [x] 1.3 Apply `garmin_retry()` to bulk health fetches in `sync_daily_health()`: `get_daily_steps()`, calories chunked fetch, `get_training_status()`
- [x] 1.4 Apply `garmin_retry()` to per-day health metric fetches in `sync_daily_health()`: `get_hrv_data()`, `get_body_battery()`, `get_stress_data()`, `get_sleep_data()`, `get_respiration_data()`, `get_morning_training_readiness()`, `get_spo2_data()`
- [x] 1.5 Add retry to `restore_client()` token refresh in `backend/app/services/garmin.py` — retry `_refresh_session()` up to 2 times on transient errors before raising auth error
- [x] 1.6 Write unit tests for `garmin_retry()` in `backend/tests/test_garmin_retry.py`: verify retry on transient errors, immediate raise on auth errors, correct backoff timing, max retry limit

## Task 2: Track missing health metrics in sync
- [x] 2.1 Refactor `sync_daily_health()` to track a `failed_metrics: set[str]` across all days, adding metric name (e.g. "hrv", "sleep", "stress") to the set when a per-day fetch fails
- [x] 2.2 Change `sync_daily_health()` return type from `int` to `tuple[int, list[str]]` returning `(records_count, sorted(failed_metrics))`
- [x] 2.3 Log a WARNING summary of failed metrics at the end of `sync_daily_health()` when the set is non-empty
- [x] 2.4 Update all callers of `sync_daily_health()` in `backend/app/routers/sync.py` and `backend/app/tasks/__init__.py` to handle the new return type
- [x] 2.5 Add `missing_health_metrics: list[str] = []` field to `SyncResponse` in `backend/app/routers/sync.py` and populate it from the sync result

## Task 3: Add OpenAI timeout and briefing path logging
- [x] 3.1 In `_generate_briefing()` in `backend/app/services/dashboard.py`, create the OpenAI client with `timeout=30.0` parameter
- [x] 3.2 Add `logger.info()` call when heuristic briefing is used because no OpenAI key is configured
- [x] 3.3 Add `logger.info()` call when AI briefing is successfully generated
- [x] 3.4 Replace the bare `except Exception` in `_generate_briefing()` with `except Exception as exc` and add `logger.warning()` that includes the exception details and indicates heuristic fallback
- [x] 3.5 Verify the `except Exception` in `_run_sync()` around `build_dashboard_overview()` has proper `logger.exception()` call (already added in prior fix — confirm it's present)

## Task 4: Add combined connect-and-sync endpoint
- [x] 4.1 Refactor `sync_activities()` and `sync_daily_health()` in `backend/app/services/garmin_sync.py` to accept an optional `client: Garmin | None = None` parameter, skipping `get_garmin_client()` when provided
- [x] 4.2 Add `POST /garmin/connect-and-sync` endpoint in `backend/app/routers/garmin.py` that: logs in to Garmin, persists the session, runs sync with the pre-authenticated client, and returns combined connect + sync response
- [x] 4.3 Add a `ConnectAndSyncResponse` Pydantic model in `backend/app/routers/garmin.py` or `backend/app/schemas/garmin.py` with fields: `connected`, `garmin_email`, `activities_synced`, `activity_files_synced`, `health_days_synced`, `missing_health_metrics`
- [x] 4.4 Update `handleConnect()` in `frontend/app/(app)/account/garmin-connect-card.tsx` to call `POST /garmin/connect-and-sync` instead of separate connect + syncHistory calls
- [x] 4.5 Ensure the frontend dispatches `garmin-sync-completed` event after successful connect-and-sync so the dashboard refreshes

## Task 5: Enhance Garmin status endpoint with session validation
- [x] 5.1 Add `session_status: str = "not_connected"` field to `GarminStatusResponse` in `backend/app/schemas/garmin.py` with allowed values: `"valid"`, `"expired"`, `"not_connected"`
- [x] 5.2 Update `GET /garmin/status` in `backend/app/routers/garmin.py` to decrypt session data, load tokens, check expiry, and return appropriate `session_status`
- [x] 5.3 Update `GarminConnectCard` in `frontend/app/(app)/account/garmin-connect-card.tsx` to show a warning badge and reconnect prompt when `session_status === "expired"`

## Task 6: Improve frontend error propagation
- [x] 6.1 Update `postGarminSync()` in `frontend/lib/garmin-sync-api.ts` to read response as text first, then attempt JSON parse, falling back to status code + text for non-JSON responses
- [x] 6.2 Include HTTP status code in the error message format: `"Sync failed (502)"` instead of generic `"Sync failed."`

## Task 7: Verify regression prevention
- [x] 7.1 Run existing dashboard tests (`backend/tests/test_dashboard_helpers.py`, `test_dashboard_utils.py`, `test_briefing_properties.py`) and confirm all pass
- [x] 7.2 Run existing garmin sync tests and confirm all pass
- [x] 7.3 Verify happy-path sync flow works end-to-end: connect → sync → briefing generation → dashboard display
