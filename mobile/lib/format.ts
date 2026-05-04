/**
 * Formatting utilities for TriCoach mobile app.
 * Ported from frontend/lib/format.ts with React Native colour adaptations.
 *
 * All formatting functions produce identical output to the web frontend for the same inputs.
 * Colour-returning functions return React Native colour values instead of Tailwind classes.
 *
 * @see Requirements 16.1, 16.2, 16.3
 */

import type { Discipline } from "./types";
import { lightColors, darkColors } from "./theme";

/**
 * Format a duration in seconds to a human-readable string.
 * Returns "—" when the value is null or zero.
 *
 * @example formatDuration(3661) // "1h 1m"
 * @example formatDuration(125) // "2m 5s"
 * @example formatDuration(45) // "45s"
 * @example formatDuration(null) // "—"
 */
export function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s > 0 ? `${s}s` : ""}`.trim();
  return `${s}s`;
}

/**
 * Format an HRV value in milliseconds.
 * Returns "—" when the value is null or zero.
 *
 * @example formatHRV(65.5) // "66 ms"
 * @example formatHRV(null) // "—"
 */
export function formatHRV(hrv: number | null): string {
  if (!hrv) return "—";
  return `${Math.round(hrv)} ms`;
}

/**
 * Result type for formatSleepScore with text and React Native colour value.
 */
export interface SleepScoreResult {
  /** Formatted score string or "—" for null */
  text: string;
  /** React Native colour value for the score */
  color: string;
}

/**
 * Format a sleep score with appropriate colour coding.
 * Returns React Native colour values instead of Tailwind classes.
 *
 * Score thresholds:
 * - 85+: positive (green)
 * - 70-84: neutral (foreground)
 * - 55-69: caution (amber)
 * - <55: negative (red)
 *
 * @param score Sleep score value (0-100) or null
 * @param isDark Whether dark mode is active (affects colour selection)
 * @returns Object with text and color properties
 *
 * @example formatSleepScore(90, false) // { text: "90", color: "#10b981" }
 * @example formatSleepScore(null, false) // { text: "—", color: "#737373" }
 */
export function formatSleepScore(
  score: number | null,
  isDark: boolean = false
): SleepScoreResult {
  const colors = isDark ? darkColors : lightColors;

  if (score === null) {
    return { text: "—", color: colors.mutedForeground };
  }
  if (score >= 85) {
    return { text: `${score}`, color: colors.statusPositive };
  }
  if (score >= 70) {
    return { text: `${score}`, color: colors.foreground };
  }
  if (score >= 55) {
    return { text: `${score}`, color: colors.statusCaution };
  }
  return { text: `${score}`, color: colors.statusNegative };
}

/**
 * Format an ISO date string to a human-readable format.
 *
 * @example formatDate("2024-01-15T10:30:00Z") // "15 Jan 2024"
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Discipline metadata with React Native colour values.
 */
export interface DisciplineMeta {
  /** Human-readable label */
  label: string;
  /** Emoji icon */
  icon: string;
  /** React Native colour value for the discipline */
  color: string;
}

/**
 * Get metadata for a discipline including label, emoji icon, and colour.
 * Returns React Native colour values instead of Tailwind classes.
 *
 * @param discipline The discipline enum value
 * @param isDark Whether dark mode is active (affects colour selection)
 * @returns Object with label, icon, and color properties
 *
 * @example getDisciplineMeta("RUN", false) // { label: "Run", icon: "🏃", color: "#f97316" }
 */
export function getDisciplineMeta(
  discipline: Discipline,
  isDark: boolean = false
): DisciplineMeta {
  const colors = isDark ? darkColors : lightColors;

  const meta: Record<Discipline, DisciplineMeta> = {
    RUN: { label: "Run", icon: "🏃", color: colors.disciplineRun },
    SWIM: { label: "Swim", icon: "🏊", color: colors.disciplineSwim },
    RIDE_ROAD: { label: "Road Ride", icon: "🚴", color: colors.disciplineRideRoad },
    RIDE_GRAVEL: { label: "Gravel Ride", icon: "🚵", color: colors.disciplineRideGravel },
    STRENGTH: { label: "Strength", icon: "🏋️", color: colors.disciplineStrength },
    YOGA: { label: "Yoga", icon: "🧘", color: colors.disciplineYoga },
    MOBILITY: { label: "Mobility", icon: "🤸", color: colors.disciplineMobility },
    OTHER: { label: "Other", icon: "⚡", color: colors.disciplineOther },
  };

  return meta[discipline] ?? meta.OTHER;
}

// ---------------------------------------------------------------------------
// Generic metric / trend / status utilities (consolidated from dashboard cards)
// ---------------------------------------------------------------------------

/**
 * Format a nullable number with an optional unit string.
 * Returns "—" when the value is null.
 *
 * @example formatNumber(65.5, "ms") // "65.5 ms"
 * @example formatNumber(65, "bpm") // "65 bpm"
 * @example formatNumber(null, "bpm") // "—"
 */
export function formatNumber(value: number | null, unit?: string): string {
  if (value === null) return "—";
  const rounded = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return unit ? `${rounded} ${unit}` : rounded;
}

/**
 * Format a date string for use as a chart axis label (e.g. "15 Jan").
 *
 * @example formatChartDate("2024-01-15") // "15 Jan"
 */
export function formatChartDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Return the React Native colour value for a metric trend direction.
 *
 * - "up"   → positive (green)
 * - "down" → negative (red)
 * - other  → muted foreground (neutral)
 *
 * @param direction Trend direction string
 * @param isDark Whether dark mode is active
 * @returns React Native colour value
 */
export function getTrendColor(direction: string, isDark: boolean = false): string {
  const colors = isDark ? darkColors : lightColors;

  if (direction === "up") return colors.statusPositive;
  if (direction === "down") return colors.statusNegative;
  return colors.mutedForeground;
}

/**
 * Return a human-readable label for a metric trend direction.
 *
 * - "up"     → "Improving"
 * - "down"   → "Softening"
 * - "stable" → "Stable"
 * - other    → "—"
 */
export function getTrendLabel(direction: string): string {
  if (direction === "up") return "Improving";
  if (direction === "down") return "Softening";
  if (direction === "stable") return "Stable";
  return "—";
}

/**
 * Recovery status colour result with background and text colours.
 */
export interface StatusColorResult {
  /** Background colour (with transparency applied via opacity) */
  backgroundColor: string;
  /** Text colour */
  textColor: string;
}

/**
 * Return the React Native colours for a recovery status string.
 * Returns both background and text colours for badge styling.
 *
 * Status mappings:
 * - "strong"   → positive (green)
 * - "strained" → negative (red)
 * - "steady"   → caution (amber)
 * - other      → muted (neutral)
 *
 * @param status Recovery status string
 * @param isDark Whether dark mode is active
 * @returns Object with backgroundColor and textColor
 */
export function getRecoveryStatusColor(
  status: string,
  isDark: boolean = false
): StatusColorResult {
  const colors = isDark ? darkColors : lightColors;

  const statusColors: Record<string, StatusColorResult> = {
    strong: {
      backgroundColor: colors.statusPositive,
      textColor: colors.statusPositive,
    },
    strained: {
      backgroundColor: colors.statusNegative,
      textColor: colors.statusNegative,
    },
    steady: {
      backgroundColor: colors.statusCaution,
      textColor: colors.statusCaution,
    },
  };

  return (
    statusColors[status] ?? {
      backgroundColor: colors.muted,
      textColor: colors.mutedForeground,
    }
  );
}

/**
 * Return the React Native colours for an activity status string.
 * Returns both background and text colours for badge styling.
 *
 * Status mappings:
 * - "building"     → positive (green)
 * - "overreaching" → negative (red)
 * - "idle"         → muted (neutral)
 * - "lighter"      → caution (amber)
 * - "steady"       → caution (amber)
 * - other          → muted (neutral)
 *
 * @param status Activity status string
 * @param isDark Whether dark mode is active
 * @returns Object with backgroundColor and textColor
 */
export function getActivityStatusColor(
  status: string,
  isDark: boolean = false
): StatusColorResult {
  const colors = isDark ? darkColors : lightColors;

  const statusColors: Record<string, StatusColorResult> = {
    building: {
      backgroundColor: colors.statusPositive,
      textColor: colors.statusPositive,
    },
    overreaching: {
      backgroundColor: colors.statusNegative,
      textColor: colors.statusNegative,
    },
    idle: {
      backgroundColor: colors.muted,
      textColor: colors.mutedForeground,
    },
    lighter: {
      backgroundColor: colors.statusCaution,
      textColor: colors.statusCaution,
    },
    steady: {
      backgroundColor: colors.statusCaution,
      textColor: colors.statusCaution,
    },
  };

  return (
    statusColors[status] ?? {
      backgroundColor: colors.muted,
      textColor: colors.mutedForeground,
    }
  );
}

/**
 * Delta badge result for week-over-week comparisons.
 */
export interface DeltaBadge {
  /** Formatted delta string including sign and unit (e.g. "+2.3 km"). */
  text: string;
  /** React Native colour value (positive for increase, negative for decrease). */
  color: string;
}

/**
 * Calculate a week-over-week delta badge for display.
 *
 * Returns null when both values are zero, or when the absolute difference
 * is below the threshold (default 0.05) to avoid showing noise.
 *
 * @param current Current period value
 * @param previous Previous period value
 * @param unit Optional unit string to append (e.g. " km")
 * @param threshold Minimum absolute difference to show (default 0.05)
 * @param isDark Whether dark mode is active
 * @returns Delta badge object or null if below threshold
 *
 * @example calculateDelta(12.5, 10.0, " km", 0.05, false) // { text: "+2.5 km", color: "#10b981" }
 * @example calculateDelta(0, 0, " km") // null
 */
export function calculateDelta(
  current: number,
  previous: number,
  unit?: string,
  threshold: number = 0.05,
  isDark: boolean = false
): DeltaBadge | null {
  const colors = isDark ? darkColors : lightColors;

  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  if (Math.abs(diff) < threshold) return null;
  const sign = diff > 0 ? "+" : "";
  const formatted = Number.isInteger(diff) ? diff.toFixed(0) : diff.toFixed(1);
  const text = unit ? `${sign}${formatted}${unit}` : `${sign}${formatted}`;
  return {
    text,
    color: diff > 0 ? colors.statusPositive : colors.statusNegative,
  };
}
