/**
 * Unit tests for UpcomingWorkouts component.
 *
 * Tests empty state, workout row rendering with discipline icon, name,
 * formatted date, formatted duration, and TSS display.
 *
 * **Validates: Requirements 5.12**
 */

import React from "react";
import { render } from "@testing-library/react-native";
import { UpcomingWorkouts } from "../../../components/dashboard/UpcomingWorkouts";
import type { PlannedWorkout } from "../../../lib/types";

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
    disciplineRun: "#f97316",
    disciplineSwim: "#3b82f6",
    disciplineRideRoad: "#8b5cf6",
    disciplineRideGravel: "#f59e0b",
    disciplineStrength: "#f43f5e",
    disciplineYoga: "#14b8a6",
    disciplineMobility: "#06b6d4",
    disciplineOther: "#71717a",
  }),
  lightColors: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    muted: "#f5f5f5",
    mutedForeground: "#737373",
    statusPositive: "#10b981",
    statusNegative: "#ef4444",
    statusCaution: "#f59e0b",
    disciplineRun: "#f97316",
    disciplineSwim: "#3b82f6",
    disciplineRideRoad: "#8b5cf6",
    disciplineRideGravel: "#f59e0b",
    disciplineStrength: "#f43f5e",
    disciplineYoga: "#14b8a6",
    disciplineMobility: "#06b6d4",
    disciplineOther: "#71717a",
  },
  darkColors: {
    background: "#0a0a0a",
    foreground: "#fafafa",
    muted: "#262626",
    mutedForeground: "#a3a3a3",
    statusPositive: "#34d399",
    statusNegative: "#f87171",
    statusCaution: "#fbbf24",
    disciplineRun: "#fb923c",
    disciplineSwim: "#60a5fa",
    disciplineRideRoad: "#a78bfa",
    disciplineRideGravel: "#fbbf24",
    disciplineStrength: "#fb7185",
    disciplineYoga: "#2dd4bf",
    disciplineMobility: "#22d3ee",
    disciplineOther: "#a1a1aa",
  },
}));

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => "light",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorkout(overrides: Partial<PlannedWorkout> = {}): PlannedWorkout {
  return {
    id: "w-1",
    name: "Easy Run",
    discipline: "RUN",
    scheduled_date: "2024-06-15T00:00:00Z",
    estimated_duration_seconds: 3600,
    estimated_tss: 55,
    description: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UpcomingWorkouts", () => {
  describe("header", () => {
    it("displays Upcoming Workouts header", () => {
      const { getByText } = render(<UpcomingWorkouts workouts={[]} />);
      expect(getByText("Upcoming Workouts")).toBeTruthy();
    });
  });

  describe("empty state", () => {
    it("shows empty message when no workouts are provided", () => {
      const { getByText } = render(<UpcomingWorkouts workouts={[]} />);
      expect(getByText("No upcoming workouts scheduled.")).toBeTruthy();
    });
  });

  describe("workout rows", () => {
    it("displays discipline emoji icon for a run workout", () => {
      const { getByText } = render(
        <UpcomingWorkouts workouts={[makeWorkout()]} />
      );
      expect(getByText("🏃")).toBeTruthy();
    });

    it("displays workout name", () => {
      const { getByText } = render(
        <UpcomingWorkouts workouts={[makeWorkout({ name: "Tempo Run" })]} />
      );
      expect(getByText("Tempo Run")).toBeTruthy();
    });

    it("displays formatted date", () => {
      const { getByText } = render(
        <UpcomingWorkouts
          workouts={[makeWorkout({ scheduled_date: "2024-06-15T00:00:00Z" })]}
        />
      );
      expect(getByText("15 Jun 2024")).toBeTruthy();
    });

    it("displays formatted duration", () => {
      const { getByText } = render(
        <UpcomingWorkouts
          workouts={[makeWorkout({ estimated_duration_seconds: 3600 })]}
        />
      );
      expect(getByText("1h 0m")).toBeTruthy();
    });

    it("displays TSS value", () => {
      const { getByText } = render(
        <UpcomingWorkouts
          workouts={[makeWorkout({ estimated_tss: 55 })]}
        />
      );
      expect(getByText("55 TSS")).toBeTruthy();
    });

    it("displays — for null duration", () => {
      const { getByText } = render(
        <UpcomingWorkouts
          workouts={[makeWorkout({ estimated_duration_seconds: null })]}
        />
      );
      expect(getByText("—")).toBeTruthy();
    });

    it("does not display TSS when estimated_tss is null", () => {
      const { queryByText } = render(
        <UpcomingWorkouts
          workouts={[makeWorkout({ estimated_tss: null })]}
        />
      );
      expect(queryByText(/TSS/)).toBeNull();
    });

    it("displays swim discipline icon for a swim workout", () => {
      const { getByText } = render(
        <UpcomingWorkouts
          workouts={[makeWorkout({ discipline: "SWIM" })]}
        />
      );
      expect(getByText("🏊")).toBeTruthy();
    });

    it("renders multiple workouts", () => {
      const workouts = [
        makeWorkout({ id: "w-1", name: "Easy Run", discipline: "RUN" }),
        makeWorkout({ id: "w-2", name: "Pool Session", discipline: "SWIM" }),
        makeWorkout({ id: "w-3", name: "Strength", discipline: "STRENGTH" }),
      ];
      const { getByText } = render(
        <UpcomingWorkouts workouts={workouts} />
      );
      expect(getByText("Easy Run")).toBeTruthy();
      expect(getByText("Pool Session")).toBeTruthy();
      expect(getByText("Strength")).toBeTruthy();
    });
  });
});
