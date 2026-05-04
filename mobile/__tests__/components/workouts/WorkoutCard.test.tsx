/**
 * Unit tests for the WorkoutCard component.
 *
 * Validates: Requirements 8.4 (tappable workout card with status-based styling)
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

import {
  WorkoutCard,
  getStatusStyle,
} from "../../../components/workouts/WorkoutCard";
import { lightColors } from "../../../lib/theme";
import type { PlanWorkout, WorkoutStatus } from "../../../lib/types";

// Mock the theme hooks to return light colours
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

/**
 * Helper to create a PlanWorkout for testing.
 */
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
    plan_day: 1,
    ...overrides,
  };
}

describe("WorkoutCard", () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    mockOnPress.mockClear();
  });

  describe("rendering", () => {
    it("displays the workout name", () => {
      render(
        <WorkoutCard
          workout={makeWorkout({ name: "Tempo Run" })}
          status="upcoming"
          onPress={mockOnPress}
        />
      );
      expect(screen.getByText("Tempo Run")).toBeTruthy();
    });

    it("displays 'Untitled Workout' when name is empty", () => {
      render(
        <WorkoutCard
          workout={makeWorkout({ name: "" })}
          status="upcoming"
          onPress={mockOnPress}
        />
      );
      expect(screen.getByText("Untitled Workout")).toBeTruthy();
    });

    it("displays the discipline emoji icon", () => {
      render(
        <WorkoutCard
          workout={makeWorkout({ discipline: "RUN" })}
          status="upcoming"
          onPress={mockOnPress}
        />
      );
      expect(screen.getByText("🏃")).toBeTruthy();
    });

    it("displays formatted duration", () => {
      render(
        <WorkoutCard
          workout={makeWorkout({ estimated_duration_seconds: 3600 })}
          status="upcoming"
          onPress={mockOnPress}
        />
      );
      expect(screen.getByText("1h 0m")).toBeTruthy();
    });

    it("displays TSS when available", () => {
      render(
        <WorkoutCard
          workout={makeWorkout({ estimated_tss: 75 })}
          status="upcoming"
          onPress={mockOnPress}
        />
      );
      expect(screen.getByText("75 TSS")).toBeTruthy();
    });

    it("does not display TSS when null", () => {
      render(
        <WorkoutCard
          workout={makeWorkout({ estimated_tss: null })}
          status="upcoming"
          onPress={mockOnPress}
        />
      );
      expect(screen.queryByText(/TSS/)).toBeNull();
    });

    it("displays dash for null duration", () => {
      render(
        <WorkoutCard
          workout={makeWorkout({ estimated_duration_seconds: null })}
          status="upcoming"
          onPress={mockOnPress}
        />
      );
      expect(screen.getByText("—")).toBeTruthy();
    });
  });

  describe("status indicators", () => {
    it("shows checkmark for completed status", () => {
      render(
        <WorkoutCard
          workout={makeWorkout()}
          status="completed"
          onPress={mockOnPress}
        />
      );
      expect(screen.getByText("✓")).toBeTruthy();
    });

    it("shows 'Today' badge for today status", () => {
      render(
        <WorkoutCard
          workout={makeWorkout()}
          status="today"
          onPress={mockOnPress}
        />
      );
      expect(screen.getByText("Today")).toBeTruthy();
    });

    it("shows 'Skipped' text for skipped status", () => {
      render(
        <WorkoutCard
          workout={makeWorkout()}
          status="skipped"
          onPress={mockOnPress}
        />
      );
      expect(screen.getByText("Skipped")).toBeTruthy();
    });

    it("shows no status indicator for upcoming", () => {
      render(
        <WorkoutCard
          workout={makeWorkout()}
          status="upcoming"
          onPress={mockOnPress}
        />
      );
      expect(screen.queryByText("✓")).toBeNull();
      expect(screen.queryByText("Today")).toBeNull();
      expect(screen.queryByText("Skipped")).toBeNull();
    });
  });

  describe("interaction", () => {
    it("calls onPress when tapped", () => {
      render(
        <WorkoutCard
          workout={makeWorkout()}
          status="upcoming"
          onPress={mockOnPress}
        />
      );
      fireEvent.press(screen.getByRole("button"));
      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });

    it("has accessible role and label", () => {
      render(
        <WorkoutCard
          workout={makeWorkout({ name: "Hill Repeats", discipline: "RUN" })}
          status="completed"
          onPress={mockOnPress}
        />
      );
      const button = screen.getByRole("button");
      expect(button.props.accessibilityLabel).toContain("Hill Repeats");
      expect(button.props.accessibilityLabel).toContain("completed");
    });
  });

  describe("disciplines", () => {
    it("renders swim icon for SWIM discipline", () => {
      render(
        <WorkoutCard
          workout={makeWorkout({ discipline: "SWIM" })}
          status="upcoming"
          onPress={mockOnPress}
        />
      );
      expect(screen.getByText("🏊")).toBeTruthy();
    });

    it("renders strength icon for STRENGTH discipline", () => {
      render(
        <WorkoutCard
          workout={makeWorkout({ discipline: "STRENGTH" })}
          status="upcoming"
          onPress={mockOnPress}
        />
      );
      expect(screen.getByText("🏋️")).toBeTruthy();
    });
  });
});

describe("getStatusStyle", () => {
  const colors = lightColors;

  it("returns green border for completed", () => {
    const style = getStatusStyle("completed", colors);
    expect(style.borderColor).toBe(colors.statusPositive);
    expect(style.indicatorText).toBe("✓");
    expect(style.showTodayBadge).toBe(false);
  });

  it("returns primary border for today", () => {
    const style = getStatusStyle("today", colors);
    expect(style.borderColor).toBe(colors.primary);
    expect(style.showTodayBadge).toBe(true);
    expect(style.indicatorText).toBeNull();
  });

  it("returns amber border for skipped", () => {
    const style = getStatusStyle("skipped", colors);
    expect(style.borderColor).toBe(colors.statusCaution);
    expect(style.indicatorText).toBe("Skipped");
    expect(style.showTodayBadge).toBe(false);
  });

  it("returns default border for upcoming", () => {
    const style = getStatusStyle("upcoming", colors);
    expect(style.borderColor).toBe(colors.cardBorder);
    expect(style.indicatorText).toBeNull();
    expect(style.showTodayBadge).toBe(false);
  });
});
