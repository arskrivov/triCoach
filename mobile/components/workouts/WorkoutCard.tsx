/**
 * WorkoutCard — Tappable card for a planned workout in the weekly/monthly calendar.
 *
 * Displays discipline emoji icon, workout name, formatted duration, TSS, and
 * completion status. Status-based styling applies a coloured left border and
 * status indicator:
 *
 * - completed → green left border + checkmark (✓)
 * - today     → primary colour left border + "Today" badge
 * - skipped   → amber left border + "Skipped" text
 * - upcoming  → default/muted styling
 *
 * Minimum 44pt touch target per platform conventions.
 *
 * @see Requirements 8.4
 */

import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";

import { useThemeColors, useColorSchemeName, type ThemeColors } from "@/lib/theme";
import { getDisciplineMeta, formatDuration } from "@/lib/format";
import type { PlanWorkout, WorkoutStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Status styling helpers
// ---------------------------------------------------------------------------

export interface StatusStyle {
  /** Left border colour for the card. */
  borderColor: string;
  /** Optional indicator text (e.g. "✓", "Skipped"). */
  indicatorText: string | null;
  /** Colour for the indicator text. */
  indicatorColor: string;
  /** Whether to show a "Today" badge instead of indicator text. */
  showTodayBadge: boolean;
  /** Card background opacity multiplier (1 = full, lower = dimmed). */
  backgroundOpacity: number;
}

/**
 * Resolve visual styling for a given workout status.
 * Exported for testing.
 */
export function getStatusStyle(
  status: WorkoutStatus,
  colors: ThemeColors
): StatusStyle {
  switch (status) {
    case "completed":
      return {
        borderColor: colors.statusPositive,
        indicatorText: "✓",
        indicatorColor: colors.statusPositive,
        showTodayBadge: false,
        backgroundOpacity: 1,
      };
    case "today":
      return {
        borderColor: colors.primary,
        indicatorText: null,
        indicatorColor: colors.primary,
        showTodayBadge: true,
        backgroundOpacity: 1,
      };
    case "skipped":
      return {
        borderColor: colors.statusCaution,
        indicatorText: "Skipped",
        indicatorColor: colors.statusCaution,
        showTodayBadge: false,
        backgroundOpacity: 0.7,
      };
    case "upcoming":
    default:
      return {
        borderColor: colors.cardBorder,
        indicatorText: null,
        indicatorColor: colors.mutedForeground,
        showTodayBadge: false,
        backgroundOpacity: 0.85,
      };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface WorkoutCardProps {
  /** The planned workout to display. */
  workout: PlanWorkout;
  /** Completion status determining visual styling. */
  status: WorkoutStatus;
  /** Callback invoked when the card is tapped. */
  onPress: () => void;
  /** Optional style overrides for the outer container. */
  style?: ViewStyle;
}

export function WorkoutCard({ workout, status, onPress, style }: WorkoutCardProps) {
  const colors = useThemeColors();
  const isDark = useColorSchemeName() === "dark";
  const meta = getDisciplineMeta(workout.discipline, isDark);
  const statusStyle = getStatusStyle(status, colors);

  const displayName = workout.name || "Untitled Workout";
  const durationText = formatDuration(workout.estimated_duration_seconds);
  const tssText =
    workout.estimated_tss != null ? `${workout.estimated_tss} TSS` : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          borderLeftColor: statusStyle.borderColor,
          opacity: pressed ? 0.7 : statusStyle.backgroundOpacity,
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label} workout: ${displayName}, ${durationText}${tssText ? `, ${tssText}` : ""}, ${status}`}
    >
      {/* Top row: icon + name + status indicator */}
      <View style={styles.topRow}>
        <Text style={styles.icon}>{meta.icon}</Text>
        <Text
          style={[styles.name, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {displayName}
        </Text>

        {/* Status indicator */}
        {statusStyle.showTodayBadge && (
          <View
            style={[
              styles.todayBadge,
              { backgroundColor: colors.primary },
            ]}
          >
            <Text style={[styles.todayBadgeText, { color: colors.primaryForeground }]}>
              Today
            </Text>
          </View>
        )}
        {statusStyle.indicatorText != null && (
          <Text
            style={[
              styles.indicatorText,
              { color: statusStyle.indicatorColor },
            ]}
          >
            {statusStyle.indicatorText}
          </Text>
        )}
      </View>

      {/* Bottom row: duration + TSS */}
      <View style={styles.bottomRow}>
        <Text style={[styles.stat, { color: colors.mutedForeground }]}>
          {durationText}
        </Text>
        {tssText != null && (
          <Text style={[styles.stat, { color: colors.mutedForeground }]}>
            {tssText}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 10,
    padding: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
  },
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  todayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  todayBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  indicatorText: {
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 8,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 12,
  },
  stat: {
    fontSize: 12,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
});
