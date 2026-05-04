/**
 * Unit tests for the BriefingCard component.
 *
 * Validates: Requirements 5.4 (briefing display), 5.5 (placeholder when no briefing)
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

import { BriefingCard } from "../../../components/dashboard/BriefingCard";
import type { DashboardBriefing } from "../../../lib/types";

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
 * Helper to create a valid DashboardBriefing for testing.
 */
function makeBriefing(
  overrides: Partial<DashboardBriefing> = {}
): DashboardBriefing {
  return {
    source: "ai",
    generated_for_date: "2025-01-15",
    generated_at: "2025-01-15T07:00:00Z",
    ai_enabled: true,
    sleep_analysis: "Good sleep quality with 7.5 hours total.",
    activity_analysis: "Moderate training load this week.",
    recommendations: [
      "Consider an easy recovery run today.",
      "Focus on hydration before your afternoon session.",
    ],
    caution: null,
    ...overrides,
  };
}

describe("BriefingCard", () => {
  describe("placeholder (no briefing)", () => {
    it("shows placeholder message when briefing is null", () => {
      render(<BriefingCard briefing={null} />);

      expect(screen.getByText("Coach Briefing")).toBeTruthy();
      expect(
        screen.getByText(
          "Your daily briefing will appear here after 06:00 once Garmin data is synced."
        )
      ).toBeTruthy();
    });
  });

  describe("briefing display", () => {
    it("shows Coach Briefing header with AI source badge", () => {
      render(<BriefingCard briefing={makeBriefing({ source: "ai" })} />);

      expect(screen.getByText("Coach Briefing")).toBeTruthy();
      expect(screen.getByText("AI")).toBeTruthy();
    });

    it("shows Heuristic source badge when source is heuristic", () => {
      render(
        <BriefingCard briefing={makeBriefing({ source: "heuristic" })} />
      );

      expect(screen.getByText("Heuristic")).toBeTruthy();
    });

    it("displays sleep analysis section", () => {
      const briefing = makeBriefing({
        sleep_analysis: "Excellent deep sleep at 1.8 hours.",
      });
      render(<BriefingCard briefing={briefing} />);

      expect(screen.getByText("Sleep")).toBeTruthy();
      expect(
        screen.getByText("Excellent deep sleep at 1.8 hours.")
      ).toBeTruthy();
    });

    it("displays activity analysis section", () => {
      const briefing = makeBriefing({
        activity_analysis: "High training load detected.",
      });
      render(<BriefingCard briefing={briefing} />);

      expect(screen.getByText("Activity")).toBeTruthy();
      expect(
        screen.getByText("High training load detected.")
      ).toBeTruthy();
    });

    it("displays up to 2 recommendations as bullet points", () => {
      const briefing = makeBriefing({
        recommendations: [
          "Take a rest day.",
          "Stretch after your run.",
          "This third one should not appear.",
        ],
      });
      render(<BriefingCard briefing={briefing} />);

      expect(screen.getByText("Recommendations")).toBeTruthy();
      expect(screen.getByText("Take a rest day.")).toBeTruthy();
      expect(screen.getByText("Stretch after your run.")).toBeTruthy();
      expect(
        screen.queryByText("This third one should not appear.")
      ).toBeNull();
    });

    it("does not show recommendations section when array is empty", () => {
      const briefing = makeBriefing({ recommendations: [] });
      render(<BriefingCard briefing={briefing} />);

      expect(screen.queryByText("Recommendations")).toBeNull();
    });

    it("displays caution section with warning styling when caution is present", () => {
      const briefing = makeBriefing({
        caution: "Elevated resting HR detected. Consider reducing intensity.",
      });
      render(<BriefingCard briefing={briefing} />);

      expect(screen.getByText("⚠ Caution")).toBeTruthy();
      expect(
        screen.getByText(
          "Elevated resting HR detected. Consider reducing intensity."
        )
      ).toBeTruthy();
    });

    it("does not show caution section when caution is null", () => {
      const briefing = makeBriefing({ caution: null });
      render(<BriefingCard briefing={briefing} />);

      expect(screen.queryByText("⚠ Caution")).toBeNull();
    });

    it("displays exactly 1 recommendation when only 1 is provided", () => {
      const briefing = makeBriefing({
        recommendations: ["Single recommendation."],
      });
      render(<BriefingCard briefing={briefing} />);

      expect(screen.getByText("Recommendations")).toBeTruthy();
      expect(screen.getByText("Single recommendation.")).toBeTruthy();
    });
  });
});
