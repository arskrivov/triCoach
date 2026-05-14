/**
 * Unit tests for the TrainingCalendar component.
 *
 * Validates: auto-select today on mount, clear shows all month, description shown.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

import { TrainingCalendar } from "../../../components/workouts/TrainingCalendar";
import type { PlanWorkout, WorkoutStatus } from "../../../lib/types";

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
    statusCaution: "#f59e0b",
    statusPositive: "#10b981",
    statusNegative: "#ef4444",
  }),
  useColorSchemeName: () => "light",
}));

jest.mock("@/lib/format", () => ({
  getDisciplineMeta: () => ({ icon: "🏃", label: "Run", color: "#10b981" }),
  formatDuration: (s: number | null) => (s ? `${Math.round((s || 0) / 60)}min` : "0min"),
}));

jest.mock("react-native-calendars", () => ({
  Calendar: ({ markedDates, onDayPress }: any) => {
    const { View, Text, Pressable } = require("react-native");
    const selectedDates = Object.entries(markedDates || {})
      .filter(([_, v]: [string, any]) => v?.selected)
      .map(([k]) => k);
    return (
      <View testID="calendar">
        {selectedDates.map((d: string) => (
          <Text key={d} testID={`selected-${d}`}>{d}</Text>
        ))}
        <Pressable testID="tap-other-day" onPress={() => onDayPress?.({ dateString: "2099-01-01" })} />
      </View>
    );
  },
}));

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function makeWorkout(overrides: Partial<PlanWorkout> = {}): PlanWorkout {
  return {
    id: "w-1",
    name: "Easy Run",
    discipline: "RUN",
    scheduled_date: todayStr(),
    estimated_duration_seconds: 2400,
    estimated_tss: 40,
    description: "Zone 2 easy jog",
    plan_week: 1,
    plan_day: 0,
    completed_by_activity_id: null,
    completed_by_activity_name: null,
    completed_by_activity_start_time: null,
    ...overrides,
  } as PlanWorkout;
}

describe("TrainingCalendar", () => {
  const getStatus = (): WorkoutStatus => "today";
  const onPress = jest.fn();

  it("auto-selects today on mount", () => {
    const today = todayStr();
    render(
      <TrainingCalendar
        workouts={[makeWorkout()]}
        getWorkoutStatus={getStatus}
        onWorkoutPress={onPress}
      />
    );

    expect(screen.getByTestID(`selected-${today}`)).toBeTruthy();
    expect(screen.getByText(/Today:/)).toBeTruthy();
  });

  it("shows Show all button when date is selected", () => {
    render(
      <TrainingCalendar
        workouts={[makeWorkout()]}
        getWorkoutStatus={getStatus}
        onWorkoutPress={onPress}
      />
    );

    expect(screen.getByText("Show all")).toBeTruthy();
  });

  it("clears selection on Show all press", () => {
    render(
      <TrainingCalendar
        workouts={[makeWorkout()]}
        getWorkoutStatus={getStatus}
        onWorkoutPress={onPress}
      />
    );

    fireEvent.press(screen.getByText("Show all"));
    expect(screen.getByText("All workouts this month")).toBeTruthy();
  });

  it("shows workout description in row", () => {
    render(
      <TrainingCalendar
        workouts={[makeWorkout({ description: "Zone 2 easy jog" })]}
        getWorkoutStatus={getStatus}
        onWorkoutPress={onPress}
      />
    );

    expect(screen.getByText("Zone 2 easy jog")).toBeTruthy();
  });
});
