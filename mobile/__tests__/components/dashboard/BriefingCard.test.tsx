/**
 * Unit tests for the BriefingCard component.
 *
 * Validates: Requirements 5.4 (briefing display), 5.5 (placeholder when no briefing)
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

import { BriefingCard } from "../../../components/dashboard/BriefingCard";
import type { DashboardBriefing } from "../../../lib/types";

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

      expect(screen.getByText(/Morning Briefing/)).toBeTruthy();
      expect(
        screen.getByText(
          "Your daily briefing will appear here after 06:00 once Garmin data is synced."
        )
      ).toBeTruthy();
    });
  });

  describe("briefing display", () => {
    it("shows Morning Briefing header with AI source badge", () => {
      render(<BriefingCard briefing={makeBriefing({ source: "ai" })} />);

      expect(screen.getByText(/Morning Briefing/)).toBeTruthy();
      expect(screen.getByText("AI")).toBeTruthy();
    });

    it("shows Auto badge when source is heuristic", () => {
      render(
        <BriefingCard briefing={makeBriefing({ source: "heuristic" })} />
      );

      expect(screen.getByText("Auto")).toBeTruthy();
    });

    it("displays sleep analysis inline", () => {
      const briefing = makeBriefing({
        sleep_analysis: "Excellent deep sleep at 1.8 hours.",
      });
      render(<BriefingCard briefing={briefing} />);

      expect(
        screen.getByText("Excellent deep sleep at 1.8 hours.")
      ).toBeTruthy();
    });

    it("displays activity analysis inline", () => {
      const briefing = makeBriefing({
        activity_analysis: "High training load detected.",
      });
      render(<BriefingCard briefing={briefing} />);

      expect(
        screen.getByText("High training load detected.")
      ).toBeTruthy();
    });

    it("displays primary recommendation with lightbulb prefix", () => {
      const briefing = makeBriefing({
        recommendations: ["Take a rest day.", "Stretch after run."],
      });
      render(<BriefingCard briefing={briefing} />);

      expect(screen.getByText(/Take a rest day/)).toBeTruthy();
    });

    it("shows secondary recommendation only when expanded", () => {
      const briefing = makeBriefing({
        recommendations: ["First rec.", "Second rec."],
      });
      render(<BriefingCard briefing={briefing} />);

      // Secondary is hidden initially
      expect(screen.queryByText(/Second rec/)).toBeNull();

      // Tap "Show more"
      fireEvent.press(screen.getByText("Show more"));

      expect(screen.getByText(/Second rec/)).toBeTruthy();
    });

    it("displays caution when present", () => {
      const briefing = makeBriefing({
        caution: "Elevated resting HR detected.",
      });
      render(<BriefingCard briefing={briefing} />);

      expect(
        screen.getByText(/Elevated resting HR detected/)
      ).toBeTruthy();
    });

    it("does not show caution when null", () => {
      const briefing = makeBriefing({ caution: null });
      render(<BriefingCard briefing={briefing} />);

      expect(screen.queryByText(/⚠️/)).toBeNull();
    });

    it("has a Show more / Show less toggle", () => {
      render(<BriefingCard briefing={makeBriefing()} />);

      expect(screen.getByText("Show more")).toBeTruthy();

      fireEvent.press(screen.getByText("Show more"));
      expect(screen.getByText("Show less")).toBeTruthy();

      fireEvent.press(screen.getByText("Show less"));
      expect(screen.getByText("Show more")).toBeTruthy();
    });
  });
});
