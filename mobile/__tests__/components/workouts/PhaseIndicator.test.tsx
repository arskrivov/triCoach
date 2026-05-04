/**
 * Unit tests for the PhaseIndicator component.
 *
 * Validates: Requirements 8.2 (phase indicator bar with current phase highlighted)
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

import {
  PhaseIndicator,
  getPhaseColor,
} from "../../../components/workouts/PhaseIndicator";
import type { PlanPhase } from "../../../lib/types";

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
}));

/**
 * Helper to create a PlanPhase for testing.
 */
function makePhase(overrides: Partial<PlanPhase> = {}): PlanPhase {
  return {
    name: "Base",
    weeks: [1, 2, 3, 4],
    focus: "Aerobic base building",
    weekly_tss_range: [300, 400],
    ...overrides,
  };
}

/**
 * Standard 5-phase plan used across multiple tests.
 */
function makeStandardPhases(): PlanPhase[] {
  return [
    makePhase({ name: "Base", weeks: [1, 2, 3, 4] }),
    makePhase({ name: "Build", weeks: [5, 6, 7, 8] }),
    makePhase({ name: "Peak", weeks: [9, 10] }),
    makePhase({ name: "Taper", weeks: [11, 12] }),
    makePhase({ name: "Recovery", weeks: [13] }),
  ];
}

describe("PhaseIndicator", () => {
  describe("rendering", () => {
    it("renders all phase name labels", () => {
      const phases = makeStandardPhases();
      render(<PhaseIndicator phases={phases} currentWeek={1} />);

      expect(screen.getByText("Base")).toBeTruthy();
      expect(screen.getByText("Build")).toBeTruthy();
      expect(screen.getByText("Peak")).toBeTruthy();
      expect(screen.getByText("Taper")).toBeTruthy();
      expect(screen.getByText("Recovery")).toBeTruthy();
    });

    it("returns null when phases array is empty", () => {
      const { toJSON } = render(
        <PhaseIndicator phases={[]} currentWeek={1} />
      );
      expect(toJSON()).toBeNull();
    });

    it("renders a single phase correctly", () => {
      const phases = [makePhase({ name: "Base", weeks: [1, 2, 3] })];
      render(<PhaseIndicator phases={phases} currentWeek={2} />);

      expect(screen.getByText("Base")).toBeTruthy();
    });
  });

  describe("current phase highlighting", () => {
    it("highlights the current phase label with bold weight", () => {
      const phases = makeStandardPhases();
      render(<PhaseIndicator phases={phases} currentWeek={6} />);

      // Build phase (weeks 5-8) should be current when currentWeek=6
      const buildLabel = screen.getByText("Build");
      const flatStyle = Array.isArray(buildLabel.props.style)
        ? Object.assign({}, ...buildLabel.props.style)
        : buildLabel.props.style;
      expect(flatStyle.fontWeight).toBe("700");
    });

    it("dims non-current phase labels with normal weight", () => {
      const phases = makeStandardPhases();
      render(<PhaseIndicator phases={phases} currentWeek={6} />);

      // Base phase (weeks 1-4) should NOT be current when currentWeek=6
      const baseLabel = screen.getByText("Base");
      const flatStyle = Array.isArray(baseLabel.props.style)
        ? Object.assign({}, ...baseLabel.props.style)
        : baseLabel.props.style;
      expect(flatStyle.fontWeight).toBe("500");
    });

    it("highlights the first phase when currentWeek is in the first phase", () => {
      const phases = makeStandardPhases();
      render(<PhaseIndicator phases={phases} currentWeek={1} />);

      const baseLabel = screen.getByText("Base");
      const flatStyle = Array.isArray(baseLabel.props.style)
        ? Object.assign({}, ...baseLabel.props.style)
        : baseLabel.props.style;
      expect(flatStyle.fontWeight).toBe("700");
    });

    it("highlights the last phase when currentWeek is in the last phase", () => {
      const phases = makeStandardPhases();
      render(<PhaseIndicator phases={phases} currentWeek={13} />);

      const recoveryLabel = screen.getByText("Recovery");
      const flatStyle = Array.isArray(recoveryLabel.props.style)
        ? Object.assign({}, ...recoveryLabel.props.style)
        : recoveryLabel.props.style;
      expect(flatStyle.fontWeight).toBe("700");
    });
  });
});

describe("getPhaseColor", () => {
  it("returns blue for Base", () => {
    expect(getPhaseColor("Base")).toBe("#3b82f6");
  });

  it("returns amber for Build", () => {
    expect(getPhaseColor("Build")).toBe("#f59e0b");
  });

  it("returns red for Peak", () => {
    expect(getPhaseColor("Peak")).toBe("#ef4444");
  });

  it("returns emerald for Taper", () => {
    expect(getPhaseColor("Taper")).toBe("#10b981");
  });

  it("returns purple for Recovery", () => {
    expect(getPhaseColor("Recovery")).toBe("#8b5cf6");
  });

  it("is case-insensitive", () => {
    expect(getPhaseColor("BASE")).toBe("#3b82f6");
    expect(getPhaseColor("build")).toBe("#f59e0b");
    expect(getPhaseColor("PEAK")).toBe("#ef4444");
  });

  it("returns default grey for unknown phase names", () => {
    expect(getPhaseColor("Unknown")).toBe("#6b7280");
    expect(getPhaseColor("Custom Phase")).toBe("#6b7280");
  });
});
