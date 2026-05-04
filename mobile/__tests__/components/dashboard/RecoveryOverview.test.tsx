/**
 * Unit tests for the RecoveryOverview component.
 *
 * Validates: Requirements 5.6 (6 metric tiles), 5.8 (metric trend table)
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

import { RecoveryOverview } from "../../../components/dashboard/RecoveryOverview";
import type {
  RecoveryOverview as RecoveryOverviewType,
  RecoveryLastNight,
  RecoveryMetricTrend,
  HealthSparklinePoint,
} from "../../../lib/types";

// Mock the theme hook to return light colours
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
  lightColors: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    mutedForeground: "#737373",
    statusPositive: "#10b981",
    statusNegative: "#ef4444",
    statusCaution: "#f59e0b",
    muted: "#f5f5f5",
  },
  darkColors: {
    background: "#0a0a0a",
    foreground: "#fafafa",
    mutedForeground: "#a3a3a3",
    statusPositive: "#34d399",
    statusNegative: "#f87171",
    statusCaution: "#fbbf24",
    muted: "#262626",
  },
}));

/**
 * Helper to create a valid RecoveryLastNight for testing.
 */
function makeLastNight(
  overrides: Partial<RecoveryLastNight> = {}
): RecoveryLastNight {
  return {
    date: "2025-01-15",
    sleep_score: 82,
    sleep_duration_hours: 7.5,
    hrv_last_night: 55,
    resting_hr: 52,
    respiration_sleep: 15,
    stress_avg: 28,
    pulse_ox_avg: 96,
    morning_training_readiness_score: 72,
    ...overrides,
  };
}

/**
 * Helper to create a valid RecoveryMetricTrend for testing.
 */
function makeMetric(
  overrides: Partial<RecoveryMetricTrend> = {}
): RecoveryMetricTrend {
  return {
    key: "hrv_last_night",
    label: "HRV",
    unit: "ms",
    current: 55,
    avg_7d: 52,
    avg_30d: 50,
    direction_vs_7d: "up",
    direction_vs_30d: "up",
    ...overrides,
  };
}

/**
 * Helper to create full recovery data for the component.
 */
function makeRecovery(
  overrides: Partial<RecoveryOverviewType & { sparkline: HealthSparklinePoint[] }> = {}
): RecoveryOverviewType & { sparkline: HealthSparklinePoint[] } {
  return {
    status: "strong",
    headline: "Recovery looking solid after a good night's sleep.",
    last_night: makeLastNight(),
    metrics: [
      makeMetric({
        key: "hrv_last_night",
        label: "HRV",
        unit: "ms",
        current: 55,
        avg_7d: 52,
        direction_vs_7d: "up",
      }),
      makeMetric({
        key: "resting_hr",
        label: "Resting HR",
        unit: "bpm",
        current: 52,
        avg_7d: 54,
        direction_vs_7d: "down",
      }),
      makeMetric({
        key: "sleep_score",
        label: "Sleep Score",
        unit: "",
        current: 82,
        avg_7d: 78,
        direction_vs_7d: "up",
      }),
      makeMetric({
        key: "pulse_ox_avg",
        label: "SpO2",
        unit: "%",
        current: 96,
        avg_7d: 95,
        direction_vs_7d: "stable",
      }),
    ],
    sparkline: [],
    ...overrides,
  };
}

