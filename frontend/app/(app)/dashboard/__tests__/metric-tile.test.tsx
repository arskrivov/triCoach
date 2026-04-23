import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MetricTile } from "@/components/ui/metric-tile";

describe("MetricTile", () => {
  it("renders label and value", () => {
    render(<MetricTile label="HRV" value="65 ms" />);
    expect(screen.getByText("HRV")).toBeInTheDocument();
    expect(screen.getByText("65 ms")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(<MetricTile label="Sleep" value="82" subtitle="7d avg: 79" />);
    expect(screen.getByText("7d avg: 79")).toBeInTheDocument();
  });

  it("does not render subtitle element when not provided", () => {
    const { container } = render(<MetricTile label="HRV" value="65 ms" />);
    // No subtitle paragraph should be present
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2); // label + value only
  });

  it("applies custom valueClassName", () => {
    render(<MetricTile label="TSB" value="+5" valueClassName="text-emerald-600" />);
    const valueEl = screen.getByText("+5");
    expect(valueEl).toHaveClass("text-emerald-600");
  });

  it("applies custom className to container", () => {
    const { container } = render(
      <MetricTile label="HRV" value="65 ms" className="custom-class" />
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
