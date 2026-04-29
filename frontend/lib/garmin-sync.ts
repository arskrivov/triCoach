"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

export const GARMIN_SYNC_STARTED_EVENT = "garmin-sync-started";
export const GARMIN_SYNC_COMPLETED_EVENT = "garmin-synced";
export const GARMIN_SYNC_FAILED_EVENT = "garmin-sync-failed";

export type GarminSyncSource = "dashboard" | "settings" | "sidebar";

export type GarminSyncCompletedDetail = {
  activitiesSynced: number;
  healthDaysSynced: number;
  source: GarminSyncSource;
};

export type GarminSyncFailedDetail = {
  message: string;
  source: GarminSyncSource;
};

type GarminSyncOperationCounts = {
  activities_synced: number;
  health_days_synced: number;
};

type GarminSyncSnapshot = {
  isSyncing: boolean;
  lastSource: GarminSyncSource | null;
  lastCompletedAt: number | null;
  lastCompletedDetail: GarminSyncCompletedDetail | null;
  lastFailureAt: number | null;
  lastFailureDetail: GarminSyncFailedDetail | null;
};

const DEFAULT_SYNC_SNAPSHOT: GarminSyncSnapshot = {
  isSyncing: false,
  lastSource: null,
  lastCompletedAt: null,
  lastCompletedDetail: null,
  lastFailureAt: null,
  lastFailureDetail: null,
};

let syncSnapshot = DEFAULT_SYNC_SNAPSHOT;
const syncListeners = new Set<() => void>();

function updateSyncSnapshot(next: Partial<GarminSyncSnapshot>) {
  syncSnapshot = { ...syncSnapshot, ...next };
  syncListeners.forEach((listener) => listener());
}

function subscribeSyncSnapshot(listener: () => void) {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

function getSyncSnapshot() {
  return syncSnapshot;
}

function dispatchWindowEvent<T>(name: string, detail: T) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<T>(name, { detail }));
}

export function dispatchGarminSyncStarted(source: GarminSyncSource) {
  updateSyncSnapshot({
    isSyncing: true,
    lastSource: source,
    lastFailureAt: null,
    lastFailureDetail: null,
  });
  dispatchWindowEvent(GARMIN_SYNC_STARTED_EVENT, { source });
}

export function dispatchGarminSyncCompleted(detail: GarminSyncCompletedDetail) {
  updateSyncSnapshot({
    isSyncing: false,
    lastSource: detail.source,
    lastCompletedAt: Date.now(),
    lastCompletedDetail: detail,
    lastFailureAt: null,
    lastFailureDetail: null,
  });
  dispatchWindowEvent(GARMIN_SYNC_COMPLETED_EVENT, detail);
}

export function dispatchGarminSyncFailed(detail: GarminSyncFailedDetail) {
  updateSyncSnapshot({
    isSyncing: false,
    lastSource: detail.source,
    lastFailureAt: Date.now(),
    lastFailureDetail: detail,
  });
  dispatchWindowEvent(GARMIN_SYNC_FAILED_EVENT, detail);
}

export async function runGarminSyncOperation<T extends GarminSyncOperationCounts>(
  source: GarminSyncSource,
  operation: () => Promise<T>,
  getErrorMessage?: (error: unknown) => string,
): Promise<T> {
  dispatchGarminSyncStarted(source);

  try {
    const result = await operation();
    dispatchGarminSyncCompleted({
      activitiesSynced: result.activities_synced,
      healthDaysSynced: result.health_days_synced,
      source,
    });
    return result;
  } catch (error: unknown) {
    const message =
      getErrorMessage?.(error)
      ?? (error instanceof Error ? error.message : "Sync failed.");
    dispatchGarminSyncFailed({ message, source });
    throw error;
  }
}

export function useGarminSyncState() {
  return useSyncExternalStore(subscribeSyncSnapshot, getSyncSnapshot, getSyncSnapshot);
}

export function useGarminSyncReload(
  onCompleted: (detail: GarminSyncCompletedDetail) => void | Promise<void>,
) {
  const { lastCompletedAt, lastCompletedDetail } = useGarminSyncState();
  const handledAtRef = useRef(lastCompletedAt);

  useEffect(() => {
    if (
      lastCompletedAt === null
      || lastCompletedDetail === null
      || handledAtRef.current === lastCompletedAt
    ) {
      return;
    }

    handledAtRef.current = lastCompletedAt;
    void onCompleted(lastCompletedDetail);
  }, [lastCompletedAt, lastCompletedDetail, onCompleted]);
}

export function resetGarminSyncStateForTests() {
  syncSnapshot = DEFAULT_SYNC_SNAPSHOT;
  syncListeners.forEach((listener) => listener());
}
