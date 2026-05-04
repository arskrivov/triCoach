/**
 * Unit tests for LapTable component.
 *
 * @see Requirements 6.8
 */

import React from "react";
import { render } from "@testing-library/react-native";

import { LapTable, formatDistanceKm, formatPace } from "../../../components/activities/LapTable";
import type { Lap } from "../../../components/activities/LapTable";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

// ---------------------------------------------------------------------------
// Helper data
// ---------------------------------------------------------------------------

const sampleLaps: Lap[] = [
  {
    lap_number: 1,
    duration_seconds: 305,
    distance_meters: 1000,
    avg_hr: 145,
    avg_pace_sec_per_km: 305,
  },
  {
    lap_number: 2,
    duration_seconds: 290,
    distance_meters: 1000,
    avg_hr: 155,
    avg_pace_sec_per_km: 290,
  },
  {
    lap_number: 3,
    duration_seconds: 275,
    distance_meters: 1000,
    avg_hr: 162,
    avg_pace_sec_per_km: 275,
  },
];

const lapsWithNulls: Lap[] = [
  {
    lap_number: 1,
    duration_seconds: 600,
    distance_meters: null,
    avg_hr: null,
    avg_pace_sec_per_km: null,
  },
];

// ---------------------------------------------------------------------------
// formatDistanceKm tests
// ---------------------------------------------------------------------------

describe("formatDistanceKm", () => {
  it("returns — for null", () => {
    expect(formatDistanceKm(null)).toBe("—");
  });

  it("formats metres to km with 2 decimal places", () => {
    expect(formatDistanceKm(1000)).toBe("1.00 km");
    expect(formatDistanceKm(1500)).toBe("1.50 km");
    expect(formatDistanceKm(12345)).toBe("12.35 km");
  });
});

// ---------------------------------------------------------------------------
// formatPace tests
// ---------------------------------------------------------------------------

describe("formatPace", () => {
  it("returns — for null", () => {
    expect(formatPace(null)).toBe("—");
  });

  it("formats seconds per km to min:sec/km", () => {
    expect(formatPace(300)).toBe("5:00/km");
    expect(formatPace(305)).toBe("5:05/km");
    expect(formatPace(270)).toBe("4:30/km");
  });

  it("pads seconds with leading zero", () => {
    expect(formatPace(243)).toBe("4:03/km");
  });
});

// ---------------------------------------------------------------------------
// LapTable component tests
// ---------------------------------------------------------------------------

describe("LapTable", () => {
  it("renders nothing when laps array is empty", () => {
    const { toJSON } = render(<LapTable laps={[]} />);
    expect(toJSON()).toBeNull();
  });

  it("renders the Laps header", () => {
    const { getByText } = render(<LapTable laps={sampleLaps} />);
    expect(getByText("Laps")).toBeTruthy();
  });

  it("renders column headers", () => {
    const { getByText } = render(<LapTable laps={sampleLaps} />);
    expect(getByText("#")).toBeTruthy();
    expect(getByText("Duration")).toBeTruthy();
    expect(getByText("Distance")).toBeTruthy();
    expect(getByText("HR")).toBeTruthy();
    expect(getByText("Pace")).toBeTruthy();
  });

  it("renders all lap rows", () => {
    const { getAllByLabelText } = render(<LapTable laps={sampleLaps} />);
    const lapRows = getAllByLabelText(/^Lap \d+$/);
    expect(lapRows).toHaveLength(3);
  });

  it("displays lap numbers", () => {
    const { getByLabelText, getByText } = render(<LapTable laps={sampleLaps} />);
    expect(getByLabelText("Lap 1")).toBeTruthy();
    expect(getByLabelText("Lap 2")).toBeTruthy();
    expect(getByLabelText("Lap 3")).toBeTruthy();
  });

  it("displays formatted duration for each lap", () => {
    const { getByText } = render(<LapTable laps={sampleLaps} />);
    // 305s = 5m 5s
    expect(getByText("5m 5s")).toBeTruthy();
    // 290s = 4m 50s
    expect(getByText("4m 50s")).toBeTruthy();
    // 275s = 4m 35s
    expect(getByText("4m 35s")).toBeTruthy();
  });

  it("displays formatted distance for each lap", () => {
    const { getAllByText } = render(<LapTable laps={sampleLaps} />);
    // All laps have 1000m = 1.00 km
    const distanceCells = getAllByText("1.00 km");
    expect(distanceCells.length).toBe(3);
  });

  it("displays — for null fields", () => {
    const { getAllByText } = render(<LapTable laps={lapsWithNulls} />);
    // distance, avg_hr, and pace are all null → "—"
    const dashes = getAllByText("—");
    expect(dashes.length).toBe(3);
  });

  it("displays formatted pace", () => {
    const { getByText } = render(<LapTable laps={sampleLaps} />);
    expect(getByText("5:05/km")).toBeTruthy();
    expect(getByText("4:50/km")).toBeTruthy();
    expect(getByText("4:35/km")).toBeTruthy();
  });

  it("displays formatted avg HR", () => {
    const { getByText } = render(<LapTable laps={sampleLaps} />);
    expect(getByText("145")).toBeTruthy();
    expect(getByText("155")).toBeTruthy();
    expect(getByText("162")).toBeTruthy();
  });
});
