/**
 * MonthlyCalendar — Full month grid for displaying training plan workouts.
 *
 * Shows a 7-column grid (Mon–Sun) with 4–6 rows for weeks. Each day cell
 * displays the day number, small coloured dots for workouts, race markers
 * (🏁), and completion status indicators:
 *
 * - All workouts completed → green dot
 * - Some workouts completed → amber dot
 * - No workouts completed → no status dot
 *
 * Provides month navigation (← previous, → next) and a month/year label.
 *
 * @see Requirements 8.7
 */

import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { useThemeColors, useColorSchemeName, type ThemeColors } from "@/lib/theme";
import { getDisciplineMeta } from "@/lib/format";
import type { Goal, PlanWorkout, WorkoutStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Day header labels (Mon–Sun). */
const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Month names for the header label. */
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Represents a single day cell in the month grid. */
export interface DayCell {
  /** Date string in YYYY-MM-DD format, or null for padding cells. */
  date: string | null;
  /** Day of the month (1–31), or 0 for padding cells. */
  dayNumber: number;
  /** Whether this day belongs to the displayed month. */
  isCurrentMonth: boolean;
}

/**
 * Build the grid of day cells for a given month.
 * The grid always starts on Monday and ends on Sunday, padding with
 * days from the previous/next month as needed.
 *
 * @returns A flat array of DayCell objects (length is always a multiple of 7).
 */
export function buildMonthGrid(year: number, month: number): DayCell[] {
  const cells: DayCell[] = [];

  // First day of the month
  const firstDay = new Date(year, month, 1);
  // Day of week: JS getDay() returns 0=Sun, we need 0=Mon
  const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon … 6=Sun

  // Days in this month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Pad leading days from previous month
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const prevDate = new Date(year, month - 1, d);
    cells.push({
      date: formatDateKey(prevDate),
      dayNumber: d,
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({
      date: formatDateKey(date),
      dayNumber: d,
      isCurrentMonth: true,
    });
  }

  // Pad trailing days from next month
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d);
      cells.push({
        date: formatDateKey(nextDate),
        dayNumber: d,
        isCurrentMonth: false,
      });
    }
  }

  return cells;
}

/**
 * Format a Date object as a YYYY-MM-DD string.
 */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Index workouts by their scheduled_date (YYYY-MM-DD).
 */
export function indexWorkoutsByDate(
  workouts: PlanWorkout[]
): Map<string, PlanWorkout[]> {
  const map = new Map<string, PlanWorkout[]>();
  for (const w of workouts) {
    if (!w.scheduled_date) continue;
    // scheduled_date may be ISO datetime or YYYY-MM-DD; take first 10 chars
    const key = w.scheduled_date.slice(0, 10);
    const existing = map.get(key);
    if (existing) {
      existing.push(w);
    } else {
      map.set(key, [w]);
    }
  }
  return map;
}

/**
 * Index races by their target_date (YYYY-MM-DD).
 */
export function indexRacesByDate(races: Goal[]): Set<string> {
  const set = new Set<string>();
  for (const r of races) {
    if (r.target_date) {
      set.add(r.target_date.slice(0, 10));
    }
  }
  return set;
}

/**
 * Determine the completion status for a day's workouts.
 *
 * @returns "all" if every workout is completed, "partial" if some are,
 *          or "none" if none are completed (or no workouts exist).
 */
