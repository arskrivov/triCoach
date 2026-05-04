/**
 * Type definitions for workout builder data structures.
 *
 * Shared between builder components and pure calculation functions
 * to avoid circular dependencies with React Native / API modules.
 */

// ---------------------------------------------------------------------------
// Endurance
// ---------------------------------------------------------------------------

export type EnduranceStepType =
  | "warmup"
  | "interval"
  | "recovery"
  | "cooldown"
  | "repeat";

export type TargetType = "hr_zone" | "pace" | "power_zone" | "rpe" | "open";

export interface EnduranceStep {
  id: string;
  type: EnduranceStepType;
  duration_min: number;
  target_type: TargetType;
  target_value: string;
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

export type StrengthBlockType =
  | "exercise"
  | "superset"
  | "circuit"
  | "amrap"
  | "emom";

export interface StrengthExercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  weight_kg: number;
  rpe: number | null;
  rest_seconds: number;
}

export interface StrengthBlock {
  id: string;
  type: StrengthBlockType;
  exercises: StrengthExercise[];
}

// ---------------------------------------------------------------------------
// Yoga
// ---------------------------------------------------------------------------

export type PoseSide = "left" | "right" | "both" | "none";

export interface YogaPose {
  id: string;
  name: string;
  duration_seconds: number;
  side: PoseSide;
  notes: string;
}
