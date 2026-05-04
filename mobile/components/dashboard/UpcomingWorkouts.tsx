/**
 * UpcomingWorkouts — Displays a list of next scheduled workouts.
 *
 * Each workout row shows the discipline emoji icon (via getDisciplineMeta),
 * workout name, formatted date, formatted duration, and TSS.
 * Shows an empty state message when no workouts are scheduled.
 *
 * @see Requirements 5.12
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { useThemeColors } from "@/lib/theme";
import { getDisciplineMeta, formatDate, formatDuration } from "@/lib/format";
import type { PlannedWorkout } from "@/lib/types";

export interface UpcomingWorkoutsProps {
  /** List of upcoming planned workouts. */
  workouts: PlannedWorkout[];
}

export function UpcomingWorkouts({ workouts }: UpcomingWorkoutsProps) {
  const colors = useThemeColors();
  const isDark = colors.background === "#0a0a0a";

  return (
    <Card>
      <Text style={[styles.header, { color: colors.foreground }]}>
        Upcoming Workouts
      </Text>

      {workouts.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          No upcoming workouts scheduled.
        </Text>
      ) : (
        workouts.map((workout, index) => {
          const meta = getDisciplineMeta(workout.discipline, isDark);
          const isLast = index === workouts.length - 1;

          return (
            <View
              key={workout.id}
              style={[
                styles.workoutRow,
                !isLast && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.cardBorder,
                },
              ]}
            >
              {/* Discipline icon */}
              <Text style={styles.icon}>{meta.icon}</Text>

              {/* Name + date */}
              <View style={styles.infoCol}>
                <Text
                  style={[styles.name, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {workout.name}
                </Text>
                <Text
                  style={[styles.date, { color: colors.mutedForeground }]}
                >
                  {formatDate(workout.scheduled_date)}
                </Text>
              </View>

              {/* Duration + TSS */}
              <View style={styles.statsCol}>
                <Text
                  style={[styles.statValue, { color: colors.foreground }]}
                >
                  {formatDuration(workout.estimated_duration_seconds)}
                </Text>
                {workout.estimated_tss != null && (
                  <Text
                    style={[styles.statUnit, { color: colors.mutedForeground }]}
                  >
                    {Math.round(workout.estimated_tss)} TSS
                  </Text>
                )}
              </View>
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 14,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  workoutRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  icon: {
    fontSize: 18,
    marginRight: 10,
  },
  infoCol: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
  },
  date: {
    fontSize: 12,
    marginTop: 2,
  },
  statsCol: {
    alignItems: "flex-end",
  },
  statValue: {
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  statUnit: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
});
