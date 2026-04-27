# Bugfix Design Document

## Overview

This design addresses 7 reliability bugs in the Garmin sync and Coach briefing pipeline. The fixes are organized into 4 change areas: Garmin session management, sync error handling with retries, briefing generation reliability, and frontend error propagation. Each change maps to one or more bug conditions from the requirements.

## Change Area 1: Garmin Session Management (Bugs 1.3, 1.4)

### Problem
- After `POST /garmin/connect`, the frontend immediately triggers a 90-day sync. The sync calls `get_garmin_client()` which re-fetches from DB, decrypts, and calls `restore_client()` — a fresh token may trigger a spurious refresh check that fails.
- `GET /garmin/status` only checks if `garmin_session_data` is not null, never validating the session.

### Design

#### 1a. Eliminate connect → sync race condition (Bug 1.3)

**File: `backend/app/routers/garmin.py`**

Add a `POST /garmin/connect-and-sync` endpoint that combines connect + initial sync into a single request. This avoids the race where the frontend connects, then immediately syncs with a separate DB round-trip.

```python
@router.post("/connect-and-sync")
async def connect_and_sync(
    body: GarminConnectRequest,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
    user_timezone: str | None = Header(default=None, alias="X-User-Timezone"),
):
    # 1. Login to Garmin
    client, session_data = await connect_garmin(body.garmin_email, body.garmin_password)
    
    # 2. Persist session
    encrypted = encrypt_session(session_data)
    await sb.table("users").update({
        "garmin_email": body.garmin_email,
        "garmin_session_data": encrypted,
        "garmin_connected_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", current_user.id).execute()
    
    # 3. Run sync using the already-authenticated client (no re-fetch from DB)
    sync_result = await run_sync_with_client(client, current_user, sb, days_back=90, timezone_name=user_timezone)
    
    return {
        "connected": True,
        "garmin_email": body.garmin_email,
        **sync_result,
    }
```

**File: `backend/app/services/garmin_sync.py`**

Refactor `sync_activities()` and `sync_daily_health()` to accept an optional pre-authenticated `Garmin` client parameter. When provided, skip the `get_garmin_client()` call.

```python
async def sync_activities(
    user_id: str,
    sb: AsyncClient,
    days_back: int = 90,
    client: Garmin | None = None,  # NEW: accept pre-authenticated client
) -> tuple[int, int]:
    if client is None:
        client = await get_garmin_client(user_id, sb)
    # ... rest unchanged
```

**File: `frontend/app/(app)/account/garmin-connect-card.tsx`**

Update `handleConnect()` to call the new combined endpoint instead of connect + syncHistory separately.

#### 1b. Lightweight session validation on status check (Bug 1.4)

**File: `backend/app/routers/garmin.py`**

Enhance `GET /garmin/status` to attempt decryption and check token expiry without making a Garmin API call. Return a `session_status` field: `"valid"`, `"expired"`, or `"not_connected"`.

```python
@router.get("/status")
async def status_endpoint(current_user: UserRow = Depends(get_current_user)):
    if not current_user.garmin_session_data:
        return GarminStatusResponse(connected=False, session_status="not_connected", ...)
    
    try:
        session_data = decrypt_session(current_user.garmin_session_data)
        # Check if token store exists and is parseable
        token_store = session_data.get("token_store")
        if not token_store:
            return GarminStatusResponse(connected=False, session_status="expired", ...)
        
        # Try to load tokens and check expiry without making API call
        client = Garmin()
        client.client.loads(token_store)
        if (
            getattr(client.client, "_token_expires_soon", None)
            and client.client._token_expires_soon()
            and not getattr(client.client, "di_refresh_token", None)
        ):
            return GarminStatusResponse(connected=True, session_status="expired", ...)
        
        return GarminStatusResponse(connected=True, session_status="valid", ...)
    except Exception:
        return GarminStatusResponse(connected=True, session_status="expired", ...)
```

**File: `backend/app/schemas/garmin.py`**

Add `session_status: str` field to `GarminStatusResponse`.

**File: `frontend/app/(app)/account/garmin-connect-card.tsx`**

Update the status display to show a warning badge when `session_status === "expired"` and prompt reconnection.

---

## Change Area 2: Retry Logic for Garmin API Calls (Bug 1.6)

### Problem
Any single Garmin API call failure (network hiccup, 5xx, timeout) fails the entire sync with no retry.

### Design

**File: `backend/app/services/garmin_sync.py`**

Add a `_garmin_retry()` helper that wraps Garmin API calls with retry logic. Use `asyncio` sleep for backoff since the sync functions are async.

