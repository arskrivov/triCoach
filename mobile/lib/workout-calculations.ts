/**
 * Pure calculation functions for workout builder summaries.
 *
 * Extracted into a standalone module so they can be imported without
 * pulling in React Native components or API client dependencies.
 * Used by EnduranceBuilder, StrengthBuilder, YogaBuilder, and property tests.
 *
 * @see Requirements 9.8
 */

import type {
  EnduranceStep,
  StrengthBlock,
  YogaPose,
} from "./workout-types";

/**
 * Calculate total estimated duration in minutes from a list of endurance steps.
 * Sums the `duration_min` of every step. Returns 0 for an empty list.
 */
export function calculateEnduranceDuration(steps: EnduranceStep[]): number {
  return steps.reduce((sum, step) => sum + step.duration_min, 0);
}

/**
 * Calculate total estimated volume in kg from a list of strength blocks.
 * Volume = sum of (sets × reps × weight_kg) across all exercises in all blocks.
 * Returns 0 for an empty list.
 */
export function calculateStrengthVolume(blocks: StrengthBlock[]): number {
  return blocks.reduce(
    (total, block) =>
      total +
      block.exercises.reduce(
        (blockTotal, ex) => blockTotal + ex.sets * ex.reps * ex.weight_kg,
        0
      ),
    0
  );
}

/**
 * Calculate total estimated sets from a list of strength blocks.
 */
export function calculateStrengthSets(blocks: StrengthBlock[]): number {
  return blocks.reduce(
    (total, block) =>
      total + block.exercises.reduce((s, ex) => s + ex.sets, 0),
    0
  );
}

/**
 * Calculate total estimated duration in minutes from a list of yoga poses.
 * Sums the `duration_seconds` of every pose and converts to minutes.
 * Returns 0 for an empty list.
 */
export function calculateYogaDuration(poses: YogaPose[]): number {
  const totalSeconds = poses.reduce(
    (sum, pose) => sum + pose.duration_seconds,
    0
  );
  return Math.round(totalSeconds / 60);
}
