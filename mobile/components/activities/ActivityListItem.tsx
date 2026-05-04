/**
 * ActivityListItem — Tappable row for the activity feed.
 *
 * Displays discipline emoji icon, activity name (or "Untitled Activity"),
 * formatted date, duration, distance in km (when non-null), and average
 * heart rate with "bpm" unit (when non-null). Triggers `onPress` on tap.
 *
 * @see Requirements 6.2
 */

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useThemeColors } from "@/lib/theme";
import { getDisciplineMeta, formatDate, formatDuration } from "@/lib/format";
import type { ActivitySummary } from "@/lib/types";

export interface ActivityListItemProps {
  /** The activity summary to display. */
  activity: ActivitySummary;
  /** Callback invoked when the item is tapped. */
  onPress: () => void;
}

/**
 * Format distance in metres to a human-readable km string.
 * Returns null when the value is null.
 */
function formatDistanceKm(meters: number | null): string | null {
  if (meters === null) return null;
  const km = meters / 1000;
  return km >= 10 ? `${km.toFixed(1)} km` : `${km.toFixed(2)} km`;
}

/**
 * Format average heart rate with "bpm" unit.
 * Returns null when the value is null.
 */
function formatAvgHR(hr: number | null): string | null {
  if (hr === null) return null;
  return `${Math.round(hr)} bpm`;
}

export function ActivityListItem({ activity, onPress }: ActivityListItemProps) {
  const colors = useThemeColors();
  const isDark = colors.background === "#0a0a0a";
  const meta = getDisciplineMeta(activity.discipline, isDark);

  const displayName = activity.name ?? "Untitled Activity";
  const distanceText = formatDistanceKm(activity.distance_meters);
  const hrText = formatAvgHR(activity.avg_hr);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label} activity: ${displayName}`}
    >
      {/* Discipline icon */}
      <Text style={styles.icon}>{meta.icon}</Text>

      {/* Name + date */}
      <View style={styles.infoCol}>
        <Text
          style={[styles.name, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {displayName}
        </Text>
        <Text style={[styles.date, { color: colors.mutedForeground }]}>
          {formatDate(activity.start_time)}
        </Text>
      </View>

      {/* Stats: duration, distance, HR */}
      <View style={styles.statsCol}>
        <Text style={[styles.statValue, { color: colors.foreground }]}>
          {formatDuration(activity.duration_seconds)}
        </Text>
        {distanceText != null && (
          <Text style={[styles.statUnit, { color: colors.mutedForeground }]}>
            {distanceText}
          </Text>
        )}
        {hrText != null && (
          <Text style={[styles.statUnit, { color: colors.mutedForeground }]}>
            {hrText}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 56,
  },
  icon: {
    fontSize: 20,
    marginRight: 12,
  },
  infoCol: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontSize: 15,
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
