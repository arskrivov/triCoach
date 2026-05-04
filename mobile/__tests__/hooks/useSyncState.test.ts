/**
 * Unit tests for the useSyncState hook.
 *
 * Validates: Requirements 13.2 (syncing state propagation), 13.3 (completion refresh)
 */

import { renderHook, act } from '@testing-library/react-native';
import { useSyncState } from '../../hooks/useSyncState';
import { useSyncStore } from '../../stores/sync-store';

/**
 * Reset the store to a clean initial state between tests.
 */
function resetStore() {
  useSyncStore.setState({
    isSyncing: false,
    lastCompletedAt: null,
    lastResult: null,
    lastError: null,
    syncVersion: 0,
  });
}

describe('useSyncState', () => {
  beforeEach(() => {
    resetStore();
  });

  it('returns initial state values', () => {
    const { result } = renderHook(() => useSyncState());

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.lastCompletedAt).toBeNull();
    expect(result.current.lastResult).toBeNull();
    expect(result.current.lastError).toBeNull();
    expect(result.current.syncVersion).toBe(0);
  });

  it('exposes startSync that updates isSyncing', () => {
    const { result } = renderHook(() => useSyncState());

    act(() => {
      const started = result.current.startSync();
      expect(started).toBe(true);
    });

    expect(result.current.isSyncing).toBe(true);
  });

  it('exposes completedSync that updates result and increments syncVersion', () => {
    const { result } = renderHook(() => useSyncState());

    act(() => {
      result.current.startSync();
    });

    act(() => {
      result.current.completedSync({ activitiesSynced: 5, healthDaysSynced: 3 });
    });

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.lastResult).toEqual({ activitiesSynced: 5, healthDaysSynced: 3 });
    expect(result.current.syncVersion).toBe(1);
    expect(result.current.lastCompletedAt).not.toBeNull();
  });

  it('exposes failSync that sets error and clears syncing', () => {
    const { result } = renderHook(() => useSyncState());

    act(() => {
      result.current.startSync();
    });

    act(() => {
      result.current.failSync('Network error');
    });

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.lastError).toBe('Network error');
  });

  it('reflects store changes made externally', () => {
    const { result } = renderHook(() => useSyncState());

    act(() => {
      useSyncStore.getState().startSync();
    });

    expect(result.current.isSyncing).toBe(true);

    act(() => {
      useSyncStore.getState().completedSync({ activitiesSynced: 2, healthDaysSynced: 1 });
    });

    expect(result.current.isSyncing).toBe(false);
    expect(result.current.syncVersion).toBe(1);
  });
});