export function getDayCompletionStatus(
  workouts: PlanWorkout[],
  getWorkoutStatus: (workout: PlanWorkout) => WorkoutStatus
): "all" | "partial" | "none" {
  if (workouts.length === 0) return "none";

  let completedCount = 0;
  for (const w of workouts) {
    if (getWorkoutStatus(w) === "completed") {
      completedCount++;
    }
  }

  if (completedCount === workouts.length) return "all";
  if (completedCount > 0) return "partial";
  return "none";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface MonthlyCalendarProps {
  /** All workouts in the plan (filtered to visible range by parent). */
  workouts: PlanWorkout[];
  /** Active races/goals to mark on the calendar. */
  races: Goal[];
  /** Plan start date (YYYY-MM-DD) — used for range context. */
  startDate: string;
  /** Plan end date (YYYY-MM-DD) — used for range context. */
  endDate: string;
  /** The month currently being displayed. */
  currentMonth: Date;
  /** Callback when the user navigates to a different month. */
  onMonthChange: (date: Date) => void;
  /** Callback when the user taps a day cell. */
  onDayPress: (date: string) => void;
  /** Resolve the display status for a given workout. */
  getWorkoutStatus: (workout: PlanWorkout) => WorkoutStatus;
  /** Optional style overrides for the outer container. */
  style?: ViewStyle;
}

export function MonthlyCalendar({
  workouts,
  races,
  startDate,
  endDate,
  currentMonth,
  onMonthChange,
  onDayPress,
  getWorkoutStatus,
  style,
}: MonthlyCalendarProps) {
  const colors = useThemeColors();
  const isDark = useColorSchemeName() === "dark";

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // Build grid and indexes
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const workoutIndex = useMemo(() => indexWorkoutsByDate(workouts), [workouts]);
  const raceIndex = useMemo(() => indexRacesByDate(races), [races]);

  // Split grid into rows of 7
  const rows = useMemo(() => {
    const result: DayCell[][] = [];
    for (let i = 0; i < grid.length; i += 7) {
      result.push(grid.slice(i, i + 7));
    }
    return result;
  }, [grid]);

  // Navigation handlers
  const goToPrevMonth = () => {
    onMonthChange(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    onMonthChange(new Date(year, month + 1, 1));
  };

  const monthLabel = `${MONTH_NAMES[month]} ${year}`;

  return (
    <View style={[styles.container, style]}>
      {/* Month navigation header */}
      <View style={styles.navRow}>
        <Pressable
          onPress={goToPrevMonth}
          style={[styles.navButton, { backgroundColor: colors.muted }]}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Text style={[styles.navButtonText, { color: colors.foreground }]}>
            ←
          </Text>
        </Pressable>

        <View style={styles.monthLabelContainer}>
          <Text style={[styles.monthLabel, { color: colors.foreground }]}>
            {monthLabel}
          </Text>
        </View>

        <Pressable
          onPress={goToNextMonth}
          style={[styles.navButton, { backgroundColor: colors.muted }]}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Text style={[styles.navButtonText, { color: colors.foreground }]}>
            →
          </Text>
        </Pressable>
      </View>

      {/* Day-of-week headers */}
      <View style={styles.headerRow}>
        {DAY_HEADERS.map((label) => (
          <View key={label} style={styles.headerCell}>
            <Text
              style={[styles.headerText, { color: colors.mutedForeground }]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.weekRow}>
          {row.map((cell, cellIndex) => {
            const dayWorkouts = cell.date
              ? workoutIndex.get(cell.date) ?? []
              : [];
            const hasRace = cell.date ? raceIndex.has(cell.date) : false;
            const completion = getDayCompletionStatus(
              dayWorkouts,
              getWorkoutStatus
            );

            const todayStr = formatDateKey(new Date());
            const isToday = cell.date === todayStr;

            return (
              <Pressable
                key={cellIndex}
                onPress={() => cell.date && onDayPress(cell.date)}
                disabled={!cell.date}
                style={[
                  styles.dayCell,
                  {
                    backgroundColor: isToday
                      ? colors.muted
                      : "transparent",
                    borderColor: colors.cardBorder,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  cell.date
                    ? `${cell.dayNumber}, ${dayWorkouts.length} workouts${hasRace ? ", race day" : ""}`
                    : undefined
                }
              >
                {/* Day number */}
                <Text
                  style={[
                    styles.dayNumber,
                    {
                      color: cell.isCurrentMonth
                        ? colors.foreground
                        : colors.mutedForeground,
                      fontWeight: isToday ? "800" : "500",
                    },
                  ]}
                >
                  {cell.dayNumber > 0 ? cell.dayNumber : ""}
                </Text>

                {/* Indicators row */}
                <View style={styles.indicatorRow}>
                  {/* Workout dots (max 3 visible, then +N) */}
                  {dayWorkouts.slice(0, 3).map((w, i) => {
                    const meta = getDisciplineMeta(w.discipline, isDark);
                    return (
                      <View
                        key={w.id ?? i}
                        style={[
                          styles.workoutDot,
                          { backgroundColor: meta.color },
                        ]}
                      />
                    );
                  })}
                  {dayWorkouts.length > 3 && (
                    <Text
                      style={[
                        styles.overflowText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      +{dayWorkouts.length - 3}
                    </Text>
                  )}
                </View>

                {/* Bottom row: race marker + completion status */}
                <View style={styles.bottomIndicators}>
                  {hasRace && <Text style={styles.raceMarker}>🏁</Text>}
                  {completion === "all" && (
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: colors.statusPositive },
                      ]}
                    />
                  )}
                  {completion === "partial" && (
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: colors.statusCaution },
                      ]}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  navButton: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  navButtonText: {
    fontSize: 18,
    fontWeight: "600",
  },
  monthLabelContainer: {
    flex: 1,
    alignItems: "center",
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  headerRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  headerCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  headerText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  weekRow: {
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    minHeight: 56,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    alignItems: "center",
  },
  dayNumber: {
    fontSize: 13,
    marginBottom: 2,
  },
  indicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minHeight: 10,
  },
  workoutDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  overflowText: {
    fontSize: 8,
    fontWeight: "600",
    marginLeft: 1,
  },
  bottomIndicators: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 14,
  },
  raceMarker: {
    fontSize: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
