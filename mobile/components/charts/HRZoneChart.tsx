/**
 * HRZoneChart — Horizontal bar chart for HR zone distribution.
 *
 * Displays horizontal bars for each HR zone, colour-coded:
 * Zone 1 = light blue, Zone 2 = green, Zone 3 = yellow,
 * Zone 4 = orange, Zone 5 = red.
 *
 * Uses simple View-based bars for reliability and simplicity,
 * wrapped in a Card with theme colours.
 *
 * @see Requirements 6.9, 14.4
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { useThemeColors } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HRZoneChartProps {
  /** Zone label → percentage or duration value. */
  zones: Record<string, number>;
  /** Chart height in pixels. Defaults to 180. */
  height?: number;
}

// ---------------------------------------------------------------------------
// Zone colour mapping
// ---------------------------------------------------------------------------

/** Colour palette for HR zones 1–5 (and fallback for others). */
const ZONE_COLORS: Record<string, string> = {
  "Zone 1": "#60a5fa", // light blue
  "Zone 2": "#34d399", // green
  "Zone 3": "#fbbf24", // yellow
  "Zone 4": "#fb923c", // orange
  "Zone 5": "#ef4444", // red
  // Fallback aliases for numeric-only keys
  "1": "#60a5fa",
  "2": "#34d399",
  "3": "#fbbf24",
  "4": "#fb923c",
  "5": "#ef4444",
};

const DEFAULT_ZONE_COLOR = "#a1a1aa"; // neutral grey fallback

/**
 * Get the colour for a zone label.
 * Supports "Zone 1", "Zone 2", etc. and plain "1", "2", etc.
 */
function getZoneColor(label: string): string {
  return ZONE_COLORS[label] ?? DEFAULT_ZONE_COLOR;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HRZoneChart({ zones, height = 180 }: HRZoneChartProps) {
  const colors = useThemeColors();

  const entries = useMemo(() => {
    return Object.entries(zones).map(([label, value]) => ({
      label,
      value,
      color: getZoneColor(label),
    }));
  }, [zones]);

  const maxValue = useMemo(() => {
    if (entries.length === 0) return 1;
    return Math.max(...entries.map((e) => e.value), 1);
  }, [entries]);

  if (entries.length === 0) {
    return (
      <Card>
        <Text style={[styles.header, { color: colors.foreground }]}>
          HR Zones
        </Text>
        <View style={[styles.emptyContainer, { height }]}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No HR zone data available
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={[styles.header, { color: colors.foreground }]}>
        HR Zones
      </Text>

      <View style={{ minHeight: height, justifyContent: "center" }}>
        {entries.map((entry) => {
          const widthPercent = (entry.value / maxValue) * 100;
          // Display value: if it looks like a percentage (≤100), show "%",
          // otherwise show raw value (could be seconds/minutes).
          const displayValue =
            entry.value <= 100
              ? `${Math.round(entry.value)}%`
              : `${Math.round(entry.value)}`;

          return (
            <View
              key={entry.label}
              style={styles.barRow}
              accessibilityLabel={`${entry.label}: ${displayValue}`}
            >
              {/* Zone label */}
              <Text
                style={[
                  styles.zoneLabel,
                  { color: colors.foreground },
                ]}
                numberOfLines={1}
              >
                {entry.label}
              </Text>

              {/* Bar track */}
              <View
                style={[
                  styles.barTrack,
                  { backgroundColor: colors.muted },
                ]}
              >
                {/* Filled bar */}
                <View
                  style={[
                    styles.barFill,
                    {
                      backgroundColor: entry.color,
                      width: `${Math.max(widthPercent, 2)}%`,
                    },
                  ]}
                />
              </View>

              {/* Value label */}
              <Text
                style={[
                  styles.valueLabel,
                  { color: colors.mutedForeground },
                ]}
              >
                {displayValue}
              </Text>
            </View>
          );
        })}
      </View>
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
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  zoneLabel: {
    width: 56,
    fontSize: 13,
    fontWeight: "600",
  },
  barTrack: {
    flex: 1,
    height: 22,
    borderRadius: 6,
    overflow: "hidden",
    marginHorizontal: 8,
  },
  barFill: {
    height: "100%",
    borderRadius: 6,
    minWidth: 4,
  },
  valueLabel: {
    width: 44,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
});
