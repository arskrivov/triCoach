/**
 * Unit tests for the useRefreshOnSync hook.
 *
 * Validates: Requirements 13.3 (completion refresh — all visible screens refresh their data)
 */

import { renderHook, act } from '@testing-library/react-native';
import { useRefreshOnSync } from '../../hooks/useRefreshOnSync';
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

describe('useRefreshOnSync', () => {
  beforeEach(() => {
    resetStore();
  });

  it('does not call onRefresh on initial render', () => {
    const onRefresh = jest.fn();
    renderHook(() => useRefreshOnSync(onRefresh));

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('calls onRefresh when syncVersion increments', () => {
    const onRefresh = jest.fn();
    renderHook(() => useRefreshOnSync(onRefresh));

    act(() => {
      useSyncStore.getState().startSync();
      useSyncStore.getState().completedSync({ activitiesSynced: 3, healthDaysSynced: 1 });
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('calls onRefresh each time syncVersion increments', () => {
    const onRefresh = jest.fn();
    renderHook(() => useRefreshOnSync(onRefresh));

    // First sync cycle
    act(() => {
      useSyncStore.getState().startSync();
      useSyncStore.getState().completedSync({ activitiesSynced: 1, healthDaysSynced: 0 });
    });

    // Second sync cycle
    act(() => {
      useSyncStore.getState().startSync();
      useSyncStore.getState().completedSync({ activitiesSynced: 2, healthDaysSynced: 1 });
    });

    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('does not call onRefresh when sync fails (syncVersion unchanged)', () => {
    const onRefresh = jest.fn();
    renderHook(() => useRefreshOnSync(onRefresh));

    act(() => {
      useSyncStore.getState().startSync();
      useSyncStore.getState().failSync('Connection timeout');
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does not call onRefresh when syncVersion stays the same', () => {
    const onRefresh = jest.fn();
    renderHook(() => useRefreshOnSync(onRefresh));

    // Manually set state without changing syncVersion
    act(() => {
      useSyncStore.setState({ lastError: 'some error' });
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
