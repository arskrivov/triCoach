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

function dispatchWindowEvent<T>(name: string, detail: T) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<T>(name, { detail }));
}

export function dispatchGarminSyncStarted(source: GarminSyncSource) {
  dispatchWindowEvent(GARMIN_SYNC_STARTED_EVENT, { source });
}

export function dispatchGarminSyncCompleted(detail: GarminSyncCompletedDetail) {
  dispatchWindowEvent(GARMIN_SYNC_COMPLETED_EVENT, detail);
}

export function dispatchGarminSyncFailed(detail: GarminSyncFailedDetail) {
  dispatchWindowEvent(GARMIN_SYNC_FAILED_EVENT, detail);
}
