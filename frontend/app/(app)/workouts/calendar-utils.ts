// Pure utility functions for the monthly calendar view.
// No React dependencies — all functions are side-effect free.

// ---------------------------------------------------------------------------
// Minimal interfaces so this module doesn't depend on page-local types
// ---------------------------------------------------------------------------

interface HasScheduledDate {
  scheduled_date: string | null;
}

interface HasTargetDate {
  target_date: string | null;
}

// ---------------------------------------------------------------------------
// Calendar grid helpers
// ---------------------------------------------------------------------------

/**
 * Return the Monday on or before the given date (ISO week, Monday = 1).
 * The returned Date has the same time-of-day as the input.
 */
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, …, 6 = Saturday
  // Shift so Monday = 0: (day + 6) % 7 gives days since Monday
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

/**
 * Generate the full grid of dates for a month view.
 *
 * Returns 4–6 rows of 7 dates each (Mon–Sun). The grid always starts on the
 * Monday on or before the 1st of the month and ends on the Sunday on or after
 * the last day of the month.
 *
 * @param year  Full year (e.g. 2025)
 * @param month 0-indexed month (0 = January, 11 = December)
 */
export function getCalendarGrid(year: number, month: number): Date[][] {
  // First day of the target month
  const firstOfMonth = new Date(year, month, 1);
  // Start from the Monday on or before the 1st
  const start = getMonday(firstOfMonth);

  // Last day of the target month
  const lastOfMonth = new Date(year, month + 1, 0);

  const grid: Date[][] = [];
  const cursor = new Date(start);

  // Generate rows until we've passed the last day of the month
  // and completed the current week (Sunday)
  while (true) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    grid.push(week);

    // Stop once we've covered the last day of the month
    // (the week we just pushed contains or is past lastOfMonth)
    if (week[6] >= lastOfMonth) break;
  }

  return grid;
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

/**
 * Format a Date as `YYYY-MM-DD` for use as a lookup key.
 */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Lookup map builders
// ---------------------------------------------------------------------------

/**
 * Group items by their `scheduled_date`, skipping entries with null dates.
 * Returns a record keyed by `YYYY-MM-DD`.
 */
export function buildWorkoutMap<T extends HasScheduledDate>(
  workouts: T[],
): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const w of workouts) {
    if (w.scheduled_date == null) continue;
    const key = w.scheduled_date;
    if (!map[key]) map[key] = [];
    map[key].push(w);
  }
  return map;
}

/**
 * Group items by their `target_date`, skipping entries with null dates.
 * Returns a record keyed by `YYYY-MM-DD`.
 */
export function buildRaceMap<T extends HasTargetDate>(
  races: T[],
): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const r of races) {
    if (r.target_date == null) continue;
    const key = r.target_date;
    if (!map[key]) map[key] = [];
    map[key].push(r);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Duration formatting
// ---------------------------------------------------------------------------

/**
 * Format a duration in seconds as a compact string: `"Xh"`, `"XhYm"`, or `"Xm"`.
 *
 * Returns `""` for null, zero, or negative values.
 */
export function formatDurationCompact(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "";

  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes <= 0) return "";

  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  if (h > 0 && m > 0) return `${h}h${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// ---------------------------------------------------------------------------
// Date comparison helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a `YYYY-MM-DD` date string is before today (local time).
 */
export function isDatePast(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr + "T00:00:00");
  return date < today;
}

/**
 * Check whether a `YYYY-MM-DD` date string is today (local time).
 */
export function isDateToday(dateStr: string): boolean {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return dateStr === `${y}-${m}-${d}`;
}
