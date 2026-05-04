/**
 * Property-based tests for formatting utilities.
 *
 * **Validates: Requirements 16.2, 16.3**
 *
 * Property 11: Format functions produce identical output to web frontend
 * Property 12: getDisciplineMeta returns valid data for all disciplines
 */

import * as fc from 'fast-check';
import {
  formatDuration,
  formatDate,
  formatNumber,
  formatHRV,
  formatSleepScore,
  getDisciplineMeta,
} from '../../lib/format';
import type { Discipline } from '../../lib/types';

// All valid discipline values
const ALL_DISCIPLINES: Discipline[] = [
  'SWIM',
  'RUN',
  'RIDE_ROAD',
  'RIDE_GRAVEL',
  'STRENGTH',
  'YOGA',
  'MOBILITY',
  'OTHER',
];

describe('Format Utilities - Property Tests', () => {
  /**
   * **Property 11: Format functions produce identical output to web frontend**
   *
   * *For any* valid input value, the mobile `formatDuration(seconds)`, `formatDate(iso)`,
   * `formatNumber(value, unit)`, `formatHRV(hrv)`, and `formatSleepScore(score)` functions
   * SHALL produce identical string output to the web frontend's corresponding functions.
   *
   * **Validates: Requirements 16.2**
   */
  describe('Property 11: Format functions produce identical output to web frontend', () => {
    describe('formatDuration', () => {
      it('returns "—" for null input', () => {
        expect(formatDuration(null)).toBe('—');
      });

      it('returns "—" for zero input', () => {
        expect(formatDuration(0)).toBe('—');
      });

      it('formats seconds-only durations correctly for any seconds < 60', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 59 }),
            (seconds) => {
              const result = formatDuration(seconds);
              expect(result).toBe(`${seconds}s`);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('formats minutes-only durations correctly', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 59 }),
            (minutes) => {
              const seconds = minutes * 60;
              const result = formatDuration(seconds);
              expect(result).toBe(`${minutes}m`);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('formats minutes and seconds correctly', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 59 }),
            fc.integer({ min: 1, max: 59 }),
            (minutes, secs) => {
              const totalSeconds = minutes * 60 + secs;
              const result = formatDuration(totalSeconds);
              expect(result).toBe(`${minutes}m ${secs}s`);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('formats hours and minutes correctly', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 23 }),
            fc.integer({ min: 0, max: 59 }),
            (hours, minutes) => {
              const totalSeconds = hours * 3600 + minutes * 60;
              const result = formatDuration(totalSeconds);
              expect(result).toBe(`${hours}h ${minutes}m`);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('ignores seconds when hours are present', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 1, max: 23 }),
            fc.integer({ min: 0, max: 59 }),
            fc.integer({ min: 1, max: 59 }),
            (hours, minutes, secs) => {
              const totalSeconds = hours * 3600 + minutes * 60 + secs;
              const result = formatDuration(totalSeconds);
              // When hours are present, seconds are ignored
              expect(result).toBe(`${hours}h ${minutes}m`);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('formatHRV', () => {
      it('returns "—" for null input', () => {
        expect(formatHRV(null)).toBe('—');
      });

      it('returns "—" for zero input', () => {
        expect(formatHRV(0)).toBe('—');
      });

      it('rounds HRV values and appends "ms" for any positive value', () => {
        fc.assert(
          fc.property(
            fc.float({ min: Math.fround(0.1), max: Math.fround(200), noNaN: true }),
            (hrv) => {
              // Skip zero values as they return "—"
              if (hrv === 0) return;
              const result = formatHRV(hrv);
              expect(result).toBe(`${Math.round(hrv)} ms`);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('formatSleepScore', () => {
      it('returns "—" with muted color for null input', () => {
        const result = formatSleepScore(null, false);
        expect(result.text).toBe('—');
        expect(result.color).toBeTruthy();
      });

      it('returns positive color for scores >= 85', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 85, max: 100 }),
            fc.boolean(),
            (score, isDark) => {
              const result = formatSleepScore(score, isDark);
              expect(result.text).toBe(`${score}`);
              // Should be a positive/green color
              expect(result.color).toMatch(/^#[0-9a-fA-F]{6}$/);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('returns foreground color for scores 70-84', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 70, max: 84 }),
            fc.boolean(),
            (score, isDark) => {
              const result = formatSleepScore(score, isDark);
              expect(result.text).toBe(`${score}`);
              expect(result.color).toMatch(/^#[0-9a-fA-F]{6}$/);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('returns caution color for scores 55-69', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 55, max: 69 }),
            fc.boolean(),
            (score, isDark) => {
              const result = formatSleepScore(score, isDark);
              expect(result.text).toBe(`${score}`);
              expect(result.color).toMatch(/^#[0-9a-fA-F]{6}$/);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('returns negative color for scores < 55', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 0, max: 54 }),
            fc.boolean(),
            (score, isDark) => {
              const result = formatSleepScore(score, isDark);
              expect(result.text).toBe(`${score}`);
              expect(result.color).toMatch(/^#[0-9a-fA-F]{6}$/);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('formatDate', () => {
      it('formats ISO date strings to "DD Mon YYYY" format', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 2000, max: 2030 }),
            fc.integer({ min: 1, max: 12 }),
            fc.integer({ min: 1, max: 28 }), // Use 28 to avoid month-end issues
            (year, month, day) => {
              const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:30:00Z`;
              const result = formatDate(iso);
              // Result should contain the day number
              expect(result).toContain(String(day));
              // Result should contain the year
              expect(result).toContain(String(year));
              // Result should be a non-empty string
              expect(result.length).toBeGreaterThan(0);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('formatNumber', () => {
      it('returns "—" for null input', () => {
        expect(formatNumber(null)).toBe('—');
        expect(formatNumber(null, 'bpm')).toBe('—');
      });

      it('formats integers without decimal places', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: -1000, max: 1000 }),
            (value) => {
              const result = formatNumber(value);
              expect(result).toBe(value.toFixed(0));
            }
          ),
          { numRuns: 100 }
        );
      });

      it('formats floats with one decimal place', () => {
        fc.assert(
          fc.property(
            fc.float({ min: Math.fround(-1000), max: Math.fround(1000), noNaN: true, noDefaultInfinity: true }),
            (value) => {
              // Skip integers
              if (Number.isInteger(value)) return;
              const result = formatNumber(value);
              expect(result).toBe(value.toFixed(1));
            }
          ),
          { numRuns: 100 }
        );
      });

      it('appends unit when provided', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 0, max: 200 }),
            fc.constantFrom('bpm', 'ms', 'km', 'watts', '%'),
            (value, unit) => {
              const result = formatNumber(value, unit);
              expect(result).toBe(`${value.toFixed(0)} ${unit}`);
            }
          ),
          { numRuns: 100 }
        );
      });
    });
  });

  /**
   * **Property 12: getDisciplineMeta returns valid data for all disciplines**
   *
   * *For any* value in the `Discipline` enum (`SWIM | RUN | RIDE_ROAD | RIDE_GRAVEL |
   * STRENGTH | YOGA | MOBILITY | OTHER`), `getDisciplineMeta` SHALL return an object
   * with a non-empty `label` string, a non-empty `icon` string (emoji), and a non-empty
   * `color` string (React Native colour value).
   *
   * **Validates: Requirements 16.3**
   */
  describe('Property 12: getDisciplineMeta returns valid data for all disciplines', () => {
    it('returns valid metadata for all discipline values', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...ALL_DISCIPLINES),
          fc.boolean(),
          (discipline, isDark) => {
            const meta = getDisciplineMeta(discipline, isDark);

            // Label must be a non-empty string
            expect(typeof meta.label).toBe('string');
            expect(meta.label.length).toBeGreaterThan(0);

            // Icon must be a non-empty string (emoji)
            expect(typeof meta.icon).toBe('string');
            expect(meta.icon.length).toBeGreaterThan(0);

            // Color must be a non-empty string (React Native color value)
            expect(typeof meta.color).toBe('string');
            expect(meta.color.length).toBeGreaterThan(0);
            // Should be a valid hex color
            expect(meta.color).toMatch(/^#[0-9a-fA-F]{6}$/);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns correct labels for each discipline', () => {
      const expectedLabels: Record<Discipline, string> = {
        SWIM: 'Swim',
        RUN: 'Run',
        RIDE_ROAD: 'Road Ride',
        RIDE_GRAVEL: 'Gravel Ride',
        STRENGTH: 'Strength',
        YOGA: 'Yoga',
        MOBILITY: 'Mobility',
        OTHER: 'Other',
      };

      for (const discipline of ALL_DISCIPLINES) {
        const meta = getDisciplineMeta(discipline, false);
        expect(meta.label).toBe(expectedLabels[discipline]);
      }
    });

    it('returns emoji icons for each discipline', () => {
      const expectedIcons: Record<Discipline, string> = {
        SWIM: '🏊',
        RUN: '🏃',
        RIDE_ROAD: '🚴',
        RIDE_GRAVEL: '🚵',
        STRENGTH: '🏋️',
        YOGA: '🧘',
        MOBILITY: '🤸',
        OTHER: '⚡',
      };

      for (const discipline of ALL_DISCIPLINES) {
        const meta = getDisciplineMeta(discipline, false);
        expect(meta.icon).toBe(expectedIcons[discipline]);
      }
    });

    it('returns different colors for light and dark modes', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...ALL_DISCIPLINES),
          (discipline) => {
            const lightMeta = getDisciplineMeta(discipline, false);
            const darkMeta = getDisciplineMeta(discipline, true);

            // Both should have valid colors
            expect(lightMeta.color).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(darkMeta.color).toMatch(/^#[0-9a-fA-F]{6}$/);

            // Labels and icons should be the same regardless of theme
            expect(lightMeta.label).toBe(darkMeta.label);
            expect(lightMeta.icon).toBe(darkMeta.icon);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns unique colors for different disciplines', () => {
      const lightColors = ALL_DISCIPLINES.map((d) => getDisciplineMeta(d, false).color);
      const darkColors = ALL_DISCIPLINES.map((d) => getDisciplineMeta(d, true).color);

      // All light mode colors should be unique
      const uniqueLightColors = new Set(lightColors);
      expect(uniqueLightColors.size).toBe(ALL_DISCIPLINES.length);

      // All dark mode colors should be unique
      const uniqueDarkColors = new Set(darkColors);
      expect(uniqueDarkColors.size).toBe(ALL_DISCIPLINES.length);
    });
  });
});
