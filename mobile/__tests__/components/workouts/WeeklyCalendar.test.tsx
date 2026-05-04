/**
 * Unit tests for the WeeklyCalendar component.
 *
 * Validates: Requirements 8.4 (weekly calendar with day columns),
 *            Requirements 8.5 (week navigation and week label)
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

import {
  WeeklyCalendar,
  groupWorkoutsByDay,
} from "../../../components/workouts/WeeklyCalendar";
import type { PlanWorkout, WorkoutStatus } from "../../../lib/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/lib/theme", () => ({
  useThemeColors: () => ({
    background: "#ffffff",
    foreground: "#0a0a0a",
    card: "#ffffff",
    cardBorder: "#e5e5e5",
    primary: "#2563eb",
    primaryForeground: "#ffffff",
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
  }),
  useColorSchemeName: () => "light",
  lightColors: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    card: "#ffffff",
    cardBorder: "#e5e5e5",
    primary: "#2563eb",
    primaryForeground: "#ffffff",
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
    card: "#171717",
    cardBorder: "#262626",
    primary: "#3b82f6",
    primaryForeground: "#ffffff",
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorkout(overrides: Partial<PlanWorkout> = {}): PlanWorkout {
  return {
    id: "w-1",
    name: "Easy Run",
    discipline: "RUN",
    scheduled_date: "2024-06-15",
    estimated_duration_seconds: 3600,
    estimated_tss: 45,
    description: "Easy aerobic run",
    plan_week: 3,
    plan_day: 0,
    ...overrides,
  };
}

const defaultProps = {
  currentWeek: 3,
  totalWeeks: 12,
  onWeekChange: jest.fn(),
  onWorkoutPress: jest.fn(),
  getWorkoutStatus: (() => "upcoming") as (w: PlanWorkout) => WorkoutStatus,
};

// ---------------------------------------------------------------------------
// groupWorkoutsByDay (pure function)
// ---------------------------------------------------------------------------

describe("groupWorkoutsByDay", () => {
  it("returns 7 empty arrays for no workouts", () => {
    const result = groupWorkoutsByDay([]);
    expect(result).toHaveLength(7);
    result.forEach((bucket) => expect(bucket).toEqual([]));
  });

  it("places a workout in the correct day bucket", () => {
    const workout = makeWorkout({ plan_day: 2 }); // Wednesday
    const result = groupWorkoutsByDay([workout]);
    expect(result[2]).toEqual([workout]);
    // Other days should be empty
    expect(result[0]).toEqual([]);
    expect(result[1]).toEqual([]);
    expect(result[3]).toEqual([]);
  });

  it("places multiple workouts on the same day", () => {
    const w1 = makeWorkout({ id: "w-1", plan_day: 0 });
    const w2 = makeWorkout({ id: "w-2", plan_day: 0 });
    const result = groupWorkoutsByDay([w1, w2]);
    expect(result[0]).toHaveLength(2);
  });

  it("excludes workouts with null plan_day", () => {
    const workout = makeWorkout({ plan_day: null });
    const result = groupWorkoutsByDay([workout]);
    result.forEach((bucket) => expect(bucket).toEqual([]));
  });

  it("excludes workouts with out-of-range plan_day", () => {
    const w1 = makeWorkout({ plan_day: -1 as any });
    const w2 = makeWorkout({ plan_day: 7 as any });
    const result = groupWorkoutsByDay([w1, w2]);
    result.forEach((bucket) => expect(bucket).toEqual([]));
  });

  it("distributes workouts across multiple days", () => {
    const workouts = [
      makeWorkout({ id: "w-mon", plan_day: 0 }),
      makeWorkout({ id: "w-wed", plan_day: 2 }),
      makeWorkout({ id: "w-fri", plan_day: 4 }),
      makeWorkout({ id: "w-sun", plan_day: 6 }),
    ];
    const result = groupWorkoutsByDay(workouts);
    expect(result[0]).toHaveLength(1);
    expect(result[1]).toHaveLength(0);
    expect(result[2]).toHaveLength(1);
    expect(result[3]).toHaveLength(0);
    expect(result[4]).toHaveLength(1);
    expect(result[5]).toHaveLength(0);
    expect(result[6]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// WeeklyCalendar component
// ---------------------------------------------------------------------------

describe("WeeklyCalendar", () => {
  beforeEach(() => {
    (defaultProps.onWeekChange as jest.Mock).mockClear();
    (defaultProps.onWorkoutPress as jest.Mock).mockClear();
  });

  describe("week label", () => {
    it("displays 'Week X of Y'", () => {
      render(
        <WeeklyCalendar
          {...defaultProps}
          workouts={[]}
          currentWeek={5}
          totalWeeks={16}
        />
      );
      expect(screen.getByText("Week 5 of 16")).toBeTruthy();
    });
  });

  describe("day labels", () => {
    it("displays all 7 day labels", () => {
      render(<WeeklyCalendar {...defaultProps} workouts={[]} />);
      expect(screen.getByText("Mon")).toBeTruthy();
      expect(screen.getByText("Tue")).toBeTruthy();
      expect(screen.getByText("Wed")).toBeTruthy();
      expect(screen.getByText("Thu")).toBeTruthy();
      expect(screen.getByText("Fri")).toBeTruthy();
      expect(screen.getByText("Sat")).toBeTruthy();
      expect(screen.getByText("Sun")).toBeTruthy();
    });
  });

  describe("workout rendering", () => {
    it("renders workout cards in the correct day column", () => {
      const workouts = [
        makeWorkout({ id: "w-1", name: "Monday Run", plan_day: 0 }),
        makeWorkout({ id: "w-2", name: "Wednesday Swim", plan_day: 2, discipline: "SWIM" }),
      ];
      render(<WeeklyCalendar {...defaultProps} workouts={workouts} />);
      expect(screen.getByText("Monday Run")).toBeTruthy();
      expect(screen.getByText("Wednesday Swim")).toBeTruthy();
    });

    it("shows 'Rest' for days with no workouts", () => {
      render(<WeeklyCalendar {...defaultProps} workouts={[]} />);
      // All 7 days should show "Rest"
      const restTexts = screen.getAllByText("Rest");
      expect(restTexts).toHaveLength(7);
    });

    it("shows 'Rest' only for empty days when some days have workouts", () => {
      const workouts = [
        makeWorkout({ id: "w-1", plan_day: 0 }),
        makeWorkout({ id: "w-2", plan_day: 3 }),
      ];
      render(<WeeklyCalendar {...defaultProps} workouts={workouts} />);
      // 5 days without workouts should show "Rest"
      const restTexts = screen.getAllByText("Rest");
      expect(restTexts).toHaveLength(5);
    });
  });

  describe("navigation", () => {
    it("calls onWeekChange with previous week when ← is pressed", () => {
      render(
        <WeeklyCalendar
          {...defaultProps}
          workouts={[]}
          currentWeek={5}
          totalWeeks={12}
        />
      );
      fireEvent.press(screen.getByLabelText("Previous week"));
      expect(defaultProps.onWeekChange).toHaveBeenCalledWith(4);
    });

    it("calls onWeekChange with next week when → is pressed", () => {
      render(
        <WeeklyCalendar
          {...defaultProps}
          workouts={[]}
          currentWeek={5}
          totalWeeks={12}
        />
      );
      fireEvent.press(screen.getByLabelText("Next week"));
      expect(defaultProps.onWeekChange).toHaveBeenCalledWith(6);
    });

    it("disables previous button on week 1", () => {
      render(
        <WeeklyCalendar
          {...defaultProps}
          workouts={[]}
          currentWeek={1}
          totalWeeks={12}
        />
      );
      const prevButton = screen.getByLabelText("Previous week");
      expect(prevButton.props.accessibilityState?.disabled).toBe(true);
    });

    it("disables next button on last week", () => {
      render(
        <WeeklyCalendar
          {...defaultProps}
          workouts={[]}
          currentWeek={12}
          totalWeeks={12}
        />
      );
      const nextButton = screen.getByLabelText("Next week");
      expect(nextButton.props.accessibilityState?.disabled).toBe(true);
    });

    it("calls onWeekChange(1) when Today is pressed", () => {
      render(
        <WeeklyCalendar
          {...defaultProps}
          workouts={[]}
          currentWeek={5}
          totalWeeks={12}
        />
      );
      fireEvent.press(screen.getByLabelText("Go to today"));
      expect(defaultProps.onWeekChange).toHaveBeenCalledWith(1);
    });
  });

  describe("workout interaction", () => {
    it("calls onWorkoutPress when a workout card is tapped", () => {
      const workout = makeWorkout({ id: "w-1", name: "Tempo Run", plan_day: 0 });
      render(
        <WeeklyCalendar {...defaultProps} workouts={[workout]} />
      );
      fireEvent.press(screen.getByText("Tempo Run"));
      expect(defaultProps.onWorkoutPress).toHaveBeenCalledWith(workout);
    });
  });

  describe("workout status", () => {
    it("passes workout status from getWorkoutStatus to WorkoutCard", () => {
      const workout = makeWorkout({ id: "w-1", name: "Completed Run", plan_day: 0 });
      const getWorkoutStatus = () => "completed" as WorkoutStatus;
      render(
        <WeeklyCalendar
          {...defaultProps}
          workouts={[workout]}
          getWorkoutStatus={getWorkoutStatus}
        />
      );
      // Completed status shows a checkmark
      expect(screen.getByText("✓")).toBeTruthy();
    });
  });
});
