/**
 * Property-based tests for the Zustand sync store.
 *
 * **Validates: Requirements 13.5**
 *
 * Property 8: Sync guard prevents concurrent syncs
 */

import * as fc from 'fast-check';
import { useSyncStore, SyncResult } from '../../stores/sync-store';

/**
 * Helper to reset the store to a clean initial state between tests.
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

/**
 * Arbitrary for generating valid SyncResult objects.
 */
const syncResultArb: fc.Arbitrary<SyncResult> = fc.record({
  activitiesSynced: fc.nat({ max: 1000 }),
  healthDaysSynced: fc.nat({ max: 365 }),
});

/**
 * Arbitrary for generating non-empty error message strings.
 */
const errorMessageArb = fc.string({ minLength: 1, maxLength: 300 });

describe('Sync Store - Property Tests', () => {
  beforeEach(() => {
    resetStore();
  });

  /**
   * **Property 8: Sync guard prevents concurrent syncs**
   *
   * *For any* sync state where `isSyncing` is `true`, calling `startSync()` SHALL
   * return `false` and SHALL NOT modify the sync state (no second concurrent sync
   * is started).
   *
   * **Validates: Requirements 13.5**
   */
  describe('Property 8: Sync guard prevents concurrent syncs', () => {
    it('returns false when isSyncing is already true', () => {
      fc.assert(
        fc.property(
          // Generate arbitrary prior state values to ensure the guard works
          // regardless of other state fields
          fc.option(syncResultArb, { nil: null }),
          fc.option(fc.nat(), { nil: null }),
          fc.option(errorMessageArb, { nil: null }),
          fc.nat({ max: 100 }),
          (lastResult, lastCompletedAt, lastError, syncVersion) => {
            // Set up a state where isSyncing is true with arbitrary other fields
            useSyncStore.setState({
              isSyncing: true,
              lastResult,
              lastCompletedAt,
              lastError,
              syncVersion,
            });

            const result = useSyncStore.getState().startSync();

            // startSync SHALL return false when already syncing
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('does not modify state when isSyncing is already true', () => {
      fc.assert(
        fc.property(
          fc.option(syncResultArb, { nil: null }),
          fc.option(fc.nat(), { nil: null }),
          fc.option(errorMessageArb, { nil: null }),
          fc.nat({ max: 100 }),
          (lastResult, lastCompletedAt, lastError, syncVersion) => {
            // Set up a state where isSyncing is true
            const stateBefore = {
              isSyncing: true,
              lastResult,
              lastCompletedAt,
              lastError,
              syncVersion,
            };
            useSyncStore.setState(stateBefore);

            // Capture state snapshot before calling startSync
            const snapshotBefore = { ...useSyncStore.getState() };

            useSyncStore.getState().startSync();

            // State SHALL NOT be modified
            const stateAfter = useSyncStore.getState();
            expect(stateAfter.isSyncing).toBe(snapshotBefore.isSyncing);
            expect(stateAfter.lastResult).toBe(snapshotBefore.lastResult);
            expect(stateAfter.lastCompletedAt).toBe(snapshotBefore.lastCompletedAt);
            expect(stateAfter.lastError).toBe(snapshotBefore.lastError);
            expect(stateAfter.syncVersion).toBe(snapshotBefore.syncVersion);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns true and sets isSyncing when not currently syncing', () => {
      fc.assert(
        fc.property(
          fc.option(syncResultArb, { nil: null }),
          fc.option(fc.nat(), { nil: null }),
          fc.option(errorMessageArb, { nil: null }),
          fc.nat({ max: 100 }),
          (lastResult, lastCompletedAt, lastError, syncVersion) => {
            // Set up a state where isSyncing is false
            useSyncStore.setState({
              isSyncing: false,
              lastResult,
              lastCompletedAt,
              lastError,
              syncVersion,
            });

            const result = useSyncStore.getState().startSync();

            // startSync SHALL return true when not syncing
            expect(result).toBe(true);

            // isSyncing SHALL now be true
            expect(useSyncStore.getState().isSyncing).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('full lifecycle: start → complete → start again succeeds', () => {
      fc.assert(
        fc.property(
          syncResultArb,
          syncResultArb,
          (firstResult, secondResult) => {
            resetStore();

            // First sync starts successfully
            expect(useSyncStore.getState().startSync()).toBe(true);
            expect(useSyncStore.getState().isSyncing).toBe(true);

            // Second sync is blocked
            expect(useSyncStore.getState().startSync()).toBe(false);

            // Complete the first sync
            useSyncStore.getState().completedSync(firstResult);
            expect(useSyncStore.getState().isSyncing).toBe(false);
            expect(useSyncStore.getState().lastResult).toEqual(firstResult);

            // Now a new sync can start
            expect(useSyncStore.getState().startSync()).toBe(true);
            expect(useSyncStore.getState().isSyncing).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('full lifecycle: start → fail → start again succeeds', () => {
      fc.assert(
        fc.property(
          errorMessageArb,
          syncResultArb,
          (errorMsg, result) => {
            resetStore();

            // First sync starts successfully
            expect(useSyncStore.getState().startSync()).toBe(true);
            expect(useSyncStore.getState().isSyncing).toBe(true);

            // Second sync is blocked
            expect(useSyncStore.getState().startSync()).toBe(false);

            // Fail the first sync
            useSyncStore.getState().failSync(errorMsg);
            expect(useSyncStore.getState().isSyncing).toBe(false);
            expect(useSyncStore.getState().lastError).toBe(errorMsg);

            // Now a new sync can start
            expect(useSyncStore.getState().startSync()).toBe(true);
            expect(useSyncStore.getState().isSyncing).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