```python
import time
import logging

logger = logging.getLogger(__name__)

_TRANSIENT_PHRASES = ("timeout", "connection", "503", "502", "500", "reset", "timed out")

def _is_transient(exc: Exception) -> bool:
    err = str(exc).lower()
    return any(p in err for p in _TRANSIENT_PHRASES)

def garmin_retry(func, *args, max_retries: int = 2, base_delay: float = 1.0, **kwargs):
    """Call a Garmin client method with retry on transient errors.
    
    Retries up to max_retries times with exponential backoff.
    Non-transient errors (auth failures, 404s) are raised immediately.
    """
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            return func(*args, **kwargs)
        except Exception as exc:
            last_exc = exc
            if attempt < max_retries and _is_transient(exc):
                delay = base_delay * (2 ** attempt)
                logger.warning(
                    "Garmin API call %s failed (attempt %d/%d), retrying in %.1fs: %s",
                    func.__name__, attempt + 1, max_retries + 1, delay, exc,
                )
                time.sleep(delay)
            else:
                raise
    raise last_exc
```

Apply `garmin_retry()` to the critical sync calls:
- `client.get_activities_by_date()` in `sync_activities()`
- `client.get_daily_steps()`, `client.get_hrv_data()`, etc. in `sync_daily_health()`
- `client.client._refresh_session()` in `restore_client()`

Non-critical per-activity detail calls (splits, HR zones, weather) keep their existing single-try behavior per requirement 3.7.

---

## Change Area 3: Briefing Generation Reliability (Bugs 1.1, 1.2, 1.7)

### Problem
- OpenAI calls have no timeout, can hang indefinitely.
- Briefing generation failures are silently swallowed.
- Health metric failures produce incomplete data with no indication.

### Design

#### 3a. Add OpenAI timeout (Bug 1.2)

**File: `backend/app/services/dashboard.py`** — `_generate_briefing()`

Add a `timeout` parameter to the OpenAI client call:

```python
from openai import OpenAI

client = OpenAI(api_key=settings.openai_api_key, timeout=30.0)
```

If the timeout is exceeded, the existing `except Exception` block already falls back to the heuristic briefing. Add a log entry to distinguish timeout from other failures:

```python
except Exception as exc:
    logger.warning("AI briefing generation failed, using heuristic fallback: %s", exc)
    return fallback
```

#### 3b. Log briefing path and surface failures (Bug 1.1)

**File: `backend/app/services/dashboard.py`** — `_generate_briefing()`

Add logging for every briefing path:

```python
async def _generate_briefing(...) -> dict[str, Any]:
    fallback = _heuristic_briefing(overview, local_date, local_time)
    if not settings.openai_api_key:
        logger.info("Briefing for %s: heuristic (no OpenAI key)", local_date)
        return fallback
    try:
        # ... OpenAI call ...
        logger.info("Briefing for %s: AI (%s)", local_date, settings.openai_analysis_model)
        return briefing
    except Exception as exc:
        logger.warning("Briefing for %s: heuristic fallback (AI failed: %s)", local_date, exc)
        return fallback
```

**File: `backend/app/routers/sync.py`** — `_run_sync()`

Replace the bare `except Exception` around `build_dashboard_overview()` with proper logging. The briefing generation already has its own fallback, so the sync-level catch should log but not swallow:

```python
try:
    await build_dashboard_overview(
        current_user, sb,
        timezone_name=timezone_name,
        allow_briefing_generation=True,
    )
except Exception:
    logger.exception("Briefing generation failed during sync for user %s", current_user.id)
    # Sync still succeeds — briefing is best-effort
```

This is already the current behavior, but the logging is now explicit about what happened.

#### 3c. Track missing health metrics (Bug 1.7)

**File: `backend/app/services/garmin_sync.py`** — `sync_daily_health()`

Return a list of failed metric names alongside the count:

```python
async def sync_daily_health(
    user_id: str,
    sb: AsyncClient,
    days_back: int = 90,
    client: Garmin | None = None,
) -> tuple[int, list[str]]:  # Changed: returns (count, failed_metrics)
    # ... existing code ...
    failed_metrics: set[str] = set()
    
    # In each metric fetch block:
    try:
        hrv_data = garmin_retry(client.get_hrv_data, date_str)
        # ...
    except Exception:
        failed_metrics.add("hrv")
    
    # ... same pattern for each metric ...
    
    if failed_metrics:
        logger.warning(
            "Health sync for user %s: missing metrics on some days: %s",
            user_id, ", ".join(sorted(failed_metrics)),
        )
    
    return len(records), sorted(failed_metrics)
```

**File: `backend/app/routers/sync.py`**

Update `SyncResponse` to include `missing_health_metrics`:

```python
class SyncResponse(BaseModel):
    activities_synced: int
    activity_files_synced: int = 0
    health_days_synced: int
    missing_health_metrics: list[str] = []  # NEW
```

**File: `backend/app/services/dashboard.py`** — `BRIEFING_SYSTEM_PROMPT`

