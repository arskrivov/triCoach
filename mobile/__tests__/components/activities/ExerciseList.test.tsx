/**
 * Unit tests for ExerciseList component.
 *
 * Tests header display, empty state (returns null), exercise rows
 * with name, sets × reps, and weight (including null weight).
 *
 * **Validates: Requirements 6.11**
 */

import React from "react";
import { render } from "@testing-library/react-native";
import {
  ExerciseList,
  type Exercise,
} from "../../../components/activities/ExerciseList";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("../../../lib/theme", () => ({
  useThemeColors: () => ({
    background: "#ffffff",
    foreground: "#0a0a0a",
    card: "#ffffff",
    cardBorder: "#e5e5e5",
    primary: "#2563eb",
    primaryForeground: "#ffffff",
    muted: "#f5f5f5",
    mutedForeground: "#737373",
    destructive: "#ef4444",
    statusPositive: "#10b981",
    statusNegative: "#ef4444",
    statusCaution: "#f59e0b",
  }),
}));

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => "light",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    name: "Barbell Squat",
    sets: 4,
    reps: 8,
    weight_kg: 100,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExerciseList", () => {
  describe("empty state", () => {
    it("returns null when exercises array is empty", () => {
      const { toJSON } = render(<ExerciseList exercises={[]} />);
      expect(toJSON()).toBeNull();
    });
  });

  describe("header", () => {
    it('displays "Exercises" header', () => {
      const { getByText } = render(
        <ExerciseList exercises={[makeExercise()]} />
      );
      expect(getByText("Exercises")).toBeTruthy();
    });
  });

  describe("column headers", () => {
    it("displays Exercise, Sets × Reps, and Weight column headers", () => {
      const { getByText } = render(
        <ExerciseList exercises={[makeExercise()]} />
      );
      expect(getByText("Exercise")).toBeTruthy();
      expect(getByText("Sets × Reps")).toBeTruthy();
      expect(getByText("Weight")).toBeTruthy();
    });
  });

  describe("exercise name", () => {
    it("displays the exercise name", () => {
      const { getByText } = render(
        <ExerciseList exercises={[makeExercise({ name: "Deadlift" })]} />
      );
      expect(getByText("Deadlift")).toBeTruthy();
    });
  });

  describe("sets and reps", () => {
    it("displays sets × reps format", () => {
      const { getByText } = render(
        <ExerciseList exercises={[makeExercise({ sets: 3, reps: 12 })]} />
      );
      expect(getByText("3 × 12")).toBeTruthy();
    });
  });

  describe("weight", () => {
    it("displays weight in kg when non-null", () => {
      const { getByText } = render(
        <ExerciseList exercises={[makeExercise({ weight_kg: 80 })]} />
      );
      expect(getByText("80 kg")).toBeTruthy();
    });

    it('displays "—" when weight_kg is null', () => {
      const { getByText } = render(
        <ExerciseList exercises={[makeExercise({ weight_kg: null })]} />
      );
      // The "—" should appear in the weight column for this exercise
      expect(getByText("—")).toBeTruthy();
    });
  });

  describe("multiple exercises", () => {
    it("renders all exercises in the list", () => {
      const exercises: Exercise[] = [
        makeExercise({ name: "Squat", sets: 4, reps: 8, weight_kg: 100 }),
        makeExercise({
          name: "Bench Press",
          sets: 3,
          reps: 10,
          weight_kg: 70,
        }),
        makeExercise({
          name: "Pull-ups",
          sets: 3,
          reps: 8,
          weight_kg: null,
        }),
      ];
      const { getByText } = render(<ExerciseList exercises={exercises} />);

      expect(getByText("Squat")).toBeTruthy();
      expect(getByText("4 × 8")).toBeTruthy();
      expect(getByText("100 kg")).toBeTruthy();

      expect(getByText("Bench Press")).toBeTruthy();
      expect(getByText("3 × 10")).toBeTruthy();
      expect(getByText("70 kg")).toBeTruthy();

      expect(getByText("Pull-ups")).toBeTruthy();
      expect(getByText("—")).toBeTruthy();
    });
  });

  describe("accessibility", () => {
    it("provides accessibility labels for exercise rows", () => {
      const exercises: Exercise[] = [
        makeExercise({ name: "Squat", sets: 4, reps: 8, weight_kg: 100 }),
        makeExercise({
          name: "Plank",
          sets: 3,
          reps: 1,
          weight_kg: null,
        }),
      ];
      const { getByLabelText } = render(
        <ExerciseList exercises={exercises} />
      );

      expect(getByLabelText("Squat, 4 × 8, 100 kg")).toBeTruthy();
      expect(getByLabelText("Plank, 3 × 1")).toBeTruthy();
    });
  });
});
