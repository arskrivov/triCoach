import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchGarminSyncCompleted,
  dispatchGarminSyncFailed,
  dispatchGarminSyncStarted,
  resetGarminSyncStateForTests,
  useGarminSyncReload,
  useGarminSyncState,
} from "../garmin-sync";

describe("garmin-sync shared state", () => {
  beforeEach(() => {
    resetGarminSyncStateForTests();
  });

  it("tracks started, completed, and failed sync lifecycle state", () => {
    const { result } = renderHook(() => useGarminSyncState());

    act(() => {
      dispatchGarminSyncStarted("sidebar");
    });
    expect(result.current.isSyncing).toBe(true);
    expect(result.current.lastSource).toBe("sidebar");

    act(() => {
      dispatchGarminSyncCompleted({
        activitiesSynced: 4,
        healthDaysSynced: 2,
        source: "sidebar",
      });
    });
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.lastCompletedDetail).toEqual({
      activitiesSynced: 4,
      healthDaysSynced: 2,
      source: "sidebar",
    });

    act(() => {
      dispatchGarminSyncFailed({
        message: "Garmin session expired",
        source: "settings",
      });
    });
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.lastFailureDetail).toEqual({
      message: "Garmin session expired",
      source: "settings",
    });
  });

  it("runs reload callbacks only when a sync completion happens after mount", async () => {
    const onCompleted = vi.fn();

    renderHook(() => useGarminSyncReload(onCompleted));

    act(() => {
      dispatchGarminSyncCompleted({
        activitiesSynced: 7,
        healthDaysSynced: 3,
        source: "dashboard",
      });
    });

    await waitFor(() => {
      expect(onCompleted).toHaveBeenCalledWith({
        activitiesSynced: 7,
        healthDaysSynced: 3,
        source: "dashboard",
      });
    });
  });
});
