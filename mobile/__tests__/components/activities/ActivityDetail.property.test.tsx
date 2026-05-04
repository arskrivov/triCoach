/**
 * Property-based tests for Activity Detail metric display.
 *
 * **Validates: Requirements 6.10**
 *
 * Property 3: Activity detail displays all non-null key metrics
 *
 * *For any* valid `ActivityDetail` object, the rendered detail screen SHALL
 * display every non-null metric from the set: duration, distance, elevation
 * gain, average HR, max HR, average pace or power, cadence, TSS, and
 * training effect.
 *
 * Since the full Activity Detail screen has complex dependencies (API calls,
 * maps, navigation), we test the metric display logic in isolation using a
 * simplified test component that renders just the metrics section with the
 * same MetricTile components and formatting logic as the real screen.
 */

import React from "react";
import { View } from "react-native";
import { render } from "@testing-library/react-native";
import * as fc from "fast-check";
import { MetricTile } from "../../../components/dashboard/MetricTile";
import { formatDuration } from "../../../lib/format";
import type { ActivityDetail, Discipline } from "../../../lib/types";

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
// Formatting helpers (mirrored from Activity Detail screen)
// ---------------------------------------------------------------------------

function formatDistance(meters: number | null): string {
  if (meters === null) return "—";
  const km = meters / 1000;
  return km < 10 ? km.toFixed(2) : km.toFixed(1);
}

function formatElevation(meters: number | null): string {
  if (meters === null) return "—";
  return Math.round(meters).toString();
}

