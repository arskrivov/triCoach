import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CoachBriefingCard } from "../coach-briefing-card";
import type { DashboardBriefing } from "@/lib/types";

const mockBriefing: DashboardBriefing = {
  source: "ai",
  generated_for_date: "2024-01-15",
  generated_at: "2024-01-15T07:00:00Z",
  ai_enabled: true,
  sleep_analysis: "Sleep was restorative last night.",
  activity_analysis: "Training load is building steadily.",
  recommendations: ["Complete the planned 10km run", "Focus on easy effort"],
  caution: null,
};

describe("CoachBriefingCard", () => {
  it("renders placeholder when briefing is null", () => {
    render(<CoachBriefingCard briefing={null} />);
    expect(screen.getByText(/waiting for today/i)).toBeInTheDocument();
  });

  it("renders briefing content when briefing is provided", () => {
    render(<CoachBriefingCard briefing={mockBriefing} />);
    expect(screen.getByText("Complete the planned 10km run")).toBeInTheDocument();
    expect(screen.getByText("Focus on easy effort")).toBeInTheDocument();
  });

  it("shows AI-enhanced badge for ai source", () => {
    render(<CoachBriefingCard briefing={mockBriefing} />);
    expect(screen.getByText("AI-enhanced")).toBeInTheDocument();
  });

  it("shows Rule-based badge for heuristic source", () => {
    render(<CoachBriefingCard briefing={{ ...mockBriefing, source: "heuristic" }} />);
    expect(screen.getByText("Rule-based")).toBeInTheDocument();
  });

  it("renders caution when present", () => {
    const withCaution = { ...mockBriefing, caution: "Watch your HRV trend." };
    render(<CoachBriefingCard briefing={withCaution} />);
    expect(screen.getByText("Watch your HRV trend.")).toBeInTheDocument();
  });

  it("does not render caution section when caution is null", () => {
    render(<CoachBriefingCard briefing={mockBriefing} />);
    expect(screen.queryByText("Watchout")).not.toBeInTheDocument();
  });
});
