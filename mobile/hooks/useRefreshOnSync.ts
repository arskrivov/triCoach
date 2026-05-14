/**
 * Auto-refresh hook that triggers a callback when a Garmin sync completes.
 * Subscribes to `syncVersion` from the Zustand store and calls `onRefresh`
 * whenever the version increments (i.e. a sync has just completed).
 *
 * Usage:
 * ```ts
 * const fetchData = useCallback(async () => { ... }, []);
 * useRefreshOnSync(fetchData);
 * ```
 *
 * Requirements: 13.3 (completion refresh — all visible screens refresh their data)
 */
import { useEffect, useRef } from "react";
import { useSyncStore } from "../stores/sync-store";

export function useRefreshOnSync(onRefresh: () => void): void {
  const syncVersion = useSyncStore((s) => s.syncVersion);
  const prevVersion = useRef(syncVersion);

  useEffect(() => {
    if (syncVersion > prevVersion.current) {
      prevVersion.current = syncVersion;
      // Small delay to ensure backend data is fully committed before re-fetch
      const timer = setTimeout(() => onRefresh(), 500);
      return () => clearTimeout(timer);
    }
  }, [syncVersion, onRefresh]);
}
