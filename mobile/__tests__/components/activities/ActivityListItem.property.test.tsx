/**
 * Property-based tests for ActivityListItem component.
 *
 * **Validates: Requirements 6.2**
 *
 * Property 2: Activity list item displays all required fields
 *
 * *For any* valid `ActivitySummary` object with non-null fields, the rendered
 * activity list item SHALL contain the discipline emoji icon, activity name,
 * formatted date, formatted duration, formatted distance (when `distance_meters`
 * is non-null), and formatted average heart rate (when `avg_hr` is non-null).
 */

import React from "react";
import { render } from "@testing-library/react-native";
import * as fc from "fast-check";
import { ActivityListItem } from "../../../components/activities/ActivityListItem";
import { getDisciplineMeta, formatDate, formatDuration } from "../../../lib/format";
import type { ActivitySummary, Discipline } from "../../../lib/types";

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
    disciplineRun: "#f97316",
    disciplineSwim: "#3b82f6",
    disciplineRideRoad: "#8b5cf6",
    disciplineRideGravel: "#f59e0b",
    disciplineStrength: "#f43f5e",
    disciplineYoga: "#14b8a6",
    disciplineMobility: "#06b6d4",
    disciplineOther: "#71717a",
  }),
  lightColors: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    muted: "#f5f5f5",
    mutedForeground: "#737373",
    statusPositive: "#10b981",
    statusNegative: "#ef4444",
    statusCaution: "#f59e0b",
    disciplineRun: "#f97316",
    disciplineSwim: "#3b82f6",
    disciplineRideRoad: "#8b5cf6",
    disciplineRideGravel: "#f59e0b",
    disciplineStrength: "#f43f5e",
    disciplineYoga: "#14b8a6",
    disciplineMobility: "#06b6d4",
    disciplineOther: "#71717a",
  },
  darkColors: {
    background: "#0a0a0a",
    foreground: "#fafafa",
    muted: "#262626",
    mutedForeground: "#a3a3a3",
    statusPositive: "#34d399",
    statusNegative: "#f87171",
    statusCaution: "#fbbf24",
    disciplineRun: "#fb923c",
    disciplineSwim: "#60a5fa",
    disciplineRideRoad: "#a78bfa",
    disciplineRideGravel: "#fbbf24",
    disciplineStrength: "#fb7185",
    disciplineYoga: "#2dd4bf",
    disciplineMobility: "#22d3ee",
    disciplineOther: "#a1a1aa",
  },
}));

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => "light",
}));

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const ALL_DISCIPLINES: Discipline[] = [
  "SWIM",
  "RUN",
  "RIDE_ROAD",
  "RIDE_GRAVEL",
  "STRENGTH",
  "YOGA",
  "MOBILITY",
  "OTHER",
];

/** Arbitrary for a valid Discipline value. */
const arbDiscipline: fc.Arbitrary<Discipline> = fc.constantFrom(...ALL_DISCIPLINES);

/**
 * Arbitrary for a valid ISO 8601 date string.
 * Generates timestamps between 2020-01-01 and 2025-12-31 as epoch millis,
 * then converts to ISO string to avoid invalid Date edge cases.
 */
const arbISODate: fc.Arbitrary<string> = fc
  .integer({
    min: new Date("2020-01-01T00:00:00Z").getTime(),
    max: new Date("2025-12-31T23:59:59Z").getTime(),
  })
  .map((ms) => new Date(ms).toISOString());

/**
 * Arbitrary for a non-empty activity name (printable ASCII, 1-80 chars).
 */
const arbActivityName: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 80 });

/**
 * Arbitrary for a positive duration in seconds (1 to 86400 = 24h).
 */
const arbDuration: fc.Arbitrary<number> = fc.integer({ min: 1, max: 86400 });

/**
 * Arbitrary for a positive distance in metres (1 to 300000 = 300km).
 */
const arbDistance: fc.Arbitrary<number> = fc.integer({ min: 1, max: 300000 });

/**
 * Arbitrary for a valid average heart rate (30 to 220 bpm).
 */
const arbAvgHR: fc.Arbitrary<number> = fc.integer({ min: 30, max: 220 });

/**
 * Build a full ActivitySummary with all non-null fields from generated parts.
 */
function buildActivity(params: {
  discipline: Discipline;
  name: string;
  start_time: string;
  duration_seconds: number;
  distance_meters: number;
  avg_hr: number;
}): ActivitySummary {
  return {
    id: "prop-test-id",
    garmin_activity_id: 1,
    discipline: params.discipline,
    name: params.name,
    start_time: params.start_time,
    duration_seconds: params.duration_seconds,
    calories: 500,
    distance_meters: params.distance_meters,
    elevation_gain_meters: 100,
    avg_hr: params.avg_hr,
    avg_pace_sec_per_km: 300,
    avg_power_watts: null,
    tss: 80,
    total_sets: null,
    total_volume_kg: null,
    session_type: null,
    aerobic_training_effect: 3.0,
    anaerobic_training_effect: 1.0,
    training_effect_label: "Improving",
  };
}

/**
 * Format distance in metres to km string, matching the component's logic.
 */
