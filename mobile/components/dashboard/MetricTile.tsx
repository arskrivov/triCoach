/**
 * MetricTile — Reusable tile showing a label, value, unit, and optional trend indicator.
 *
 * Used by both Recovery Overview and Activity Overview sections on the Dashboard.
 * Displays the label in muted foreground colour, the value prominently (or "—" if null),
 * the unit next to the value, and a trend arrow when a trend direction is provided.
 *
 * Trend indicators:
 * - "up"      → ↑ (green / statusPositive)
 * - "down"    → ↓ (red / statusNegative)
 * - "stable"  → → (neutral / mutedForeground)
 * - "unknown" → no indicator shown
 *
 * @see Requirements 5.6, 5.9
 */

import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";

import { useThemeColors } from "@/lib/theme";
import { getTrendColor } from "@/lib/format";

/** Trend direction for a metric. */
export type TrendDirection = "up" | "down" | "stable" | "unknown";

export interface MetricTileProps {
  /** Short label displayed above the value (e.g. "HRV", "Sleep Score"). */
  label: string;
  /** Primary metric value. Displays "—" when null. */
  value: string | number | null;
  /** Optional unit displayed next to the value (e.g. "ms", "bpm"). */
  unit?: string;
  /** Optional trend direction. Shows an arrow indicator when provided (except "unknown"). */
  trend?: TrendDirection;
  /** Optional style overrides for the outer container. */
  style?: ViewStyle;
}

/**
 * Return the arrow character for a trend direction.
 * Returns null for "unknown" (no indicator shown).
 */
function getTrendArrow(trend: TrendDirection): string | null {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  if (trend === "stable") return "→";
  return null;
}

export function MetricTile({ label, value, unit, trend, style }: MetricTileProps) {
  const colors = useThemeColors();
  const isDark = colors.background === "#0a0a0a";

  const displayValue = value === null ? "—" : String(value);
  const trendArrow = trend ? getTrendArrow(trend) : null;
  const trendColor = trend ? getTrendColor(trend, isDark) : undefined;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.muted },
        style,
      ]}
    >
      <Text
        style={[styles.label, { color: colors.mutedForeground }]}
        numberOfLines={1}
      >
        {label}
      </Text>

      <View style={styles.valueRow}>
        <Text
          style={[styles.value, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {displayValue}
        </Text>

        {unit && value !== null ? (
          <Text style={[styles.unit, { color: colors.mutedForeground }]}>
            {unit}
          </Text>
        ) : null}

        {trendArrow ? (
          <Text style={[styles.trend, { color: trendColor }]}>
            {trendArrow}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 80,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "space-between",
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  value: {
    fontSize: 22,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  unit: {
    fontSize: 13,
    fontWeight: "500",
  },
  trend: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 2,
  },
});
