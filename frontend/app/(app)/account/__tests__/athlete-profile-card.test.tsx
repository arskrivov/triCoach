import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AthleteProfileCard,
  SECTIONS,
  SourceBadge,
} from "../athlete-profile-card";

// Mock the api module
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

import { api } from "@/lib/api";

const mockProfile = {
  ftp_watts: 250,
  threshold_pace_sec_per_km: 270,
  swim_css_sec_per_100m: 95,
  max_hr: 185,
  resting_hr: 52,
  weight_kg: 75,
  squat_1rm_kg: 120,
  deadlift_1rm_kg: 150,
  bench_1rm_kg: 90,
  overhead_press_1rm_kg: 60,
  mobility_sessions_per_week_target: 2,
  weekly_training_hours: 12,
  field_sources: {
    ftp_watts: "manual" as const,
    threshold_pace_sec_per_km: "garmin" as const,
    swim_css_sec_per_100m: "default" as const,
    max_hr: "garmin" as const,
    resting_hr: "garmin" as const,
    weight_kg: "manual" as const,
    squat_1rm_kg: "default" as const,
    deadlift_1rm_kg: "default" as const,
    bench_1rm_kg: "default" as const,
    overhead_press_1rm_kg: "default" as const,
    mobility_sessions_per_week_target: "default" as const,
    weekly_training_hours: "manual" as const,
  },
  garmin_values: {
    ftp_watts: 245,
    threshold_pace_sec_per_km: 270,
    swim_css_sec_per_100m: null,
    max_hr: 185,
    resting_hr: 52,
    weight_kg: 74,
    squat_1rm_kg: null,
    deadlift_1rm_kg: null,
    bench_1rm_kg: null,
    overhead_press_1rm_kg: null,
    mobility_sessions_per_week_target: null,
    weekly_training_hours: null,
  },
};

describe("SECTIONS configuration", () => {
  it("contains exactly five sections", () => {
    expect(SECTIONS).toHaveLength(5);
  });

  it("has Training Preferences section with correct fields", () => {
    const section = SECTIONS.find((s) => s.label === "Training Preferences");
    expect(section).toBeDefined();
    const fieldKeys = section!.fields.map((f) => f.key);
    expect(fieldKeys).toContain("weekly_training_hours");
    expect(fieldKeys).toContain("mobility_sessions_per_week_target");
  });

  it("has Endurance Thresholds section with correct fields", () => {
    const section = SECTIONS.find((s) => s.label === "Endurance Thresholds");
    expect(section).toBeDefined();
    const fieldKeys = section!.fields.map((f) => f.key);
    expect(fieldKeys).toContain("ftp_watts");
    expect(fieldKeys).toContain("threshold_pace_sec_per_km");
    expect(fieldKeys).toContain("swim_css_sec_per_100m");
  });

  it("has Heart Rate section with correct fields", () => {
    const section = SECTIONS.find((s) => s.label === "Heart Rate");
    expect(section).toBeDefined();
    const fieldKeys = section!.fields.map((f) => f.key);
    expect(fieldKeys).toContain("max_hr");
    expect(fieldKeys).toContain("resting_hr");
  });

  it("has Strength section with correct fields", () => {
    const section = SECTIONS.find((s) => s.label === "Strength");
    expect(section).toBeDefined();
    const fieldKeys = section!.fields.map((f) => f.key);
    expect(fieldKeys).toContain("squat_1rm_kg");
    expect(fieldKeys).toContain("deadlift_1rm_kg");
    expect(fieldKeys).toContain("bench_1rm_kg");
    expect(fieldKeys).toContain("overhead_press_1rm_kg");
  });

  it("has Body section with correct fields", () => {
    const section = SECTIONS.find((s) => s.label === "Body");
    expect(section).toBeDefined();
    const fieldKeys = section!.fields.map((f) => f.key);
    expect(fieldKeys).toContain("weight_kg");
  });

  it("section labels match requirements", () => {
    const labels = SECTIONS.map((s) => s.label);
    expect(labels).toEqual([
      "Training Preferences",
      "Endurance Thresholds",
      "Heart Rate",
      "Strength",
      "Body",
    ]);
  });
});

