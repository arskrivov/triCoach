/**
 * LapTable — Displays lap data in a table/list format.
 *
 * Shows columns: Lap #, Duration, Distance, Avg HR, Pace.
 * Uses formatDuration for duration, formats distance in km,
 * and formats pace as min:sec/km.
 *
 * @see Requirements 6.8
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { useThemeColors } from "@/lib/theme";
import { formatDuration } from "@/lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Lap {
  lap_number: number;
  duration_seconds: number;
  distance_meters: number | null;
  avg_hr: number | null;
  avg_pace_sec_per_km: number | null;
}

export interface LapTableProps {
  /** Array of lap data to display. */
  laps: Lap[];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format distance in metres to km string.
 * Returns "—" when the value is null.
 */
export function formatDistanceKm(meters: number | null): string {
  if (meters === null) return "—";
  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
}

/**
 * Format pace in seconds per km to min:sec/km string.
 * Returns "—" when the value is null.
 */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm === null) return "—";
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.round(secPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}/km`;
}

/**
 * Format average heart rate.
 * Returns "—" when the value is null.
 */
function formatAvgHR(hr: number | null): string {
  if (hr === null) return "—";
  return `${Math.round(hr)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LapTable({ laps }: LapTableProps) {
  const colors = useThemeColors();

  if (laps.length === 0) {
    return null;
  }

  return (
    <Card>
      <Text style={[styles.header, { color: colors.foreground }]}>Laps</Text>

      {/* Column headers */}
      <View style={[styles.row, styles.headerRow, { borderBottomColor: colors.cardBorder }]}>
        <Text style={[styles.cell, styles.cellLap, styles.headerText, { color: colors.mutedForeground }]}>
          #
        </Text>
        <Text style={[styles.cell, styles.cellDuration, styles.headerText, { color: colors.mutedForeground }]}>
          Duration
        </Text>
        <Text style={[styles.cell, styles.cellDistance, styles.headerText, { color: colors.mutedForeground }]}>
          Distance
        </Text>
        <Text style={[styles.cell, styles.cellHR, styles.headerText, { color: colors.mutedForeground }]}>
          HR
        </Text>
        <Text style={[styles.cell, styles.cellPace, styles.headerText, { color: colors.mutedForeground }]}>
          Pace
        </Text>
      </View>

      {/* Data rows */}
      {laps.map((lap, index) => (
        <View
          key={lap.lap_number}
          style={[
            styles.row,
            index < laps.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.cardBorder },
            index % 2 === 1 && { backgroundColor: colors.muted },
          ]}
          accessibilityLabel={`Lap ${lap.lap_number}`}
        >
          <Text style={[styles.cell, styles.cellLap, { color: colors.foreground }]}>
            {lap.lap_number}
          </Text>
          <Text style={[styles.cell, styles.cellDuration, { color: colors.foreground }]}>
            {formatDuration(lap.duration_seconds)}
          </Text>
          <Text style={[styles.cell, styles.cellDistance, { color: colors.foreground }]}>
            {formatDistanceKm(lap.distance_meters)}
          </Text>
          <Text style={[styles.cell, styles.cellHR, { color: colors.foreground }]}>
            {formatAvgHR(lap.avg_hr)}
          </Text>
          <Text style={[styles.cell, styles.cellPace, { color: colors.foreground }]}>
            {formatPace(lap.avg_pace_sec_per_km)}
          </Text>
        </View>
      ))}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  header: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  headerRow: {
    borderBottomWidth: 1,
    paddingBottom: 6,
    marginBottom: 2,
  },
  headerText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cell: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  cellLap: {
    width: 28,
    textAlign: "center",
    fontWeight: "600",
  },
  cellDuration: {
    flex: 1,
    textAlign: "right",
    paddingRight: 8,
  },
  cellDistance: {
    flex: 1,
    textAlign: "right",
    paddingRight: 8,
  },
  cellHR: {
    width: 40,
    textAlign: "right",
    paddingRight: 8,
  },
  cellPace: {
    flex: 1,
    textAlign: "right",
  },
});
