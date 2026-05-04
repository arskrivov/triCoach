/**
 * Zustand store for Garmin sync state.
 * Manages global sync state accessible from any screen without provider nesting.
 *
 * Requirements: 13.1 (global sync state), 13.2 (syncing state propagation),
 * 13.3 (completion refresh), 13.4 (error state), 13.5 (concurrent sync guard)
 */
import { create } from "zustand";

export interface SyncResult {
  activitiesSynced: number;
  healthDaysSynced: number;
}

export interface SyncState {
  isSyncing: boolean;
  lastCompletedAt: number | null;
  lastResult: SyncResult | null;
  lastError: string | null;
  syncVersion: number; // incremented on completion to trigger re-fetches

  startSync: () => boolean; // returns false if already syncing
  completedSync: (result: SyncResult) => void;
  failSync: (error: string) => void;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isSyncing: false,
  lastCompletedAt: null,
  lastResult: null,
  lastError: null,
  syncVersion: 0,

  startSync: () => {
    if (get().isSyncing) return false;
    set({ isSyncing: true, lastError: null });
    return true;
  },

  completedSync: (result) =>
    set((s) => ({
      isSyncing: false,
      lastCompletedAt: Date.now(),
      lastResult: result,
      lastError: null,
      syncVersion: s.syncVersion + 1,
    })),

  failSync: (error) => set({ isSyncing: false, lastError: error }),
}));
