/**
 * Sync state hook — thin wrapper around the Zustand sync store.
 * Selects commonly used fields for convenience so screens don't need
 * to import the store directly or write individual selectors.
 *
 * Requirements: 13.2 (syncing state propagation), 13.3 (completion refresh)
 */
import { useSyncStore, type SyncResult } from "../stores/sync-store";

export interface UseSyncStateReturn {
  isSyncing: boolean;
  lastCompletedAt: number | null;
  lastResult: SyncResult | null;
  lastError: string | null;
  syncVersion: number;
  startSync: () => boolean;
  completedSync: (result: SyncResult) => void;
  failSync: (error: string) => void;
}

/**
 * Convenience hook that exposes the full sync store state and actions.
 * Screens can destructure only the fields they need:
 *
 * ```ts
 * const { isSyncing, startSync, completedSync, failSync } = useSyncState();
 * ```
 */
export function useSyncState(): UseSyncStateReturn {
  const isSyncing = useSyncStore((s) => s.isSyncing);
  const lastCompletedAt = useSyncStore((s) => s.lastCompletedAt);
  const lastResult = useSyncStore((s) => s.lastResult);
  const lastError = useSyncStore((s) => s.lastError);
  const syncVersion = useSyncStore((s) => s.syncVersion);
  const startSync = useSyncStore((s) => s.startSync);
  const completedSync = useSyncStore((s) => s.completedSync);
  const failSync = useSyncStore((s) => s.failSync);

  return {
    isSyncing,
    lastCompletedAt,
    lastResult,
    lastError,
    syncVersion,
    startSync,
    completedSync,
    failSync,
  };
}
