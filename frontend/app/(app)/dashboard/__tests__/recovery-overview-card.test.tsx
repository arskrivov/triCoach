import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RecoveryOverviewCard } from "../recovery-overview-card";
import type { RecoveryOverview, HealthSparklinePoint } from "@/lib/types";

// Recharts uses ResizeObserver which is not available in jsdom
vi.mock("recharts", () => ({
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
}));

// Mock MetricTile to avoid complex rendering in unit tests
vi.mock("@/components/ui/metric-tile", () => ({
  MetricTile: ({ label, value }: { label: string; value: string }) => (
    <div data-testid="metric-tile">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
  DashboardMetricTile: ({ label, value }: { label: string; value: string }) => (
    <div data-testid="metric-tile">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
}));

const mockSparkline: HealthSparklinePoint[] = Array.from({ length: 30 }, (_, i) => ({
  date: `2024-01-${(i + 1).toString().padStart(2, "0")}`,
  sleep_score: 80,
  hrv: 65,
  resting_hr: 52,
  stress: null,
  spo2: null,
  respiration: null,
  readiness: null,
}));

const mockRecovery: RecoveryOverview & { sparkline: HealthSparklinePoint[] } = {
  status: "strong",
  headline: "Recovery markers are trending well.",
  last_night: {
    date: "2024-01-15",
    sleep_score: 85,
    sleep_duration_hours: 8.0,
    hrv_last_night: 68,
    resting_hr: 50,
    respiration_sleep: 14.5,
    stress_avg: 22,
    pulse_ox_avg: 98,
    morning_training_readiness_score: 78,
  },
  metrics: [
    {
      key: "sleep_score",
      label: "Sleep score",
      unit: "",
      current: 85,
      avg_7d: 80,
      avg_30d: 78,
      direction_vs_7d: "up",
      direction_vs_30d: "up",
    },
  ],
  sparkline: mockSparkline,
};

describe("RecoveryOverviewCard", () => {
  it("renders the recovery status badge", () => {
    render(<RecoveryOverviewCard recovery={mockRecovery} analysis={null} />);
    expect(screen.getByText("strong")).toBeInTheDocument();
  });

  it("renders analysis text when provided", () => {
    render(
      <RecoveryOverviewCard
        recovery={mockRecovery}
        analysis="Sleep was excellent last night."
      />
    );
    expect(screen.getByText("Sleep was excellent last night.")).toBeInTheDocument();
  });

  it("falls back to headline when analysis is null", () => {
    render(<RecoveryOverviewCard recovery={mockRecovery} analysis={null} />);
    expect(screen.getByText("Recovery markers are trending well.")).toBeInTheDocument();
  });

  it("renders metric labels", () => {
    render(<RecoveryOverviewCard recovery={mockRecovery} analysis={null} />);
    // "Sleep score" appears in both the metric tile and the trend table
    expect(screen.getAllByText("Sleep score").length).toBeGreaterThan(0);
  });

  it("renders strained status with correct text", () => {
    const strained = { ...mockRecovery, status: "strained" as const };
    render(<RecoveryOverviewCard recovery={strained} analysis={null} />);
    expect(screen.getByText("strained")).toBeInTheDocument();
  });
});