No change to the system prompt. The heuristic and AI briefings already handle null metric values gracefully. The `missing_metrics` list is for logging and frontend display, not for changing the prompt.

---

## Change Area 4: Frontend Error Propagation (Bugs 1.5)

### Problem
`postGarminSync()` drops backend error details when the response isn't valid JSON.

### Design

**File: `frontend/lib/garmin-sync-api.ts`**

Improve error extraction to handle non-JSON responses:

```typescript
if (!response.ok) {
  let message = `Sync failed (${response.status})`;
  try {
    const text = await response.text();
    try {
      const payload = JSON.parse(text) as { detail?: string };
      if (payload?.detail) {
        message = payload.detail;
      }
    } catch {
      // Not JSON — use the raw text if it's short enough to be useful
      if (text.length > 0 && text.length < 200) {
        message = text;
      }
    }
  } catch {
    // Could not read response body at all
  }
  throw new Error(message);
}
```

**File: `frontend/app/(app)/account/garmin-connect-card.tsx`**

Update `handleConnect()` to use the new combined `POST /garmin/connect-and-sync` endpoint:

```typescript
async function handleConnect(e: React.FormEvent) {
  e.preventDefault();
  setError("");
  setSuccess("");
  setLoading(true);

  try {
    const response = await api.post<ConnectAndSyncResponse>(
      "/garmin/connect-and-sync",
      { garmin_email: email, garmin_password: password },
      {
        ...GARMIN_REQUEST_CONFIG,
        headers: { "X-User-Timezone": getTimezone() },
      },
    );
    setStatus({ connected: true, garmin_email: email, last_sync_at: null });
    setSuccess(
      `Garmin connected. Imported ${response.data.activities_synced} activities and ${response.data.health_days_synced} health days.`,
    );
    // Dispatch sync completed event so dashboard refreshes
    dispatchGarminSyncCompleted({
      activitiesSynced: response.data.activities_synced,
      healthDaysSynced: response.data.health_days_synced,
      source: "settings",
    });
    setEmail("");
    setPassword("");
  } catch (error: unknown) {
    setError(getErrorMessage(error, "Failed to connect. Check your credentials."));
  } finally {
    setLoading(false);
  }
}
```

**File: `frontend/app/(app)/dashboard/coach-briefing-card.tsx`**

No change needed. The card already handles `briefing: null` with a placeholder. The `source` field already distinguishes AI vs heuristic. If briefing generation fails, the heuristic fallback is used, so the card always gets a valid briefing or null.

---

## File Change Summary

| File | Changes | Bugs Addressed |
|------|---------|----------------|
| `backend/app/routers/garmin.py` | Add `POST /garmin/connect-and-sync`; enhance `GET /garmin/status` with session validation | 1.3, 1.4 |
| `backend/app/schemas/garmin.py` | Add `session_status` field to `GarminStatusResponse` | 1.4 |
| `backend/app/services/garmin.py` | Add retry to `restore_client()` token refresh | 1.6 |
| `backend/app/services/garmin_sync.py` | Add `garmin_retry()` helper; accept optional client param; track failed health metrics | 1.3, 1.6, 1.7 |
| `backend/app/services/dashboard.py` | Add 30s OpenAI timeout; add briefing path logging | 1.1, 1.2 |
| `backend/app/routers/sync.py` | Update `SyncResponse` with `missing_health_metrics`; use refactored sync functions | 1.1, 1.7 |
| `backend/app/config.py` | No changes needed (timeout is hardcoded in OpenAI client constructor) | — |
| `frontend/lib/garmin-sync-api.ts` | Improve error extraction for non-JSON responses | 1.5 |
| `frontend/app/(app)/account/garmin-connect-card.tsx` | Use combined connect-and-sync endpoint; show expired session warning | 1.3, 1.4 |

## Regression Prevention

All changes preserve existing behavior per requirements 3.1–3.7:
- Happy-path sync + briefing flow is unchanged (3.1)
- Unconnected users still get 400 on sync (3.2)
- Cached briefings with matching signatures are still returned (3.3)
- Missing OpenAI key still falls back to heuristic (3.4)
- Disconnect still clears all data (3.5)
- Frontend sync events still dispatched (3.6)
- Per-activity detail fetch failures still gracefully degraded (3.7)

## Testing Strategy

1. **Unit tests** for `garmin_retry()` — verify retry on transient errors, immediate raise on auth errors
2. **Unit tests** for `_generate_briefing()` — verify timeout fallback, logging
3. **Unit tests** for `sync_daily_health()` — verify failed metrics tracking
4. **Integration test** for `POST /garmin/connect-and-sync` — verify combined flow
5. **Frontend test** for `postGarminSync()` — verify error extraction from non-JSON responses
