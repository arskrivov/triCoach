/**
 * Unit tests for ActivityListItem component.
 *
 * Tests discipline icon, activity name (including null fallback),
 * formatted date, duration, distance, average HR, and tap behaviour.
 *
 * **Validates: Requirements 6.2**
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ActivityListItem } from "../../../components/activities/ActivityListItem";
import type { ActivitySummary } from "../../../lib/types";

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

function makeActivity(
  overrides: Partial<ActivitySummary> = {}
): ActivitySummary {
  return {
    id: "act-1",
    garmin_activity_id: 12345,
    discipline: "RUN",
    name: "Morning Run",
    start_time: "2024-06-15T07:30:00Z",
    duration_seconds: 3661,
    calories: 450,
    distance_meters: 10500,
    elevation_gain_meters: 120,
    avg_hr: 152,
    avg_pace_sec_per_km: 330,
    avg_power_watts: null,
    tss: 75,
    total_sets: null,
    total_volume_kg: null,
    session_type: null,
    aerobic_training_effect: 3.5,
    anaerobic_training_effect: 1.2,
    training_effect_label: "Improving",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ActivityListItem", () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    mockOnPress.mockClear();
  });

  describe("discipline icon", () => {
    it("displays run emoji for RUN discipline", () => {
      const { getByText } = render(
        <ActivityListItem activity={makeActivity()} onPress={mockOnPress} />
      );
      expect(getByText("🏃")).toBeTruthy();
    });

    it("displays swim emoji for SWIM discipline", () => {
      const { getByText } = render(
        <ActivityListItem
          activity={makeActivity({ discipline: "SWIM" })}
          onPress={mockOnPress}
        />
      );
      expect(getByText("🏊")).toBeTruthy();
    });

    it("displays strength emoji for STRENGTH discipline", () => {
      const { getByText } = render(
        <ActivityListItem
          activity={makeActivity({ discipline: "STRENGTH" })}
          onPress={mockOnPress}
        />
      );
      expect(getByText("🏋️")).toBeTruthy();
    });
  });

  describe("activity name", () => {
    it("displays the activity name when provided", () => {
      const { getByText } = render(
        <ActivityListItem
          activity={makeActivity({ name: "Tempo Run" })}
          onPress={mockOnPress}
        />
      );
      expect(getByText("Tempo Run")).toBeTruthy();
    });

    it('displays "Untitled Activity" when name is null', () => {
      const { getByText } = render(
        <ActivityListItem
          activity={makeActivity({ name: null })}
          onPress={mockOnPress}
        />
      );
      expect(getByText("Untitled Activity")).toBeTruthy();
    });
  });

  describe("formatted date", () => {
    it("displays the formatted date", () => {
      const { getByText } = render(
        <ActivityListItem
          activity={makeActivity({ start_time: "2024-06-15T07:30:00Z" })}
          onPress={mockOnPress}
        />
      );
      expect(getByText("15 Jun 2024")).toBeTruthy();
    });
  });

  describe("duration", () => {
    it("displays formatted duration", () => {
      const { getByText } = render(
        <ActivityListItem
          activity={makeActivity({ duration_seconds: 3661 })}
          onPress={mockOnPress}
        />
      );
      expect(getByText("1h 1m")).toBeTruthy();
    });

    it("displays — for null duration", () => {
      const { getByText } = render(
        <ActivityListItem
          activity={makeActivity({ duration_seconds: null })}
          onPress={mockOnPress}
        />
      );
      expect(getByText("—")).toBeTruthy();
    });
  });

  describe("distance", () => {
    it("displays formatted distance in km", () => {
      const { getByText } = render(
        <ActivityListItem
          activity={makeActivity({ distance_meters: 10500 })}
          onPress={mockOnPress}
        />
      );
      expect(getByText("10.5 km")).toBeTruthy();
    });

    it("displays distance with 2 decimal places for short distances", () => {
      const { getByText } = render(
        <ActivityListItem
          activity={makeActivity({ distance_meters: 5250 })}
          onPress={mockOnPress}
        />
      );
      expect(getByText("5.25 km")).toBeTruthy();
    });

    it("does not display distance when distance_meters is null", () => {
      const { queryByText } = render(
        <ActivityListItem
          activity={makeActivity({ distance_meters: null })}
          onPress={mockOnPress}
        />
      );
      expect(queryByText(/km/)).toBeNull();
    });
  });

  describe("average heart rate", () => {
    it("displays formatted average HR with bpm unit", () => {
      const { getByText } = render(
        <ActivityListItem
          activity={makeActivity({ avg_hr: 152 })}
          onPress={mockOnPress}
        />
      );
      expect(getByText("152 bpm")).toBeTruthy();
    });

    it("rounds non-integer HR values", () => {
      const { getByText } = render(
        <ActivityListItem
          activity={makeActivity({ avg_hr: 152.7 })}
          onPress={mockOnPress}
        />
      );
      expect(getByText("153 bpm")).toBeTruthy();
    });

    it("does not display HR when avg_hr is null", () => {
      const { queryByText } = render(
        <ActivityListItem
          activity={makeActivity({ avg_hr: null })}
          onPress={mockOnPress}
        />
      );
      expect(queryByText(/bpm/)).toBeNull();
    });
  });

  describe("tap behaviour", () => {
    it("calls onPress when tapped", () => {
      const { getByText } = render(
        <ActivityListItem activity={makeActivity()} onPress={mockOnPress} />
      );
      fireEvent.press(getByText("Morning Run"));
      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });
  });

  describe("all fields together", () => {
    it("renders all fields for a fully populated activity", () => {
      const activity = makeActivity({
        discipline: "RIDE_ROAD",
        name: "Sunday Long Ride",
        start_time: "2024-07-21T08:00:00Z",
        duration_seconds: 7200,
        distance_meters: 65000,
        avg_hr: 140,
      });
      const { getByText } = render(
        <ActivityListItem activity={activity} onPress={mockOnPress} />
      );
      expect(getByText("🚴")).toBeTruthy();
      expect(getByText("Sunday Long Ride")).toBeTruthy();
      expect(getByText("21 Jul 2024")).toBeTruthy();
      expect(getByText("2h 0m")).toBeTruthy();
      expect(getByText("65.0 km")).toBeTruthy();
      expect(getByText("140 bpm")).toBeTruthy();
    });

    it("renders correctly with only required fields (nulls for optional)", () => {
      const activity = makeActivity({
        discipline: "STRENGTH",
        name: null,
        duration_seconds: null,
        distance_meters: null,
        avg_hr: null,
      });
      const { getByText, queryByText } = render(
        <ActivityListItem activity={activity} onPress={mockOnPress} />
      );
      expect(getByText("🏋️")).toBeTruthy();
      expect(getByText("Untitled Activity")).toBeTruthy();
      expect(getByText("—")).toBeTruthy();
      expect(queryByText(/km/)).toBeNull();
      expect(queryByText(/bpm/)).toBeNull();
    });
  });
});
