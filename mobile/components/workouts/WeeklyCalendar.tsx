/**
 * WeeklyCalendar — 7-day calendar grid for displaying a training plan week.
 *
 * Shows 7 day columns (Mon–Sun) with each day's workouts rendered as
 * WorkoutCard components. Provides week navigation (previous, next, today)
 * and displays the current week number out of total weeks.
 *
 * Workouts are placed into day columns based on their `plan_day` value:
 * 0 = Mon, 1 = Tue, 2 = Wed, 3 = Thu, 4 = Fri, 5 = Sat, 6 = Sun.
 *
 * Uses a horizontal ScrollView so all 7 columns are accessible on narrow
 * screens.
 *
 * @see Requirements 8.4, 8.5
 */

import React, { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { useThemeColors } from "@/lib/theme";
import type { PlanWorkout, WorkoutStatus } from "@/lib/types";
import { WorkoutCard } from "./WorkoutCard";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Day labels indexed by plan_day (0 = Mon … 6 = Sun). */
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Group workouts by their `plan_day` value into an array of 7 buckets.
 * Workouts with null `plan_day` are excluded.
 *
 * @returns An array of length 7 where index i contains workouts for day i.
 */
export function groupWorkoutsByDay(
  workouts: PlanWorkout[]
): PlanWorkout[][] {
  const days: PlanWorkout[][] = Array.from({ length: 7 }, () => []);
  for (const workout of workouts) {
    if (workout.plan_day != null && workout.plan_day >= 0 && workout.plan_day <= 6) {
      days[workout.plan_day].push(workout);
    }
  }
  return days;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface WeeklyCalendarProps {
  /** Workouts for the currently displayed week. */
  workouts: PlanWorkout[];
  /** Current week number (1-based). */
  currentWeek: number;
  /** Total number of weeks in the plan. */
  totalWeeks: number;
  /** Callback when the user navigates to a different week. */
  onWeekChange: (week: number) => void;
  /** Callback when the user taps a workout card. */
  onWorkoutPress: (workout: PlanWorkout) => void;
  /** Resolve the display status for a given workout. */
  getWorkoutStatus: (workout: PlanWorkout) => WorkoutStatus;
  /** Optional style overrides for the outer container. */
  style?: ViewStyle;
}

export function WeeklyCalendar({
  workouts,
  currentWeek,
  totalWeeks,
  onWeekChange,
  onWorkoutPress,
  getWorkoutStatus,
  style,
}: WeeklyCalendarProps) {
  const colors = useThemeColors();

  const dayBuckets = useMemo(() => groupWorkoutsByDay(workouts), [workouts]);

  const canGoPrev = currentWeek > 1;
  const canGoNext = currentWeek < totalWeeks;

  return (
    <View style={[styles.container, style]}>
      {/* Week navigation header */}
      <View style={styles.navRow}>
        <Pressable
          onPress={() => canGoPrev && onWeekChange(currentWeek - 1)}
          disabled={!canGoPrev}
          style={[
            styles.navButton,
            {
              backgroundColor: colors.muted,
              opacity: canGoPrev ? 1 : 0.4,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
        >
          <Text style={[styles.navButtonText, { color: colors.foreground }]}>
            ←
          </Text>
        </Pressable>

        <View style={styles.weekLabelContainer}>
          <Text style={[styles.weekLabel, { color: colors.foreground }]}>
            Week {currentWeek} of {totalWeeks}
          </Text>
        </View>

        <Pressable
          onPress={() => canGoNext && onWeekChange(currentWeek + 1)}
          disabled={!canGoNext}
          style={[
            styles.navButton,
            {
              backgroundColor: colors.muted,
              opacity: canGoNext ? 1 : 0.4,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Next week"
        >
          <Text style={[styles.navButtonText, { color: colors.foreground }]}>
            →
          </Text>
        </Pressable>
      </View>

      {/* Today button */}
      <View style={styles.todayRow}>
        <Pressable
          onPress={() => onWeekChange(1)}
          style={[
            styles.todayButton,
            {
              backgroundColor: colors.primary,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go to today"
        >
          <Text
            style={[styles.todayButtonText, { color: colors.primaryForeground }]}
          >
            Today
          </Text>
        </Pressable>
      </View>

      {/* Day columns */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {DAY_LABELS.map((label, dayIndex) => (
          <View key={label} style={styles.dayColumn}>
            {/* Day header */}
            <View
              style={[
                styles.dayHeader,
                { borderBottomColor: colors.cardBorder },
              ]}
            >
              <Text
                style={[styles.dayLabel, { color: colors.mutedForeground }]}
              >
                {label}
              </Text>
            </View>

            {/* Workout cards for this day */}
            <View style={styles.dayContent}>
              {dayBuckets[dayIndex].length === 0 ? (
                <View style={styles.emptyDay}>
                  <Text
                    style={[
                      styles.emptyDayText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Rest
                  </Text>
                </View>
              ) : (
                dayBuckets[dayIndex].map((workout) => (
                  <WorkoutCard
                    key={workout.id}
                    workout={workout}
                    status={getWorkoutStatus(workout)}
                    onPress={() => onWorkoutPress(workout)}
                    style={styles.workoutCard}
                  />
                ))
              )}
            </View>
          </View>
        ))}
      </ScrollView>
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
    marginBottom: 8,
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
  weekLabelContainer: {
    flex: 1,
    alignItems: "center",
  },
  weekLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  todayRow: {
    alignItems: "center",
    marginBottom: 12,
  },
  todayButton: {
    minHeight: 36,
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 4,
  },
  dayColumn: {
    width: 140,
    marginRight: 8,
  },
  dayHeader: {
    paddingBottom: 6,
    marginBottom: 8,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  dayContent: {
    gap: 8,
  },
  emptyDay: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyDayText: {
    fontSize: 12,
    fontStyle: "italic",
  },
  workoutCard: {
    width: "100%",
  },
});