describe("RecoveryOverview", () => {
  describe("header and status badge", () => {
    it("displays Recovery header", () => {
      render(<RecoveryOverview recovery={makeRecovery()} />);
      expect(screen.getByText("Recovery")).toBeTruthy();
    });

    it("displays status badge with capitalized text for strong", () => {
      render(
        <RecoveryOverview recovery={makeRecovery({ status: "strong" })} />
      );
      expect(screen.getByText("Strong")).toBeTruthy();
    });

    it("displays status badge for strained", () => {
      render(
        <RecoveryOverview recovery={makeRecovery({ status: "strained" })} />
      );
      expect(screen.getByText("Strained")).toBeTruthy();
    });

    it("displays status badge for steady", () => {
      render(
        <RecoveryOverview recovery={makeRecovery({ status: "steady" })} />
      );
      expect(screen.getByText("Steady")).toBeTruthy();
    });

    it("displays the headline text", () => {
      render(
        <RecoveryOverview
          recovery={makeRecovery({
            headline: "Recovery looking solid after a good night's sleep.",
          })}
        />
      );
      expect(
        screen.getByText(
          "Recovery looking solid after a good night's sleep."
        )
      ).toBeTruthy();
    });
  });

  describe("6 metric tiles", () => {
    it("displays Sleep Score tile with value", () => {
      render(<RecoveryOverview recovery={makeRecovery()} />);
      // "Sleep Score" appears in both the tile and the trend table
      expect(screen.getAllByText("Sleep Score").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("82").length).toBeGreaterThanOrEqual(1);
    });

    it("displays Sleep Duration tile with formatted hours", () => {
      render(<RecoveryOverview recovery={makeRecovery()} />);
      expect(screen.getByText("Sleep Duration")).toBeTruthy();
      expect(screen.getByText("7.5")).toBeTruthy();
    });

    it("displays HRV tile with rounded value", () => {
      render(
        <RecoveryOverview
          recovery={makeRecovery({
            last_night: makeLastNight({ hrv_last_night: 55.7 }),
          })}
        />
      );
      // "HRV" appears in both the tile and the trend table
      expect(screen.getAllByText("HRV").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("56")).toBeTruthy();
    });

    it("displays Resting HR tile", () => {
      render(<RecoveryOverview recovery={makeRecovery()} />);
      // "Resting HR" appears in both the tile and the trend table
      expect(screen.getAllByText("Resting HR").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("52").length).toBeGreaterThanOrEqual(1);
    });

    it("displays SpO2 tile", () => {
      render(<RecoveryOverview recovery={makeRecovery()} />);
      // "SpO2" appears in both the tile and the trend table
      expect(screen.getAllByText("SpO2").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("96").length).toBeGreaterThanOrEqual(1);
    });

    it("displays Readiness tile", () => {
      render(<RecoveryOverview recovery={makeRecovery()} />);
      expect(screen.getByText("Readiness")).toBeTruthy();
      expect(screen.getByText("72")).toBeTruthy();
    });

    it("displays dash for null metric values", () => {
      const recovery = makeRecovery({
        last_night: makeLastNight({
          sleep_score: null,
          sleep_duration_hours: null,
          hrv_last_night: null,
          resting_hr: null,
          pulse_ox_avg: null,
          morning_training_readiness_score: null,
        }),
      });
      render(<RecoveryOverview recovery={recovery} />);

      // All 6 tiles should show "—" for null values
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe("metric trend table", () => {
    it("displays Metric Trends section label", () => {
      render(<RecoveryOverview recovery={makeRecovery()} />);
      expect(screen.getByText("Metric Trends")).toBeTruthy();
    });

    it("displays table headers: Metric, Now, 7d Avg, Trend", () => {
      render(<RecoveryOverview recovery={makeRecovery()} />);
      expect(screen.getByText("Metric")).toBeTruthy();
      expect(screen.getByText("Now")).toBeTruthy();
      expect(screen.getByText("7d Avg")).toBeTruthy();
      expect(screen.getByText("Trend")).toBeTruthy();
    });

    it("displays metric labels in trend rows", () => {
      render(<RecoveryOverview recovery={makeRecovery()} />);
      // The trend table should show the metric labels
      // "HRV" appears both as a tile label and in the trend table
      expect(screen.getAllByText("HRV").length).toBeGreaterThanOrEqual(1);
    });

    it("displays current values with units in trend rows", () => {
      render(<RecoveryOverview recovery={makeRecovery()} />);
      // HRV current: 55 ms
      expect(screen.getByText("55 ms")).toBeTruthy();
      // Resting HR current: 52 bpm
      expect(screen.getByText("52 bpm")).toBeTruthy();
    });

    it("displays 7-day average values in trend rows", () => {
      render(<RecoveryOverview recovery={makeRecovery()} />);
      // HRV avg_7d: 52 (no unit for avg column)
      // Resting HR avg_7d: 54
      expect(screen.getByText("54")).toBeTruthy();
    });

    it("displays trend direction labels", () => {
      render(<RecoveryOverview recovery={makeRecovery()} />);
      // HRV direction_vs_7d: "up" → "Improving"
      expect(screen.getAllByText("Improving").length).toBeGreaterThanOrEqual(1);
      // Resting HR direction_vs_7d: "down" → "Softening"
      expect(screen.getByText("Softening")).toBeTruthy();
      // SpO2 direction_vs_7d: "stable" → "Stable"
      expect(screen.getByText("Stable")).toBeTruthy();
    });

    it("displays trend arrows", () => {
      render(<RecoveryOverview recovery={makeRecovery()} />);
      // "up" → ↑, "down" → ↓, "stable" → →
      expect(screen.getAllByText("↑").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("↓").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("→").length).toBeGreaterThanOrEqual(1);
    });

    it("does not display trend table when metrics array is empty", () => {
      render(
        <RecoveryOverview recovery={makeRecovery({ metrics: [] })} />
      );
      expect(screen.queryByText("Metric Trends")).toBeNull();
    });

    it("displays dash for null current and avg values", () => {
      const recovery = makeRecovery({
        metrics: [
          makeMetric({
            key: "hrv_last_night",
            label: "HRV",
            unit: "ms",
            current: null,
            avg_7d: null,
            direction_vs_7d: "unknown",
          }),
        ],
      });
      render(<RecoveryOverview recovery={recovery} />);

      // Should show "—" for null values in the trend table
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });
  });
});
