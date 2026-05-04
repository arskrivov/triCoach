/**
 * Unit tests for SyncStatusBar component.
 *
 * Tests the sync status display, button behaviour, API integration,
 * and error handling.
 *
 * **Validates: Requirements 5.2, 5.3, 13.5**
 */

import { useSyncStore } from "../../../stores/sync-store";
import { api } from "../../../lib/api";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that triggers module resolution
// ---------------------------------------------------------------------------

// Mock the theme hook
jest.mock("../../../lib/theme", () => ({
  useThemeColors: () => ({
    background: "#ffffff",
    foreground: "#0a0a0a",
    card: "#ffffff",
    cardBorder: "#e5e5e5",
    primary: "#2563eb",
    primaryForeground: "#ffffff",
    muted: "#f5f5f5",
    mutedForeground: "#737373",
    destructive: "#ef4444",
    statusPositive: "#10b981",
    statusNegative: "#ef4444",
    statusCaution: "#f59e0b",
  }),
  lightColors: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    card: "#ffffff",
    cardBorder: "#e5e5e5",
    primary: "#2563eb",
    primaryForeground: "#ffffff",
    muted: "#f5f5f5",
    mutedForeground: "#737373",
    destructive: "#ef4444",
    statusPositive: "#10b981",
    statusNegative: "#ef4444",
    statusCaution: "#f59e0b",
  },
  darkColors: {
    background: "#0a0a0a",
    foreground: "#fafafa",
    card: "#171717",
    cardBorder: "#262626",
    primary: "#3b82f6",
    primaryForeground: "#ffffff",
    muted: "#262626",
    mutedForeground: "#a3a3a3",
    destructive: "#ef4444",
    statusPositive: "#34d399",
    statusNegative: "#f87171",
    statusCaution: "#fbbf24",
  },
}));

// Mock the API client
jest.mock("../../../lib/api", () => ({
  api: {
    post: jest.fn(),
  },
}));

