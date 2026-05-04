/**
 * Unit tests for MetricTile component.
 *
 * Tests label display, value rendering (including null), unit display,
 * trend indicator arrows and colours, and theme integration.
 *
 * **Validates: Requirements 5.6, 5.9**
 */

import React from "react";
import { render } from "@testing-library/react-native";
import { MetricTile } from "../../../components/dashboard/MetricTile";

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
  lightColors: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    muted: "#f5f5f5",
    mutedForeground: "#737373",
    statusPositive: "#10b981",
    statusNegative: "#ef4444",
    statusCaution: "#f59e0b",
  },
  darkColors: {
    background: "#0a0a0a",
    foreground: "#fafafa",
    muted: "#262626",
    mutedForeground: "#a3a3a3",
    statusPositive: "#34d399",
    statusNegative: "#f87171",
    statusCaution: "#fbbf24",
  },
}));

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => "light",
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MetricTile", () => {
  describe("label display", () => {
    it("renders the label text", () => {
      const { getByText } = render(
        <MetricTile label="HRV" value={65} />
      );
      expect(getByText("HRV")).toBeTruthy();
    });
  });

  describe("value display", () => {
    it("renders a numeric value as a string", () => {
      const { getByText } = render(
        <MetricTile label="Sleep Score" value={87} />
      );
      expect(getByText("87")).toBeTruthy();
    });

    it("renders a string value directly", () => {
      const { getByText } = render(
        <MetricTile label="Duration" value="7h 32m" />
      );
      expect(getByText("7h 32m")).toBeTruthy();
    });

    it('renders "—" when value is null', () => {
      const { getByText } = render(
        <MetricTile label="SpO2" value={null} />
      );
      expect(getByText("—")).toBeTruthy();
    });

    it("renders 0 as a valid value", () => {
      const { getByText } = render(
        <MetricTile label="TSS" value={0} />
      );
      expect(getByText("0")).toBeTruthy();
    });
  });

  describe("unit display", () => {
    it("renders the unit next to the value", () => {
      const { getByText } = render(
        <MetricTile label="HRV" value={65} unit="ms" />
      );
      expect(getByText("ms")).toBeTruthy();
    });

    it("does not render the unit when value is null", () => {
      const { queryByText } = render(
        <MetricTile label="HRV" value={null} unit="ms" />
      );
      expect(queryByText("ms")).toBeNull();
    });

    it("does not render a unit element when unit is not provided", () => {
      const { getByText, queryByText } = render(
        <MetricTile label="Score" value={90} />
      );
      expect(getByText("90")).toBeTruthy();
      // No unit text should be present
      expect(queryByText("ms")).toBeNull();
      expect(queryByText("bpm")).toBeNull();
    });
  });

  describe("trend indicator", () => {
    it('renders ↑ arrow for "up" trend', () => {
      const { getByText } = render(
        <MetricTile label="HRV" value={65} trend="up" />
      );
      expect(getByText("↑")).toBeTruthy();
    });

    it('renders ↓ arrow for "down" trend', () => {
      const { getByText } = render(
        <MetricTile label="Resting HR" value={52} trend="down" />
      );
      expect(getByText("↓")).toBeTruthy();
    });

    it('renders → arrow for "stable" trend', () => {
      const { getByText } = render(
        <MetricTile label="SpO2" value={97} trend="stable" />
      );
      expect(getByText("→")).toBeTruthy();
    });

    it('does not render an arrow for "unknown" trend', () => {
      const { queryByText } = render(
        <MetricTile label="Readiness" value={70} trend="unknown" />
      );
      expect(queryByText("↑")).toBeNull();
      expect(queryByText("↓")).toBeNull();
      expect(queryByText("→")).toBeNull();
    });

    it("does not render an arrow when trend is not provided", () => {
      const { queryByText } = render(
        <MetricTile label="HRV" value={65} />
      );
      expect(queryByText("↑")).toBeNull();
      expect(queryByText("↓")).toBeNull();
      expect(queryByText("→")).toBeNull();
    });
  });

  describe("combined rendering", () => {
    it("renders label, value, unit, and trend together", () => {
      const { getByText } = render(
        <MetricTile label="HRV" value={65} unit="ms" trend="up" />
      );
      expect(getByText("HRV")).toBeTruthy();
      expect(getByText("65")).toBeTruthy();
      expect(getByText("ms")).toBeTruthy();
      expect(getByText("↑")).toBeTruthy();
    });

    it("renders null value with trend but no unit", () => {
      const { getByText, queryByText } = render(
        <MetricTile label="SpO2" value={null} unit="%" trend="stable" />
      );
      expect(getByText("SpO2")).toBeTruthy();
      expect(getByText("—")).toBeTruthy();
      expect(queryByText("%")).toBeNull();
      expect(getByText("→")).toBeTruthy();
    });
  });
});