function expectedDistanceKm(meters: number): string {
  const km = meters / 1000;
  return km >= 10 ? `${km.toFixed(1)} km` : `${km.toFixed(2)} km`;
}

/**
 * Format average HR with bpm unit, matching the component's logic.
 */
function expectedAvgHR(hr: number): string {
  return `${Math.round(hr)} bpm`;
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("ActivityListItem - Property Tests", () => {
  const noop = () => {};

  /**
   * **Property 2: Activity list item displays all required fields**
   *
   * *For any* valid `ActivitySummary` object with non-null fields, the rendered
   * activity list item SHALL contain the discipline emoji icon, activity name,
   * formatted date, formatted duration, formatted distance (when `distance_meters`
   * is non-null), and formatted average heart rate (when `avg_hr` is non-null).
   *
   * **Validates: Requirements 6.2**
   */
  describe("Property 2: Activity list item displays all required fields", () => {
    it("displays discipline emoji, name, date, duration, distance, and HR for any valid activity with all fields non-null", () => {
      fc.assert(
        fc.property(
          arbDiscipline,
          arbActivityName,
          arbISODate,
          arbDuration,
          arbDistance,
          arbAvgHR,
          (discipline, name, startTime, duration, distance, avgHr) => {
            const activity = buildActivity({
              discipline,
              name,
              start_time: startTime,
              duration_seconds: duration,
              distance_meters: distance,
              avg_hr: avgHr,
            });

            const { getByText } = render(
              <ActivityListItem activity={activity} onPress={noop} />
            );

            // 1. Discipline emoji icon is present
            const meta = getDisciplineMeta(discipline, false);
            expect(getByText(meta.icon)).toBeTruthy();

            // 2. Activity name is displayed
            expect(getByText(name)).toBeTruthy();

            // 3. Formatted date is displayed
            const expectedDate = formatDate(startTime);
            expect(getByText(expectedDate)).toBeTruthy();

            // 4. Formatted duration is displayed
            const expectedDur = formatDuration(duration);
            expect(getByText(expectedDur)).toBeTruthy();

            // 5. Formatted distance is displayed (non-null)
            const expectedDist = expectedDistanceKm(distance);
            expect(getByText(expectedDist)).toBeTruthy();

            // 6. Formatted average HR is displayed (non-null)
            const expectedHR = expectedAvgHR(avgHr);
            expect(getByText(expectedHR)).toBeTruthy();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("omits distance when distance_meters is null", () => {
      fc.assert(
        fc.property(
          arbDiscipline,
          arbActivityName,
          arbISODate,
          arbDuration,
          arbAvgHR,
          (discipline, name, startTime, duration, avgHr) => {
            const activity = buildActivity({
              discipline,
              name,
              start_time: startTime,
              duration_seconds: duration,
              distance_meters: 0, // placeholder, will override
              avg_hr: avgHr,
            });
            activity.distance_meters = null;

            const { queryByText, getByText } = render(
              <ActivityListItem activity={activity} onPress={noop} />
            );

            // Core fields still present
            const meta = getDisciplineMeta(discipline, false);
            expect(getByText(meta.icon)).toBeTruthy();
            expect(getByText(name)).toBeTruthy();
            expect(getByText(formatDate(startTime))).toBeTruthy();
            expect(getByText(formatDuration(duration))).toBeTruthy();

            // Distance should NOT be rendered
            expect(queryByText(/km/)).toBeNull();

            // HR still present
            expect(getByText(expectedAvgHR(avgHr))).toBeTruthy();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("omits average HR when avg_hr is null", () => {
      fc.assert(
        fc.property(
          arbDiscipline,
          arbActivityName,
          arbISODate,
          arbDuration,
          arbDistance,
          (discipline, name, startTime, duration, distance) => {
            const activity = buildActivity({
              discipline,
              name,
              start_time: startTime,
              duration_seconds: duration,
              distance_meters: distance,
              avg_hr: 0, // placeholder, will override
            });
            activity.avg_hr = null;

            const { queryByText, getByText } = render(
              <ActivityListItem activity={activity} onPress={noop} />
            );

            // Core fields still present
            const meta = getDisciplineMeta(discipline, false);
            expect(getByText(meta.icon)).toBeTruthy();
            expect(getByText(name)).toBeTruthy();
            expect(getByText(formatDate(startTime))).toBeTruthy();
            expect(getByText(formatDuration(duration))).toBeTruthy();
            expect(getByText(expectedDistanceKm(distance))).toBeTruthy();

            // HR should NOT be rendered
            expect(queryByText(/bpm/)).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("shows 'Untitled Activity' when name is null", () => {
      fc.assert(
        fc.property(
          arbDiscipline,
          arbISODate,
          arbDuration,
          (discipline, startTime, duration) => {
            const activity = buildActivity({
              discipline,
              name: "placeholder",
              start_time: startTime,
              duration_seconds: duration,
              distance_meters: 5000,
              avg_hr: 140,
            });
            activity.name = null;

            const { getByText } = render(
              <ActivityListItem activity={activity} onPress={noop} />
            );

            expect(getByText("Untitled Activity")).toBeTruthy();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
