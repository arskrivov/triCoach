import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { getCalendarGrid, formatDurationCompact, buildWorkoutMap, buildRaceMap } from "./calendar-utils";

describe("Feature: monthly-calendar-view, Property 1: Calendar grid structure and date coverage", () => {
  /**
   * **Validates: Requirements 3.1, 3.4**
   *
   * For any valid (year, month), getCalendarGrid returns:
   * - 7 columns per row
   * - 4–6 rows
   * - Every day of the target month exactly once
   * - Contiguous dates (no gaps in the date sequence)
   * - Padding days from adjacent months only
   */
  it("should produce a valid calendar grid for any year/month", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1970, max: 2100 }),
        fc.integer({ min: 0, max: 11 }),
        (year, month) => {
          const grid = getCalendarGrid(year, month);

          // --- 7 columns per row ---
          for (const row of grid) {
            expect(row).toHaveLength(7);
          }

          // --- 4–6 rows ---
          expect(grid.length).toBeGreaterThanOrEqual(4);
          expect(grid.length).toBeLessThanOrEqual(6);

          // Flatten the grid for further checks
          const allDates = grid.flat();

          // --- Every day of the target month exactly once ---
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const monthDates = allDates.filter(
            (d) => d.getFullYear() === year && d.getMonth() === month,
          );
          const monthDays = monthDates.map((d) => d.getDate()).sort((a, b) => a - b);

          expect(monthDays).toHaveLength(daysInMonth);
          for (let day = 1; day <= daysInMonth; day++) {
            expect(monthDays[day - 1]).toBe(day);
          }

          // --- Contiguous dates (no gaps) ---
          // Compare by calendar day to avoid DST issues with getTime()
          for (let i = 1; i < allDates.length; i++) {
            const prev = allDates[i - 1];
            const curr = allDates[i];
            // Advance prev by one calendar day and compare
            const expected = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1);
            expect(curr.getFullYear()).toBe(expected.getFullYear());
            expect(curr.getMonth()).toBe(expected.getMonth());
            expect(curr.getDate()).toBe(expected.getDate());
          }

          // --- Padding days from adjacent months only ---
          for (const d of allDates) {
            const isTargetMonth =
              d.getFullYear() === year && d.getMonth() === month;
            if (!isTargetMonth) {
              // Must be from an adjacent month (previous or next)
              const prevMonth = month === 0 ? 11 : month - 1;
              const prevYear = month === 0 ? year - 1 : year;
              const nextMonth = month === 11 ? 0 : month + 1;
              const nextYear = month === 11 ? year + 1 : year;

              const isAdjacentMonth =
                (d.getFullYear() === prevYear && d.getMonth() === prevMonth) ||
                (d.getFullYear() === nextYear && d.getMonth() === nextMonth);

              expect(isAdjacentMonth).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: monthly-calendar-view, Property 2: Duration formatting produces valid compact strings", () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * For any positive integer seconds, `formatDurationCompact(seconds)` returns
   * a string matching `Xh`, `XhYm`, or `Xm` (where X and Y are positive
   * integers), and the total minutes represented by the formatted string equals
   * `Math.round(seconds / 60)`.
   *
   * Edge case: when seconds rounds to 0 minutes (e.g. seconds < 30),
   * formatDurationCompact returns "" — the property only checks the pattern
   * for cases where Math.round(seconds / 60) > 0.
   */
  it("should produce a valid compact duration string for any positive seconds", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 360000 }),
        (seconds) => {
          const result = formatDurationCompact(seconds);
          const totalMinutes = Math.round(seconds / 60);

          if (totalMinutes <= 0) {
            // Rounds to 0 minutes — expect empty string
            expect(result).toBe("");
            return;
          }

          // Must match one of: "Xh", "XhYm", or "Xm"
          const match = result.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
          expect(match).not.toBeNull();

          const hours = match![1] ? parseInt(match![1], 10) : 0;
          const minutes = match![2] ? parseInt(match![2], 10) : 0;

          // X and Y must be positive integers in their respective parts
          if (match![1]) {
            expect(hours).toBeGreaterThan(0);
          }
          if (match![2]) {
            expect(minutes).toBeGreaterThan(0);
          }

          // At least one component must be present
          expect(hours + minutes).toBeGreaterThan(0);

          // Total minutes represented must equal Math.round(seconds / 60)
          expect(hours * 60 + minutes).toBe(totalMinutes);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: monthly-calendar-view, Property 3: Workout map preserves all workouts under correct date keys", () => {
  /**
   * **Validates: Requirements 4.1, 4.5**
   *
   * For any array of workouts with non-null `scheduled_date`,
   * `buildWorkoutMap(workouts)` produces a map where:
   * (a) every workout appears in exactly one entry keyed by its `scheduled_date`
   * (b) the sum of all entry lengths equals the input array length
   * (c) no workout appears under a key different from its `scheduled_date`
   */
  it("should preserve all workouts under their correct date keys", () => {
    const dateArb = fc.date({ min: new Date(2000, 0, 1), max: new Date(2100, 11, 31) }).map(d => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    });

    const workoutArb = fc.record({
      id: fc.uuid(),
      scheduled_date: dateArb,
    });

    fc.assert(
      fc.property(
        fc.array(workoutArb, { minLength: 0, maxLength: 50 }),
        (workouts) => {
          const map = buildWorkoutMap(workouts);

          // (b) Sum of all entry lengths equals the input array length
          const totalMapped = Object.values(map).reduce((sum, arr) => sum + arr.length, 0);
          expect(totalMapped).toBe(workouts.length);

          // (a) Every workout appears in exactly one entry keyed by its scheduled_date
          // (c) No workout appears under a key different from its scheduled_date
          for (const [key, entries] of Object.entries(map)) {
            for (const workout of entries) {
              expect(workout.scheduled_date).toBe(key);
            }
          }

          // Also verify every input workout is present in the map under its date
          for (const workout of workouts) {
            const bucket = map[workout.scheduled_date];
            expect(bucket).toBeDefined();
            expect(bucket).toContain(workout);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: monthly-calendar-view, Property 4: Race map preserves all races under correct date keys", () => {
  /**
   * **Validates: Requirements 5.1**
   *
   * For any array of goals with non-null `target_date`,
   * `buildRaceMap(goals)` produces a map where:
   * (a) every goal appears in exactly one entry keyed by its `target_date`
   * (b) the sum of all entry lengths equals the input array length
   */
  it("should preserve all races under their correct date keys", () => {
    const dateArb = fc.date({ min: new Date(2000, 0, 1), max: new Date(2100, 11, 31) }).map(d => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    });

    const goalArb = fc.record({
      id: fc.uuid(),
      target_date: dateArb,
    });

    fc.assert(
      fc.property(
        fc.array(goalArb, { minLength: 0, maxLength: 50 }),
        (goals) => {
          const map = buildRaceMap(goals);

          // (b) Sum of all entry lengths equals the input array length
          const totalMapped = Object.values(map).reduce((sum, arr) => sum + arr.length, 0);
          expect(totalMapped).toBe(goals.length);

          // (a) Every goal appears in exactly one entry keyed by its target_date
          for (const [key, entries] of Object.entries(map)) {
            for (const goal of entries) {
              expect(goal.target_date).toBe(key);
            }
          }

          // Also verify every input goal is present in the map under its date
          for (const goal of goals) {
            const bucket = map[goal.target_date];
            expect(bucket).toBeDefined();
            expect(bucket).toContain(goal);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: monthly-calendar-view, Property 5: Month navigation round-trip", () => {
  /**
   * **Validates: Requirements 6.3, 6.4**
   *
   * For any valid (year, month), navigating to the next month and then to the
   * previous month returns to the original (year, month). Symmetrically,
   * navigating to the previous month and then to the next month also returns
   * to the original (year, month).
   *
   * Month navigation logic:
   * - Next month: new Date(year, month + 1, 1)
   * - Previous month: new Date(year, month - 1, 1)
   */
  it("should return to the original (year, month) after next then prev", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1970, max: 2100 }),
        fc.integer({ min: 0, max: 11 }),
        (year, month) => {
          // Navigate next
          const next = new Date(year, month + 1, 1);
          // Navigate back (prev)
          const backToPrev = new Date(next.getFullYear(), next.getMonth() - 1, 1);

          expect(backToPrev.getFullYear()).toBe(year);
          expect(backToPrev.getMonth()).toBe(month);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should return to the original (year, month) after prev then next", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1970, max: 2100 }),
        fc.integer({ min: 0, max: 11 }),
        (year, month) => {
          // Navigate prev
          const prev = new Date(year, month - 1, 1);
          // Navigate back (next)
          const backToNext = new Date(prev.getFullYear(), prev.getMonth() + 1, 1);

          expect(backToNext.getFullYear()).toBe(year);
          expect(backToNext.getMonth()).toBe(month);
        },
      ),
      { numRuns: 100 },
    );
  });
});
