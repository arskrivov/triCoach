/**
 * Unit tests for the useRefreshOnSync hook.
 *
 * Validates: Requirements 13.3 (completion refresh — all visible screens refresh their data)
 */

import { renderHook, act } from "@testing-library/react-native";
import { useRefreshOnSync } from "../../hooks/useRefreshOnSync";
import { useSyncStore } from "../../stores/sync-store";

jest.useFakeTimers();

function resetStore() {
  useSyncStore.setState({
    isSyncing: false,
    lastCompletedAt: null,
    lastResult: null,
    lastError: null,
    syncVersion: 0,
  });
}

describe("useRefreshOnSync", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it("does not call onRefresh on initial render", () => {
    const onRefresh = jest.fn();
    renderHook(() => useRefreshOnSync(onRefresh));

    jest.advanceTimersByTime(1000);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("calls onRefresh after delay when syncVersion increments", () => {
    const onRefresh = jest.fn();
    renderHook(() => useRefreshOnSync(onRefresh));

    act(() => {
      useSyncStore.getState().startSync();
      useSyncStore.getState().completedSync({ activitiesSynced: 3, healthDaysSynced: 1 });
    });

    // Not called immediately
    expect(onRefresh).not.toHaveBeenCalled();

    // Called after 500ms delay
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("calls onRefresh each time syncVersion increments", () => {
    const onRefresh = jest.fn();
    renderHook(() => useRefreshOnSync(onRefresh));

    act(() => {
      useSyncStore.getState().startSync();
      useSyncStore.getState().completedSync({ activitiesSynced: 1, healthDaysSynced: 0 });
    });

    act(() => { jest.advanceTimersByTime(500); });
    expect(onRefresh).toHaveBeenCalledTimes(1);

    act(() => {
      useSyncStore.getState().startSync();
      useSyncStore.getState().completedSync({ activitiesSynced: 2, healthDaysSynced: 1 });
    });

    act(() => { jest.advanceTimersByTime(500); });
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("does not call onRefresh when sync fails (syncVersion unchanged)", () => {
    const onRefresh = jest.fn();
    renderHook(() => useRefreshOnSync(onRefresh));

    act(() => {
      useSyncStore.getState().startSync();
      useSyncStore.getState().failSync("Connection timeout");
    });

    act(() => { jest.advanceTimersByTime(1000); });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not call onRefresh when syncVersion stays the same", () => {
    const onRefresh = jest.fn();
    renderHook(() => useRefreshOnSync(onRefresh));

    act(() => {
      useSyncStore.setState({ lastError: "some error" });
    });

    act(() => { jest.advanceTimersByTime(1000); });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