describe("SourceBadge", () => {
  it("renders Manual label for manual source", () => {
    render(<SourceBadge source="manual" />);
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("renders Garmin label for garmin source", () => {
    render(<SourceBadge source="garmin" />);
    expect(screen.getByText("Garmin")).toBeInTheDocument();
  });

  it("renders Default label for default source", () => {
    render(<SourceBadge source="default" />);
    expect(screen.getByText("Default")).toBeInTheDocument();
  });

  it("applies teal styling for garmin source", () => {
    const { container } = render(<SourceBadge source="garmin" />);
    const badge = container.querySelector(".border-teal-500\\/50");
    expect(badge).toBeInTheDocument();
  });
});

describe("AthleteProfileCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: mockProfile });
    vi.mocked(api.put).mockResolvedValue({ data: mockProfile });
  });

  it("renders all section headings", async () => {
    render(<AthleteProfileCard />);

    await waitFor(() => {
      expect(screen.getByText("Training Preferences")).toBeInTheDocument();
    });

    expect(screen.getByText("Endurance Thresholds")).toBeInTheDocument();
    expect(screen.getByText("Heart Rate")).toBeInTheDocument();
    expect(screen.getByText("Strength")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("renders source badges for fields", async () => {
    render(<AthleteProfileCard />);

    await waitFor(() => {
      // Should have Manual badges for manual sources
      expect(screen.getAllByText("Manual").length).toBeGreaterThan(0);
    });

    // Should have Garmin badges for garmin sources
    expect(screen.getAllByText("Garmin").length).toBeGreaterThan(0);

    // Should have Default badges for default sources
    expect(screen.getAllByText("Default").length).toBeGreaterThan(0);
  });

  it("shows Garmin context hint when source is manual and garmin value exists", async () => {
    render(<AthleteProfileCard />);

    await waitFor(() => {
      // FTP has manual source with garmin_value of 245
      expect(screen.getByText("Garmin: 245W")).toBeInTheDocument();
    });

    // Weight has manual source with garmin_value of 74
    expect(screen.getByText("Garmin: 74kg")).toBeInTheDocument();
  });

  it("does not show Garmin hint when source is garmin (value is already displayed)", async () => {
    render(<AthleteProfileCard />);

    await waitFor(() => {
      // threshold_pace_sec_per_km has garmin source, so no hint should appear
      // The value 270 should be in the input, not as a hint
      const hints = screen.queryAllByText(/Garmin: 270/);
      expect(hints.length).toBe(0);
    });
  });

  it("renders save button", async () => {
    render(<AthleteProfileCard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save profile/i })).toBeInTheDocument();
    });
  });

  it("shows saving state when save is clicked", async () => {
    // Make the put request hang
    vi.mocked(api.put).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: mockProfile }), 100))
    );

    render(<AthleteProfileCard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save profile/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();
    });
  });

  it("shows success message after save", async () => {
    render(<AthleteProfileCard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save profile/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => {
      expect(screen.getByText("Saved!")).toBeInTheDocument();
    });
  });

  it("shows error message when save fails", async () => {
    vi.mocked(api.put).mockRejectedValue(new Error("Network error"));

    render(<AthleteProfileCard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save profile/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("renders input fields with placeholder when value is null", async () => {
    const profileWithNulls = {
      ...mockProfile,
      squat_1rm_kg: null,
      field_sources: {
        ...mockProfile.field_sources,
        squat_1rm_kg: "default" as const,
      },
    };
    vi.mocked(api.get).mockResolvedValue({ data: profileWithNulls });

    render(<AthleteProfileCard />);

    await waitFor(() => {
      const squatInput = screen.getByLabelText(/squat 1rm/i);
      expect(squatInput).toHaveAttribute("placeholder", "—");
      expect(squatInput).toHaveValue(null);
    });
  });

  it("updates field value when input changes", async () => {
    render(<AthleteProfileCard />);

    await waitFor(() => {
      expect(screen.getByLabelText(/ftp/i)).toBeInTheDocument();
    });

    const ftpInput = screen.getByLabelText(/ftp/i);
    fireEvent.change(ftpInput, { target: { value: "260" } });

    expect(ftpInput).toHaveValue(260);
  });

  it("clears field value when input is emptied", async () => {
    render(<AthleteProfileCard />);

    await waitFor(() => {
      expect(screen.getByLabelText(/ftp/i)).toBeInTheDocument();
    });

    const ftpInput = screen.getByLabelText(/ftp/i);
    fireEvent.change(ftpInput, { target: { value: "" } });

    expect(ftpInput).toHaveValue(null);
  });
});