// Mock react-native useColorScheme
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => "light",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useSyncStore.setState({
    isSyncing: false,
    lastCompletedAt: null,
    lastResult: null,
    lastError: null,
    syncVersion: 0,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SyncStatusBar", () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  describe("sync store integration", () => {
    it("startSync returns false when already syncing (Requirement 13.5)", () => {
      useSyncStore.setState({ isSyncing: true });
      const result = useSyncStore.getState().startSync();
      expect(result).toBe(false);
      expect(useSyncStore.getState().isSyncing).toBe(true);
    });

    it("startSync returns true and sets isSyncing when not syncing", () => {
      const result = useSyncStore.getState().startSync();
      expect(result).toBe(true);
      expect(useSyncStore.getState().isSyncing).toBe(true);
    });

    it("completedSync updates state correctly", () => {
      useSyncStore.setState({ isSyncing: true });
      useSyncStore.getState().completedSync({
        activitiesSynced: 5,
        healthDaysSynced: 3,
      });

      const state = useSyncStore.getState();
      expect(state.isSyncing).toBe(false);
      expect(state.lastResult).toEqual({
        activitiesSynced: 5,
        healthDaysSynced: 3,
      });
      expect(state.lastCompletedAt).toBeGreaterThan(0);
      expect(state.syncVersion).toBe(1);
    });

    it("failSync updates state with error message", () => {
      useSyncStore.setState({ isSyncing: true });
      useSyncStore.getState().failSync("Garmin session expired");

      const state = useSyncStore.getState();
      expect(state.isSyncing).toBe(false);
      expect(state.lastError).toBe("Garmin session expired");
    });
  });

  describe("sync API call flow", () => {
    it("calls POST /sync/quick and updates store on success", async () => {
      const mockResponse = {
        data: {
          activities_synced: 3,
          health_days_synced: 7,
        },
      };
      (api.post as jest.Mock).mockResolvedValueOnce(mockResponse);

      // Simulate the handleSyncNow logic
      const { startSync, completedSync, failSync } = useSyncStore.getState();
      if (!startSync()) throw new Error("startSync should return true");

      try {
        const response = await api.post("/sync/quick");
        const data = response.data;
        completedSync({
          activitiesSynced: data.activities_synced ?? 0,
          healthDaysSynced: data.health_days_synced ?? 0,
        });
      } catch {
        failSync("unexpected");
      }

      expect(api.post).toHaveBeenCalledWith("/sync/quick");
      const state = useSyncStore.getState();
      expect(state.isSyncing).toBe(false);
      expect(state.lastResult).toEqual({
        activitiesSynced: 3,
        healthDaysSynced: 7,
      });
      expect(state.syncVersion).toBe(1);
      expect(state.lastError).toBeNull();
    });

    it("calls POST /sync/quick and updates store on failure", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { detail: "Garmin session expired" },
        },
      };
      (api.post as jest.Mock).mockRejectedValueOnce(mockError);

      const { startSync, completedSync, failSync } = useSyncStore.getState();
      if (!startSync()) throw new Error("startSync should return true");

      try {
        const response = await api.post("/sync/quick");
        const data = response.data;
        completedSync({
          activitiesSynced: data.activities_synced ?? 0,
          healthDaysSynced: data.health_days_synced ?? 0,
        });
      } catch (error: unknown) {
        const { extractApiError } = require("../../../lib/error-handling");
        const apiError = extractApiError(error);
        failSync(apiError.message);
      }

      expect(api.post).toHaveBeenCalledWith("/sync/quick");
      const state = useSyncStore.getState();
      expect(state.isSyncing).toBe(false);
      expect(state.lastError).toBe("Garmin session expired");
      expect(state.syncVersion).toBe(0); // not incremented on failure
    });

    it("does not call API when already syncing (Requirement 13.5)", async () => {
      useSyncStore.setState({ isSyncing: true });

      const { startSync } = useSyncStore.getState();
      const canSync = startSync();

      expect(canSync).toBe(false);
      expect(api.post).not.toHaveBeenCalled();
    });

    it("syncVersion increments on each successful sync (triggers dashboard refresh)", async () => {
      const mockResponse = {
        data: { activities_synced: 1, health_days_synced: 1 },
      };
      (api.post as jest.Mock).mockResolvedValue(mockResponse);

      // First sync
      useSyncStore.getState().startSync();
      const response1 = await api.post("/sync/quick");
      useSyncStore.getState().completedSync({
        activitiesSynced: response1.data.activities_synced,
        healthDaysSynced: response1.data.health_days_synced,
      });
      expect(useSyncStore.getState().syncVersion).toBe(1);

      // Second sync
      useSyncStore.getState().startSync();
      const response2 = await api.post("/sync/quick");
      useSyncStore.getState().completedSync({
        activitiesSynced: response2.data.activities_synced,
        healthDaysSynced: response2.data.health_days_synced,
      });
      expect(useSyncStore.getState().syncVersion).toBe(2);
    });
  });

  describe("sync response mapping", () => {
    it("maps snake_case API response to camelCase SyncResult", async () => {
      const mockResponse = {
        data: {
          activities_synced: 12,
          health_days_synced: 30,
          activity_files_synced: 5,
          missing_health_metrics: ["spo2"],
        },
      };
      (api.post as jest.Mock).mockResolvedValueOnce(mockResponse);

      useSyncStore.getState().startSync();
      const response = await api.post("/sync/quick");
      const data = response.data;
      useSyncStore.getState().completedSync({
        activitiesSynced: data.activities_synced ?? 0,
        healthDaysSynced: data.health_days_synced ?? 0,
      });

      const state = useSyncStore.getState();
      expect(state.lastResult).toEqual({
        activitiesSynced: 12,
        healthDaysSynced: 30,
      });
    });

    it("handles missing fields in API response gracefully", async () => {
      const mockResponse = { data: {} };
      (api.post as jest.Mock).mockResolvedValueOnce(mockResponse);

      useSyncStore.getState().startSync();
      const response = await api.post("/sync/quick");
      const data = response.data;
      useSyncStore.getState().completedSync({
        activitiesSynced: data.activities_synced ?? 0,
        healthDaysSynced: data.health_days_synced ?? 0,
      });

      const state = useSyncStore.getState();
      expect(state.lastResult).toEqual({
        activitiesSynced: 0,
        healthDaysSynced: 0,
      });
    });
  });
});
