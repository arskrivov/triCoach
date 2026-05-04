/**
 * Property-based tests for workout builder duration and volume summaries.
 *
 * **Validates: Requirements 9.8**
 *
 * Property 6: Workout builder duration and volume summaries are correct
 *
 * *For any* set of endurance steps with `duration_min` values, the total
 * estimated duration SHALL equal the sum of all step durations.
 * *For any* set of strength exercises with sets, reps, and weight values,
 * the total volume SHALL equal the sum of `sets × reps × weight` across
 * all exercises.
 */

import * as fc from "fast-check";
import {
  calculateEnduranceDuration,
} from "../../../lib/workout-calculations";
import {
  calculateStrengthVolume,
} from "../../../lib/workout-calculations";
import type {
  EnduranceStep,
  EnduranceStepType,
  TargetType,
} from "../../../lib/workout-types";
import type {
  StrengthBlock,
  StrengthBlockType,
  StrengthExercise,
} from "../../../lib/workout-types";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const STEP_TYPES: EnduranceStepType[] = [
  "warmup",
  "interval",
  "recovery",
  "cooldown",
  "repeat",
];

const TARGET_TYPES: TargetType[] = [
  "hr_zone",
  "pace",
  "power_zone",
  "rpe",
  "open",
];

const BLOCK_TYPES: StrengthBlockType[] = [
  "exercise",
  "superset",
  "circuit",
  "amrap",
  "emom",
];

/** Arbitrary for a valid EnduranceStep with non-negative duration. */
const arbEnduranceStep: fc.Arbitrary<EnduranceStep> = fc
  .tuple(
    fc.uuid(),
    fc.constantFrom(...STEP_TYPES),
    fc.integer({ min: 0, max: 300 }),
    fc.constantFrom(...TARGET_TYPES),
    fc.string({ minLength: 0, maxLength: 20 })
  )
  .map(([id, type, duration_min, target_type, target_value]) => ({
    id,
    type,
    duration_min,
    target_type,
    target_value,
  }));

/** Arbitrary for a list of endurance steps (0–20 items). */
const arbEnduranceSteps: fc.Arbitrary<EnduranceStep[]> = fc.array(
  arbEnduranceStep,
  { minLength: 0, maxLength: 20 }
);

/** Arbitrary for a valid StrengthExercise with non-negative numeric fields. */
const arbStrengthExercise: fc.Arbitrary<StrengthExercise> = fc
  .tuple(
    fc.uuid(),
    fc.string({ minLength: 1, maxLength: 30 }),
    fc.integer({ min: 0, max: 20 }),
    fc.integer({ min: 0, max: 50 }),
    fc.integer({ min: 0, max: 500 }),
    fc.option(fc.integer({ min: 1, max: 10 }), { nil: null }),
    fc.integer({ min: 0, max: 300 })
  )
  .map(([id, name, sets, reps, weight_kg, rpe, rest_seconds]) => ({
    id,
    name,
    sets,
    reps,
    weight_kg,
    rpe,
    rest_seconds,
  }));

/** Arbitrary for a StrengthBlock with 1–5 exercises. */
const arbStrengthBlock: fc.Arbitrary<StrengthBlock> = fc
  .tuple(
    fc.uuid(),
    fc.constantFrom(...BLOCK_TYPES),
    fc.array(arbStrengthExercise, { minLength: 1, maxLength: 5 })
  )
  .map(([id, type, exercises]) => ({ id, type, exercises }));

/** Arbitrary for a list of strength blocks (0–10 items). */
const arbStrengthBlocks: fc.Arbitrary<StrengthBlock[]> = fc.array(
  arbStrengthBlock,
  { minLength: 0, maxLength: 10 }
);

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("WorkoutBuilder - Property Tests", () => {
  /**
   * **Property 6: Workout builder duration and volume summaries are correct**
   *
   * **Validates: Requirements 9.8**
   */
  describe("Property 6: Workout builder duration and volume summaries are correct", () => {
    // --- Endurance duration ---

    it("total endurance duration equals sum of all step duration_min values", () => {
      fc.assert(
        fc.property(arbEnduranceSteps, (steps) => {
          const result = calculateEnduranceDuration(steps);
          const expected = steps.reduce((sum, s) => sum + s.duration_min, 0);
          expect(result).toBe(expected);
        }),
        { numRuns: 100 }
      );
    });

    it("endurance duration is 0 for an empty step list", () => {
      expect(calculateEnduranceDuration([])).toBe(0);
    });

    it("endurance duration is non-negative for any valid steps", () => {
      fc.assert(
        fc.property(arbEnduranceSteps, (steps) => {
          const result = calculateEnduranceDuration(steps);
          expect(result).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 100 }
      );
    });

    it("adding a step increases or maintains the total endurance duration", () => {
      fc.assert(
        fc.property(arbEnduranceSteps, arbEnduranceStep, (steps, newStep) => {
          const before = calculateEnduranceDuration(steps);
          const after = calculateEnduranceDuration([...steps, newStep]);
          expect(after).toBe(before + newStep.duration_min);
        }),
        { numRuns: 100 }
      );
    });

    // --- Strength volume ---

    it("total strength volume equals sum of sets × reps × weight across all exercises", () => {
      fc.assert(
        fc.property(arbStrengthBlocks, (blocks) => {
          const result = calculateStrengthVolume(blocks);
          const expected = blocks.reduce(
            (total, block) =>
              total +
              block.exercises.reduce(
                (blockTotal, ex) =>
                  blockTotal + ex.sets * ex.reps * ex.weight_kg,
                0
              ),
            0
          );
          expect(result).toBe(expected);
        }),
        { numRuns: 100 }
      );
    });

    it("strength volume is 0 for an empty block list", () => {
      expect(calculateStrengthVolume([])).toBe(0);
    });

    it("strength volume is non-negative for any valid blocks", () => {
      fc.assert(
        fc.property(arbStrengthBlocks, (blocks) => {
          const result = calculateStrengthVolume(blocks);
          expect(result).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 100 }
      );
    });

    it("adding a block increases or maintains the total strength volume", () => {
      fc.assert(
        fc.property(arbStrengthBlocks, arbStrengthBlock, (blocks, newBlock) => {
          const before = calculateStrengthVolume(blocks);
          const after = calculateStrengthVolume([...blocks, newBlock]);
          const newBlockVolume = newBlock.exercises.reduce(
            (sum, ex) => sum + ex.sets * ex.reps * ex.weight_kg,
            0
          );
          expect(after).toBe(before + newBlockVolume);
        }),
        { numRuns: 100 }
      );
    });
  });
});
