/**
 * FitnessFormChart — Individual metric cards with 7-day sparklines.
 *
 * Each fitness metric (CTL, ATL, TSB, Daily TSS) gets its own card showing:
 * - Current value (large)
 * - 7-day mini sparkline
 * - Trend direction
 *
 * Inspired by Garmin Connect mobile's metric cards.
 *
 * @see Requirements 5.11, 14.3
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LineChart, BarChart } from "react-native-gifted-charts";

import { Card } from "@/components/ui/Card";
import { useThemeColors } from "@/lib/theme";
import type { FitnessPoint } from "@/lib/types";

export interface FitnessFormChartProps {
  data: FitnessPoint[];
  height?: number;
}

// ---------------------------------------------------------------------------
// Mini Sparkline — tiny inline chart for a single metric
// ---------------------------------------------------------------------------

function MiniSparkline({
  values,
  color,
  height = 40,
  width = 100,
}: {
  values: number[];
  color: string;
  height?: number;
  width?: number;
}) {
  if (values.length < 2) return null;

  const data = values.map((v) => ({ value: v }));

  return (
    <LineChart
      data={data}
      height={height}
      width={width}
      spacing={width / (values.length - 1)}
      initialSpacing={0}
      endSpacing={0}
      color={color}
      thickness={2}
      hideDataPoints
      curved
      hideYAxisText
      hideAxesAndRules
      adjustToWidth
      disableScroll
    />
  );
}

// ---------------------------------------------------------------------------
// Mini Bar Sparkline — for TSS (bar chart)
// ---------------------------------------------------------------------------

function MiniBarSparkline({
  values,
  color,
  height = 40,
  width = 100,
}: {
  values: number[];
  color: string;
  height?: number;
  width?: number;
}) {
  if (values.length < 2) return null;

  const data = values.map((v) => ({
    value: v,
    frontColor: color,
  }));

  return (
    <BarChart
      data={data}
      height={height}
      width={width}
      barWidth={width / values.length - 2}
      spacing={2}
      initialSpacing={0}
      endSpacing={0}
      hideYAxisText
      hideAxesAndRules
      disableScroll
      noOfSections={3}
      barBorderRadius={2}
    />
  );
}

// ---------------------------------------------------------------------------
// Fitness Metric Card
// ---------------------------------------------------------------------------

function FitnessMetricCard({
  label,
  value,
  unit,
  sparkValues,
  color,
  description,
  isBar,
  colors,
}: {
  label: string;
  value: number | null;
  unit?: string;
  sparkValues: number[];
  color: string;
  description?: string;
  isBar?: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const displayValue = value != null ? String(Math.round(value)) : "—";

  // Determine trend from last 2 values
  const trend = sparkValues.length >= 2
    ? sparkValues[sparkValues.length - 1] - sparkValues[sparkValues.length - 2]
    : 0;
  const trendArrow = trend > 1 ? "↑" : trend < -1 ? "↓" : "→";
  const trendColor = trend > 1 ? colors.statusPositive : trend < -1 ? colors.statusNegative : colors.mutedForeground;

  return (
    <View style={[cardStyles.container, { backgroundColor: colors.muted }]}>
      {/* Label */}
      <Text style={[cardStyles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>

      {/* Value + trend */}
      <View style={cardStyles.valueRow}>
        <Text style={[cardStyles.value, { color: colors.foreground }]}>
          {displayValue}
        </Text>
        {unit && (
          <Text style={[cardStyles.unit, { color: colors.mutedForeground }]}>
            {unit}
          </Text>
        )}
        <Text style={[cardStyles.trend, { color: trendColor }]}>
          {trendArrow}
        </Text>
      </View>

      {/* Sparkline */}
      <View style={cardStyles.sparkContainer}>
        {isBar ? (
          <MiniBarSparkline values={sparkValues} color={color} height={32} width={120} />
        ) : (
          <MiniSparkline values={sparkValues} color={color} height={32} width={120} />
        )}
      </View>

      {/* Description */}
      {description && (
        <Text style={[cardStyles.desc, { color: colors.mutedForeground }]} numberOfLines={1}>
          {description}
        </Text>
      )}
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
  label: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
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
  trend: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 4,
  },
  sparkContainer: {
    marginTop: 6,
    height: 36,
    overflow: "hidden",
  },
  desc: {
    fontSize: 11,
    marginTop: 4,
  },
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function FitnessFormChart({ data }: FitnessFormChartProps) {
  const colors = useThemeColors();

  const metrics = useMemo(() => {
    if (data.length === 0) return null;

    const last = data[data.length - 1];
    const ctlValues = data.map((d) => d.ctl);
    const atlValues = data.map((d) => d.atl);
    const tsbValues = data.map((d) => d.tsb);
    const tssValues = data.map((d) => d.daily_tss);

    return {
      ctl: { value: last.ctl, values: ctlValues },
      atl: { value: last.atl, values: atlValues },
      tsb: { value: last.tsb, values: tsbValues },
      tss: { value: tssValues.reduce((a, b) => a + b, 0), values: tssValues },
    };
  }, [data]);

  if (!metrics) {
    return (
      <Card>
        <Text style={[styles.header, { color: colors.foreground }]}>Fitness & Form</Text>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No fitness data available
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={[styles.header, { color: colors.foreground }]}>Fitness & Form</Text>

      <View style={styles.grid}>
        <FitnessMetricCard
          label="Fitness (CTL)"
          value={metrics.ctl.value}
          sparkValues={metrics.ctl.values}
          color={colors.primary}
          description="Chronic training load"
          colors={colors}
        />
        <FitnessMetricCard
          label="Fatigue (ATL)"
          value={metrics.atl.value}
          sparkValues={metrics.atl.values}
          color={colors.statusNegative}
          description="Acute training load"
          colors={colors}
        />
        <FitnessMetricCard
          label="Form (TSB)"
          value={metrics.tsb.value}
          sparkValues={metrics.tsb.values}
          color={colors.statusCaution}
          description={metrics.tsb.value != null && metrics.tsb.value > 0 ? "Fresh" : metrics.tsb.value != null && metrics.tsb.value < -10 ? "Fatigued" : "Balanced"}
          colors={colors}
        />
        <FitnessMetricCard
          label="Load (7d TSS)"
          value={metrics.tss.value}
          unit="TSS"
          sparkValues={metrics.tss.values}
          color={colors.mutedForeground}
          description="Weekly training stress"
          isBar
          colors={colors}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  emptyContainer: { alignItems: "center", justifyContent: "center", height: 100 },
  emptyText: { fontSize: 14 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
});
