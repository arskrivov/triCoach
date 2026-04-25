import type { Discipline } from "./types";

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s > 0 ? `${s}s` : ""}`.trim();
  return `${s}s`;
}

export function formatPace(secPerKm: number | null): string {
  if (!secPerKm) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

export function formatDistance(meters: number | null): string {
  if (!meters) return "—";
  if (meters >= 500) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function formatSteps(steps: number | null): string {
  if (!steps) return "—";
  if (steps >= 1000) return `${(steps / 1000).toFixed(1)}k`;
  return `${steps}`;
}

export function formatCalories(kcal: number | null): string {
  if (!kcal) return "—";
  return `${kcal.toLocaleString()} kcal`;
}

export function formatHRV(hrv: number | null): string {
  if (!hrv) return "—";
  return `${Math.round(hrv)} ms`;
}

export function formatSleepScore(score: number | null): { text: string; color: string } {
  if (score === null) return { text: "—", color: "text-muted-foreground" };
  if (score >= 85) return { text: `${score}`, color: "text-[--status-positive]" };
  if (score >= 70) return { text: `${score}`, color: "text-foreground" };
  if (score >= 55) return { text: `${score}`, color: "text-[--status-caution]" };
  return { text: `${score}`, color: "text-[--status-negative]" };
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(iso);
}

const DISCIPLINE_META: Record<
  Discipline,
  { label: string; icon: string; color: string }
> = {
  RUN: { label: "Run", icon: "🏃", color: "bg-orange-500/15 text-orange-400" },
  SWIM: { label: "Swim", icon: "🏊", color: "bg-blue-500/15 text-blue-400" },
  RIDE_ROAD: { label: "Road Ride", icon: "🚴", color: "bg-violet-500/15 text-violet-400" },
  RIDE_GRAVEL: { label: "Gravel Ride", icon: "🚵", color: "bg-amber-500/15 text-amber-400" },
  STRENGTH: { label: "Strength", icon: "🏋️", color: "bg-rose-500/15 text-rose-400" },
  YOGA: { label: "Yoga", icon: "🧘", color: "bg-teal-500/15 text-teal-400" },
  MOBILITY: { label: "Mobility", icon: "🤸", color: "bg-cyan-500/15 text-cyan-400" },
  OTHER: { label: "Other", icon: "⚡", color: "bg-zinc-500/15 text-zinc-400" },
};

export function getDisciplineMeta(d: Discipline) {
  return DISCIPLINE_META[d] ?? DISCIPLINE_META.OTHER;
}

export function primaryStat(activity: {
  discipline: Discipline;
  distance_meters: number | null;
  avg_pace_sec_per_km: number | null;
  avg_power_watts: number | null;
  total_sets: number | null;
  total_volume_kg: number | null;
  duration_seconds: number | null;
  session_type: string | null;
}): string {
  const { discipline } = activity;
  if (["RUN", "SWIM", "RIDE_ROAD", "RIDE_GRAVEL"].includes(discipline)) {
    const dist = formatDistance(activity.distance_meters);
    const pace = discipline === "RUN" ? formatPace(activity.avg_pace_sec_per_km) : null;
    const power = activity.avg_power_watts ? `${activity.avg_power_watts}W` : null;
    return [dist, pace ?? power].filter(Boolean).join(" · ");
  }
  if (discipline === "STRENGTH") {
    const sets = activity.total_sets ? `${activity.total_sets} sets` : null;
    const vol = activity.total_volume_kg ? `${activity.total_volume_kg.toLocaleString()} kg` : null;
    return [sets, vol].filter(Boolean).join(" · ") || "—";
  }
  return activity.session_type?.replace(/_/g, " ") ?? formatDuration(activity.duration_seconds);
}

// ---------------------------------------------------------------------------
// Generic metric / trend / status utilities (consolidated from dashboard cards)
// ---------------------------------------------------------------------------

/**
 * Format a nullable number with an optional unit string.
 * Returns "—" when the value is null.
 *
 * @example formatNumber(65.5, "ms") // "65.5 ms"
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
 * Return the Tailwind text-colour class for a metric trend direction.
 *
 * - "up"   → emerald (positive)
 * - "down" → rose (negative)
 * - other  → zinc (neutral / unknown)
 */
export function getTrendColor(direction: string): string {
  if (direction === "up") return "text-[--status-positive]";
  if (direction === "down") return "text-[--status-negative]";
  return "text-muted-foreground";
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

/** Tailwind badge classes for each recovery status value. */
const RECOVERY_STATUS_COLORS: Record<string, string> = {
  strong: "bg-[--status-positive]/15 text-[--status-positive]",
  strained: "bg-[--status-negative]/15 text-[--status-negative]",
  steady: "bg-[--status-caution]/15 text-[--status-caution]",
};

/**
 * Return the Tailwind badge classes for a recovery status string.
 * Falls back to a neutral muted style for unknown values.
 */
export function getRecoveryStatusColor(status: string): string {
  return RECOVERY_STATUS_COLORS[status] ?? "bg-muted text-muted-foreground";
}

/** Tailwind badge classes for each activity status value. */
const ACTIVITY_STATUS_COLORS: Record<string, string> = {
  building: "bg-[--status-positive]/15 text-[--status-positive]",
  overreaching: "bg-[--status-negative]/15 text-[--status-negative]",
  idle: "bg-muted text-muted-foreground",
  lighter: "bg-[--status-caution]/15 text-[--status-caution]",
  steady: "bg-[--status-caution]/15 text-[--status-caution]",
};

/**
 * Return the Tailwind badge classes for an activity status string.
 * Falls back to a neutral muted style for unknown values.
 */
export function getActivityStatusColor(status: string): string {
  return ACTIVITY_STATUS_COLORS[status] ?? "bg-muted text-muted-foreground";
}

export interface DeltaBadge {
  /** Formatted delta string including sign and unit (e.g. "+2.3 km"). */
  text: string;
  /** Tailwind text-colour class (emerald for positive, rose for negative). */
  color: string;
}

/**
 * Calculate a week-over-week delta badge for display.
 *
 * Returns null when both values are zero, or when the absolute difference
 * is below the threshold (default 0.05) to avoid showing noise.
 *
 * @example
 * calculateDelta(12.5, 10.0, " km") // { text: "+2.5 km", color: "text-emerald-600" }
 * calculateDelta(0, 0, " km")       // null
 */
export function calculateDelta(
  current: number,
  previous: number,
  unit?: string,
  threshold = 0.05,
): DeltaBadge | null {
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  if (Math.abs(diff) < threshold) return null;
  const sign = diff > 0 ? "+" : "";
  const formatted = Number.isInteger(diff) ? diff.toFixed(0) : diff.toFixed(1);
  const text = unit ? `${sign}${formatted}${unit}` : `${sign}${formatted}`;
  return {
    text,
    color: diff > 0 ? "text-[--status-positive]" : "text-[--status-negative]",
  };
}