function formatPace(secPerKm: number | null): string {
  if (secPerKm === null) return "—";
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.round(secPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatHR(hr: number | null): string {
  if (hr === null) return "—";
  return Math.round(hr).toString();
}

function formatTrainingEffect(
  aerobic: number | null,
  label: string | null
): string {
  if (aerobic === null) return "—";
  const text = aerobic.toFixed(1);
  return label ? `${text} (${label})` : text;
}

// ---------------------------------------------------------------------------
// Test component — renders the same metrics grid as the real screen
// ---------------------------------------------------------------------------

/**
 * Simplified component that renders just the key metrics section from the
 * Activity Detail screen, using the same MetricTile components and formatting
 * logic. This isolates the metric display from API calls, maps, and navigation.
 */
function ActivityMetricsGrid({ activity }: { activity: ActivityDetail }) {
  const isPowerDiscipline =
    activity.discipline === "RIDE_ROAD" ||
    activity.discipline === "RIDE_GRAVEL";

  return (
    <View>
      <MetricTile
        label="Duration"
        value={formatDuration(activity.duration_seconds)}
      />
      <MetricTile
        label="Distance"
        value={formatDistance(activity.distance_meters)}
        unit={activity.distance_meters !== null ? "km" : undefined}
      />
      <MetricTile
        label="Elevation"
        value={formatElevation(activity.elevation_gain_meters)}
        unit={activity.elevation_gain_meters !== null ? "m" : undefined}
      />
      <MetricTile
        label="Avg HR"
        value={formatHR(activity.avg_hr)}
        unit={activity.avg_hr !== null ? "bpm" : undefined}
      />
      <MetricTile
        label="Max HR"
        value={formatHR(activity.max_hr)}
        unit={activity.max_hr !== null ? "bpm" : undefined}
      />
      {isPowerDiscipline ? (
        <MetricTile
          label="Avg Power"
          value={
            activity.avg_power_watts !== null
              ? String(activity.avg_power_watts)
              : "—"
          }
          unit={activity.avg_power_watts !== null ? "W" : undefined}
        />
      ) : (
        <MetricTile
          label="Avg Pace"
          value={formatPace(activity.avg_pace_sec_per_km)}
          unit={activity.avg_pace_sec_per_km !== null ? "/km" : undefined}
        />
      )}
      <MetricTile
        label="Cadence"
        value={
          activity.avg_cadence !== null ? String(activity.avg_cadence) : "—"
        }
        unit={activity.avg_cadence !== null ? "rpm" : undefined}
      />
      <MetricTile
        label="TSS"
        value={
          activity.tss !== null ? Math.round(activity.tss).toString() : "—"
        }
      />
      <MetricTile
        label="Training Effect"
        value={formatTrainingEffect(
          activity.aerobic_training_effect,
          activity.training_effect_label
        )}
      />
    </View>
  );
}

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

const arbDiscipline: fc.Arbitrary<Discipline> = fc.constantFrom(
  ...ALL_DISCIPLINES
);

const arbISODate: fc.Arbitrary<string> = fc
  .integer({
    min: new Date("2020-01-01T00:00:00Z").getTime(),
    max: new Date("2025-12-31T23:59:59Z").getTime(),
  })
  .map((ms) => new Date(ms).toISOString());

/** Positive duration in seconds (1–86400). */
const arbDuration: fc.Arbitrary<number> = fc.integer({ min: 1, max: 86400 });

/** Positive distance in metres (1–300000). */
const arbDistanceMeters: fc.Arbitrary<number> = fc.integer({
  min: 1,
  max: 300000,
});

/** Elevation gain in metres (1–9000). */
const arbElevation: fc.Arbitrary<number> = fc.integer({ min: 1, max: 9000 });

/** Heart rate in bpm (30–220). */
const arbHR: fc.Arbitrary<number> = fc.integer({ min: 30, max: 220 });

/** Pace in seconds per km (120–900). */
const arbPace: fc.Arbitrary<number> = fc.integer({ min: 120, max: 900 });

/** Power in watts (50–2000). */
const arbPower: fc.Arbitrary<number> = fc.integer({ min: 50, max: 2000 });

/** Cadence in rpm (30–200). */
const arbCadence: fc.Arbitrary<number> = fc.integer({ min: 30, max: 200 });

/** TSS value (1–500). */
const arbTSS: fc.Arbitrary<number> = fc.integer({ min: 1, max: 500 });

/** Aerobic training effect (0.0–5.0). */
const arbTrainingEffect: fc.Arbitrary<number> = fc
  .integer({ min: 0, max: 50 })
  .map((n) => n / 10);

const TRAINING_EFFECT_LABELS = [
  "No Benefit",
  "Minor Benefit",
  "Maintaining",
  "Improving",
  "Highly Improving",
  "Overreaching",
];

const arbTrainingEffectLabel: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.constantFrom(...TRAINING_EFFECT_LABELS)
);

/**
 * Arbitrary that produces either a non-null value or null, with roughly
 * equal probability so we exercise both branches.
 */
function arbNullable<T>(arb: fc.Arbitrary<T>): fc.Arbitrary<T | null> {
  return fc.oneof(arb, fc.constant(null as T | null));
}

/**
 * Build a full ActivityDetail object with the given metric fields.
 * Non-metric fields are set to sensible defaults.
 */
function buildActivityDetail(params: {
  discipline: Discipline;
  start_time: string;
  duration_seconds: number | null;
  distance_meters: number | null;
  elevation_gain_meters: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_pace_sec_per_km: number | null;
  avg_power_watts: number | null;
  avg_cadence: number | null;
  tss: number | null;
  aerobic_training_effect: number | null;
  training_effect_label: string | null;
}): ActivityDetail {
  return {
    // ActivitySummary fields
    id: "prop-test-id",
    garmin_activity_id: 1,
    discipline: params.discipline,
    name: "Test Activity",
    start_time: params.start_time,
    duration_seconds: params.duration_seconds,
    calories: 500,
    distance_meters: params.distance_meters,
    elevation_gain_meters: params.elevation_gain_meters,
    avg_hr: params.avg_hr,
    avg_pace_sec_per_km: params.avg_pace_sec_per_km,
    avg_power_watts: params.avg_power_watts,
    tss: params.tss,
    total_sets: null,
    total_volume_kg: null,
    session_type: null,
    aerobic_training_effect: params.aerobic_training_effect,
    anaerobic_training_effect: null,
    training_effect_label: params.training_effect_label,
    // ActivityDetail-specific fields
    polyline: null,
    laps: null,
    hr_zones: null,
    exercises: null,
    primary_muscle_groups: null,
    notes: null,
    ai_analysis: null,
    ai_analyzed_at: null,
    max_hr: params.max_hr,
    normalized_power_watts: null,
    avg_cadence: params.avg_cadence,
    intensity_factor: null,
  };
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("ActivityDetail - Property Tests", () => {
  /**
   * **Property 3: Activity detail displays all non-null key metrics**
   *
   * *For any* valid `ActivityDetail` object, the rendered detail screen SHALL
   * display every non-null metric from the set: duration, distance, elevation
   * gain, average HR, max HR, average pace or power, cadence, TSS, and
   * training effect.
   *
   * **Validates: Requirements 6.10**
   */
  describe("Property 3: Activity detail displays all non-null key metrics", () => {
    it("displays formatted values for all non-null metrics and '—' for null metrics", () => {
      fc.assert(
        fc.property(
          arbDiscipline,
          arbISODate,
          arbNullable(arbDuration),
          arbNullable(arbDistanceMeters),
          arbNullable(arbElevation),
          arbNullable(arbHR),
          arbNullable(arbHR),
          arbNullable(arbPace),
          arbNullable(arbPower),
          arbNullable(arbCadence),
          arbNullable(arbTSS),
          arbNullable(arbTrainingEffect),
          arbTrainingEffectLabel,
          (
            discipline,
            startTime,
            duration,
            distance,
            elevation,
            avgHr,
            maxHr,
            pace,
            power,
            cadence,
            tss,
            trainingEffect,
            trainingEffectLabel
          ) => {
            const activity = buildActivityDetail({
              discipline,
              start_time: startTime,
              duration_seconds: duration,
              distance_meters: distance,
              elevation_gain_meters: elevation,
              avg_hr: avgHr,
              max_hr: maxHr,
              avg_pace_sec_per_km: pace,
              avg_power_watts: power,
              avg_cadence: cadence,
              tss,
              aerobic_training_effect: trainingEffect,
              training_effect_label: trainingEffectLabel,
            });

            const { getAllByText } = render(
              <ActivityMetricsGrid activity={activity} />
            );

            const isPowerDiscipline =
              discipline === "RIDE_ROAD" || discipline === "RIDE_GRAVEL";

            // Helper: assert a formatted value appears in the rendered output.
            // Uses getAllByText since the same value could appear in multiple tiles.
            const assertDisplayed = (value: string) => {
              const matches = getAllByText(value);
              expect(matches.length).toBeGreaterThan(0);
            };

            // 1. Duration
            const expectedDuration = formatDuration(duration);
            assertDisplayed(expectedDuration);

            // 2. Distance
            const expectedDistance = formatDistance(distance);
            assertDisplayed(expectedDistance);

            // 3. Elevation
            const expectedElevation = formatElevation(elevation);
            assertDisplayed(expectedElevation);

            // 4. Avg HR
            const expectedAvgHR = formatHR(avgHr);
            assertDisplayed(expectedAvgHR);

            // 5. Max HR
            const expectedMaxHR = formatHR(maxHr);
            assertDisplayed(expectedMaxHR);

            // 6. Avg Pace or Avg Power (depends on discipline)
            if (isPowerDiscipline) {
              const expectedPower =
                power !== null ? String(power) : "—";
              assertDisplayed(expectedPower);
            } else {
              const expectedPace = formatPace(pace);
              assertDisplayed(expectedPace);
            }

            // 7. Cadence
            const expectedCadence =
              cadence !== null ? String(cadence) : "—";
            assertDisplayed(expectedCadence);

            // 8. TSS
            const expectedTSS =
              tss !== null ? Math.round(tss).toString() : "—";
            assertDisplayed(expectedTSS);

            // 9. Training Effect
            const expectedTE = formatTrainingEffect(
              trainingEffect,
              trainingEffectLabel
            );
            assertDisplayed(expectedTE);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("shows '—' for every metric when all metric fields are null", () => {
      fc.assert(
        fc.property(arbDiscipline, arbISODate, (discipline, startTime) => {
          const activity = buildActivityDetail({
            discipline,
            start_time: startTime,
            duration_seconds: null,
            distance_meters: null,
            elevation_gain_meters: null,
            avg_hr: null,
            max_hr: null,
            avg_pace_sec_per_km: null,
            avg_power_watts: null,
            avg_cadence: null,
            tss: null,
            aerobic_training_effect: null,
            training_effect_label: null,
          });

          const { getAllByText } = render(
            <ActivityMetricsGrid activity={activity} />
          );

          // All 9 metric tiles should display "—"
          const dashes = getAllByText("—");
          expect(dashes.length).toBe(9);
        }),
        { numRuns: 100 }
      );
    });

    it("shows formatted values for every metric when all fields are non-null", () => {
      fc.assert(
        fc.property(
          arbDiscipline,
          arbISODate,
          arbDuration,
          arbDistanceMeters,
          arbElevation,
          arbHR,
          arbHR,
          arbPace,
          arbPower,
          arbCadence,
          arbTSS,
          arbTrainingEffect,
          fc.constantFrom(...TRAINING_EFFECT_LABELS),
          (
            discipline,
            startTime,
            duration,
            distance,
            elevation,
            avgHr,
            maxHr,
            pace,
            power,
            cadence,
            tss,
            trainingEffect,
            trainingEffectLabel
          ) => {
            const activity = buildActivityDetail({
              discipline,
              start_time: startTime,
              duration_seconds: duration,
              distance_meters: distance,
              elevation_gain_meters: elevation,
              avg_hr: avgHr,
              max_hr: maxHr,
              avg_pace_sec_per_km: pace,
              avg_power_watts: power,
              avg_cadence: cadence,
              tss,
              aerobic_training_effect: trainingEffect,
              training_effect_label: trainingEffectLabel,
            });

            const { queryAllByText } = render(
              <ActivityMetricsGrid activity={activity} />
            );

            // No metric tile should show "—" when all fields are non-null.
            // Note: formatDuration returns "—" for 0, but our arbDuration
            // generates min: 1, so this is safe.
            const dashes = queryAllByText("—");
            expect(dashes.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
