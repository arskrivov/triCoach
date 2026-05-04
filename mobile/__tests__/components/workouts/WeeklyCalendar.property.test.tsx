/**
 * Property-based tests for WeeklyCalendar workout day placement.
 *
 * **Validates: Requirements 8.4**
 *
 * Property 5: Workouts are placed in the correct day column
 *
 * *For any* set of `PlanWorkout` objects with `plan_day` values in the range
 * 0–6, each workout SHALL appear in the day column corresponding to its
 * `plan_day` value in the weekly calendar grid.
 */

import * as fc from "fast-check";
import { groupWorkoutsByDay } from "../../../components/workouts/WeeklyCalendar";
import type { PlanWorkout, Discipline } from "../../../lib/types";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const ALL_DISCIPLINES: Discipline[] = [
  "SWIM",
  "RUN",
  "RIDE_ROAD",
  "RIDE_GRAVEL",
  "STRENGTH",
  "YOGA",
  "MOBILITY",
  "OTHER",
];

/** Arbitrary for a valid Discipline value. */
const arbDiscipline: fc.Arbitrary<Discipline> = fc.constantFrom(
  ...ALL_DISCIPLINES
);

/** Arbitrary for a valid plan_day (0–6). */
const arbPlanDay: fc.Arbitrary<number> = fc.integer({ min: 0, max: 6 });

/** Arbitrary for a valid ISO 8601 date string. */
const arbISODate: fc.Arbitrary<string> = fc
  .integer({
    min: new Date("2020-01-01T00:00:00Z").getTime(),
    max: new Date("2025-12-31T23:59:59Z").getTime(),
  })
  .map((ms) => new Date(ms).toISOString());

/**
 * Build a PlanWorkout with a specific plan_day and a unique id.
 */
function buildPlanWorkout(params: {
  id: string;
  discipline: Discipline;
  plan_day: number;
  scheduled_date: string;
}): PlanWorkout {
  return {
    id: params.id,
    name: `Workout ${params.id}`,
    discipline: params.discipline,
    scheduled_date: params.scheduled_date,
    estimated_duration_seconds: 3600,
    estimated_tss: 50,
    description: null,
    plan_week: 1,
    plan_day: params.plan_day,
  };
}

/**
 * Arbitrary for a single PlanWorkout with a valid plan_day (0–6).
 */
const arbPlanWorkout: fc.Arbitrary<PlanWorkout> = fc
  .tuple(fc.uuid(), arbDiscipline, arbPlanDay, arbISODate)
  .map(([id, discipline, planDay, date]) =>
    buildPlanWorkout({ id, discipline, plan_day: planDay, scheduled_date: date })
  );

/**
 * Arbitrary for a list of PlanWorkouts (0–30 items).
 */
const arbPlanWorkouts: fc.Arbitrary<PlanWorkout[]> = fc.array(arbPlanWorkout, {
  minLength: 0,
  maxLength: 30,
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("WeeklyCalendar - Property Tests", () => {
  /**
   * **Property 5: Workouts are placed in the correct day column**
   *
   * *For any* set of `PlanWorkout` objects with `plan_day` values in the range
   * 0–6, each workout SHALL appear in the day column corresponding to its
   * `plan_day` value in the weekly calendar grid.
   *
   * **Validates: Requirements 8.4**
   */
  describe("Property 5: Workouts are placed in the correct day column", () => {
    it("every workout appears in the bucket matching its plan_day value", () => {
      fc.assert(
        fc.property(arbPlanWorkouts, (workouts) => {
          const buckets = groupWorkoutsByDay(workouts);

          // Result always has exactly 7 buckets (Mon–Sun)
          expect(buckets).toHaveLength(7);

          // Every workout with a valid plan_day appears in the correct bucket
          for (const workout of workouts) {
            if (
              workout.plan_day != null &&
              workout.plan_day >= 0 &&
              workout.plan_day <= 6
            ) {
              const bucket = buckets[workout.plan_day];
              const found = bucket.some((w) => w.id === workout.id);
              expect(found).toBe(true);
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    it("no workout appears in a bucket that does not match its plan_day", () => {
      fc.assert(
        fc.property(arbPlanWorkouts, (workouts) => {
          const buckets = groupWorkoutsByDay(workouts);

          // For each bucket, every workout in it must have plan_day === bucket index
          for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            for (const workout of buckets[dayIndex]) {
              expect(workout.plan_day).toBe(dayIndex);
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    it("total workouts across all buckets equals the count of workouts with valid plan_day", () => {
      fc.assert(
        fc.property(arbPlanWorkouts, (workouts) => {
          const buckets = groupWorkoutsByDay(workouts);

          const totalInBuckets = buckets.reduce(
            (sum, bucket) => sum + bucket.length,
            0
          );
          const validWorkouts = workouts.filter(
            (w) => w.plan_day != null && w.plan_day >= 0 && w.plan_day <= 6
          );

          expect(totalInBuckets).toBe(validWorkouts.length);
        }),
        { numRuns: 100 }
      );
    });

    it("workouts with null plan_day are excluded from all buckets", () => {
      fc.assert(
        fc.property(arbPlanWorkouts, (workouts) => {
          // Override some workouts to have null plan_day
          const mixedWorkouts = workouts.map((w, i) =>
            i % 3 === 0 ? { ...w, plan_day: null } : w
          );

          const buckets = groupWorkoutsByDay(mixedWorkouts);

          // No bucket should contain a workout with null plan_day
          for (const bucket of buckets) {
            for (const workout of bucket) {
              expect(workout.plan_day).not.toBeNull();
            }
          }

          // Null plan_day workouts should not appear anywhere
          const nullIds = new Set(
            mixedWorkouts
              .filter((w) => w.plan_day === null)
              .map((w) => w.id)
          );
          for (const bucket of buckets) {
            for (const workout of bucket) {
              expect(nullIds.has(workout.id)).toBe(false);
            }
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
