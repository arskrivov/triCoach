/**
 * Property-based tests for AthleteProfileForm component.
 *
 * **Validates: Requirements 12.8**
 *
 * Property 7: Athlete profile source badges match field_sources
 *
 * *For any* AthleteProfile with a field_sources map, each rendered profile
 * field SHALL display a source badge ("Manual", "Garmin", or "Default")
 * matching the value in field_sources for that field's key.
 */

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import * as fc from "fast-check";
import {
  AthleteProfileForm,
  getSourceBadge,
} from "../../../components/account/AthleteProfileForm";
import type { AthleteProfile } from "../../../lib/types";

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
  }),
  lightColors: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    muted: "#f5f5f5",
    mutedForeground: "#737373",
    statusPositive: "#10b981",
    statusNegative: "#ef4444",
    statusCaution: "#f59e0b",
  },
  darkColors: {
    background: "#0a0a0a",
    foreground: "#fafafa",
    muted: "#262626",
    mutedForeground: "#a3a3a3",
    statusPositive: "#34d399",
    statusNegative: "#f87171",
    statusCaution: "#fbbf24",
  },
}));

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => "light",
}));

// Mock the API module — we control what the GET endpoint returns
const mockGet = jest.fn();
const mockPut = jest.fn();
jest.mock("../../../lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
}));

// ---------------------------------------------------------------------------
// Constants — all profile field keys that appear in the form
// ---------------------------------------------------------------------------

const PROFILE_FIELD_KEYS = [
  "weekly_training_hours",
  "mobility_sessions_per_week_target",
  "ftp_watts",
  "threshold_pace_sec_per_km",
  "swim_css_sec_per_100m",
  "max_hr",
  "resting_hr",
  "squat_1rm_kg",
  "deadlift_1rm_kg",
  "bench_1rm_kg",
  "overhead_press_1rm_kg",
  "weight_kg",
  "notes",
] as const;

type FieldSource = "manual" | "garmin" | "default";

const ALL_SOURCES: FieldSource[] = ["manual", "garmin", "default"];

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a field_sources map covering all profile field keys. */
const arbFieldSources: fc.Arbitrary<Record<string, FieldSource>> = fc
  .tuple(
    ...PROFILE_FIELD_KEYS.map(() => fc.constantFrom(...ALL_SOURCES))
  )
  .map((sources) => {
    const result: Record<string, FieldSource> = {};
    PROFILE_FIELD_KEYS.forEach((key, i) => {
      result[key] = sources[i];
    });
    return result;
  });

/** Build a complete AthleteProfile from a field_sources map. */
function buildProfile(
  fieldSources: Record<string, FieldSource>
): AthleteProfile {
  return {
    ftp_watts: 250,
    threshold_pace_sec_per_km: 270,
    swim_css_sec_per_100m: 95,
    max_hr: 185,
    resting_hr: 52,
    weight_kg: 75,
    squat_1rm_kg: 120,
    deadlift_1rm_kg: 160,
    bench_1rm_kg: 90,
    overhead_press_1rm_kg: 55,
    mobility_sessions_per_week_target: 3,
    weekly_training_hours: 12,
    notes: "Test notes",
    field_sources: fieldSources,
    garmin_values: {},
  };
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe("AthleteProfileForm - Property Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * **Property 7: Athlete profile source badges match field_sources**
   *
   * *For any* AthleteProfile with a field_sources map, each rendered profile
   * field SHALL display a source badge ("Manual", "Garmin", or "Default")
   * matching the value in field_sources for that field's key.
   *
   * **Validates: Requirements 12.8**
   */
  describe("Property 7: Athlete profile source badges match field_sources", () => {
    it("getSourceBadge maps every source value to the correct display label", () => {
      fc.assert(
        fc.property(
          fc.constantFrom<FieldSource>("manual", "garmin", "default"),
          (source) => {
            const badge = getSourceBadge(source);

            const expectedText: Record<FieldSource, string> = {
              manual: "Manual",
              garmin: "Garmin",
              default: "Default",
            };

            expect(badge.text).toBe(expectedText[source]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("for any field_sources map, every rendered badge text matches getSourceBadge", () => {
      fc.assert(
        fc.property(arbFieldSources, (fieldSources) => {
          // For each field key, the badge text derived from getSourceBadge
          // must match the expected label for the source in field_sources
          for (const key of PROFILE_FIELD_KEYS) {
            const source = fieldSources[key];
            const badge = getSourceBadge(source);

            const expectedLabels: Record<FieldSource, string> = {
              manual: "Manual",
              garmin: "Garmin",
              default: "Default",
            };

            expect(badge.text).toBe(expectedLabels[source]);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("rendered component displays correct source badges for a generated profile", async () => {
      // Generate a set of diverse field_sources maps and test rendering
      const samples = fc.sample(arbFieldSources, 10);

      for (const fieldSources of samples) {
        const profile = buildProfile(fieldSources);
        mockGet.mockResolvedValueOnce({ data: profile });

        const { getByTestId, unmount } = render(<AthleteProfileForm />);

        // Wait for the profile to load
        await waitFor(() => {
          getByTestId(`source-badge-${PROFILE_FIELD_KEYS[0]}`);
        });

        // Verify each field's source badge text
        for (const key of PROFILE_FIELD_KEYS) {
          const expectedBadge = getSourceBadge(fieldSources[key]);
          const badgeElement = getByTestId(`source-badge-${key}`);

          // Badge renders as View > Text — find the Text child
          const children = React.Children.toArray(badgeElement.props.children);
          const textChild = children.find(
            (child): child is React.ReactElement =>
              React.isValidElement(child) &&
              typeof child.props.children === "string"
          );

          expect(textChild).toBeTruthy();
          expect(textChild!.props.children).toBe(expectedBadge.text);
        }

        unmount();
      }
    }, 30000);
  });
});
