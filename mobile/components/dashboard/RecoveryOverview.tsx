/**
 * RecoveryOverview — Recovery metrics displayed as visual cards with mini gauges.
 *
 * Each metric is shown as a card with:
 * - Current value (large)
 * - Mini progress bar showing current vs 7-day average
 * - 7-day average label
 * - Trend arrow + direction
 *
 * Inspired by Oura's ring cards and Garmin's metric tiles.
 *
 * @see Requirements 5.6, 5.8
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useThemeColors } from "@/lib/theme";
import {
  formatNumber,
  getTrendColor,
  getTrendLabel,
} from "@/lib/format";
import type {
  RecoveryOverview as RecoveryOverviewType,
  RecoveryMetricTrend,
  HealthSparklinePoint,
} from "@/lib/types";

export interface RecoveryOverviewProps {
  recovery: RecoveryOverviewType & { sparkline: HealthSparklinePoint[] };
}

function getStatusBadgeVariant(status: string): "positive" | "negative" | "caution" {
  if (status === "strong") return "positive";
  if (status === "strained") return "negative";
  return "caution";
}

// ---------------------------------------------------------------------------
// Mini Gauge — arc-style progress indicator
// ---------------------------------------------------------------------------

/**
 * A simple horizontal gauge bar showing current value relative to the 7-day average.
 * The bar fills to show how the current value compares:
 * - At average = 50% fill
 * - Above average = >50% fill (green tint)
 * - Below average = <50% fill (amber/red tint)
 */
function MiniGauge({
  current,
  avg7d,
  maxValue,
  trendColor,
  colors,
}: {
  current: number;
  avg7d: number;
  maxValue: number;
  trendColor: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  // Calculate fill percentage (0-100)
  const fillPercent = maxValue > 0 ? Math.min(100, Math.max(0, (current / maxValue) * 100)) : 0;
  // Average marker position
  const avgPercent = maxValue > 0 ? Math.min(100, Math.max(0, (avg7d / maxValue) * 100)) : 0;

  return (
    <View style={gaugeStyles.container}>
      {/* Track */}
      <View style={[gaugeStyles.track, { backgroundColor: colors.muted }]}>
        {/* Fill */}
        <View
          style={[
            gaugeStyles.fill,
            {
              width: `${fillPercent}%`,
              backgroundColor: trendColor,
              opacity: 0.7,
            },
          ]}
        />
        {/* Average marker */}
        {avgPercent > 0 && avgPercent < 100 && (
          <View
            style={[
              gaugeStyles.avgMarker,
              {
                left: `${avgPercent}%`,
                backgroundColor: colors.foreground,
              },
            ]}
          />
        )}
      </View>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  container: { width: "100%", marginVertical: 6 },
  track: { height: 6, borderRadius: 3, overflow: "visible", position: "relative" },
  fill: { height: "100%", borderRadius: 3 },
  avgMarker: {
    position: "absolute",
    top: -2,
    width: 2,
    height: 10,
    borderRadius: 1,
    opacity: 0.5,
  },
});

// ---------------------------------------------------------------------------
// Metric Card — individual recovery metric with gauge
// ---------------------------------------------------------------------------

/** Shorten long metric labels for card display */
const SHORT_LABELS: Record<string, string> = {
  "Morning readiness": "Readiness",
  "Morning training readiness": "Readiness",
  "Sleep respiration": "Respiration",
  "Sleep duration": "Sleep Duration",
  "Resting HR": "Resting HR",
};

function shortLabel(label: string): string {
  return SHORT_LABELS[label] ?? label;
}

function MetricCard({
  metric,
  maxValue,
  colors,
  isDark,
}: {
  metric: RecoveryMetricTrend;
  maxValue: number;
  colors: ReturnType<typeof useThemeColors>;
  isDark: boolean;
}) {
  const trendColor = getTrendColor(metric.direction_vs_7d, isDark);
  const trendLabel = getTrendLabel(metric.direction_vs_7d);
  const trendArrow = metric.direction_vs_7d === "up" ? "↑"
    : metric.direction_vs_7d === "down" ? "↓"
    : metric.direction_vs_7d === "stable" ? "→" : "";

  const currentDisplay = metric.current != null ? formatNumber(metric.current, "") : "—";
  const avgDisplay = metric.avg_7d != null ? formatNumber(metric.avg_7d, "") : "—";

  return (
    <View style={[cardStyles.container, { backgroundColor: colors.muted }]}>
      {/* Label — full width */}
      <Text style={[cardStyles.label, { color: colors.mutedForeground }]} numberOfLines={1}>
        {shortLabel(metric.label)}
      </Text>

      {/* Value row: current value + unit + trend arrow */}
      <View style={cardStyles.valueRow}>
        <Text style={[cardStyles.value, { color: colors.foreground }]}>
          {currentDisplay}
        </Text>
        {metric.unit ? (
          <Text style={[cardStyles.unit, { color: colors.mutedForeground }]}>
            {metric.unit}
          </Text>
        ) : null}
      </View>

      {/* Mini gauge */}
      {metric.current != null && metric.avg_7d != null && (
        <MiniGauge
          current={metric.current}
          avg7d={metric.avg_7d}
          maxValue={maxValue}
          trendColor={trendColor}
          colors={colors}
        />
      )}

      {/* Average + trend */}
      <View style={cardStyles.bottomRow}>
        <Text style={[cardStyles.avgLabel, { color: colors.mutedForeground }]}>
          avg {avgDisplay}
        </Text>
        {trendArrow ? (
          <Text style={[cardStyles.trend, { color: trendColor }]}>
            {trendArrow}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 12,
    flexBasis: "48%",
    flexGrow: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  trend: {
    fontSize: 11,
    fontWeight: "600",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  value: {
    fontSize: 24,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  unit: {
    fontSize: 13,
    fontWeight: "500",
  },
  avgLabel: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
});

// ---------------------------------------------------------------------------
// Determine max values for gauge scaling
// ---------------------------------------------------------------------------

const METRIC_MAX_VALUES: Record<string, number> = {
  sleep_score: 100,
  sleep_duration_hours: 10,
  hrv_last_night: 120,
  resting_hr: 100,
  sleep_respiration: 25,
  stress_avg: 100,
  pulse_ox_avg: 100,
  morning_training_readiness_score: 100,
};

function getMaxValue(metricKey: string): number {
  return METRIC_MAX_VALUES[metricKey] ?? 100;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function RecoveryOverview({ recovery }: RecoveryOverviewProps) {
  const colors = useThemeColors();
  const isDark = colors.background === "#0a0a0a";

  const { metrics, status, headline } = recovery;

  return (
    <Card>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.header, { color: colors.foreground }]}>
          Recovery
        </Text>
        <Badge
          text={status.charAt(0).toUpperCase() + status.slice(1)}
          variant={getStatusBadgeVariant(status)}
        />
      </View>

      {/* Headline */}
      <Text style={[styles.headline, { color: colors.mutedForeground }]}>
        {headline}
      </Text>

      {/* Metric cards in 2-column grid */}
      {metrics.length > 0 && (
        <View style={styles.metricsGrid}>
          {metrics.map((metric) => (
            <MetricCard
              key={metric.key}
              metric={metric}
              maxValue={getMaxValue(metric.key)}
              colors={colors}
              isDark={isDark}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  header: {
    fontSize: 17,
    fontWeight: "700",
  },
  headline: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
});
