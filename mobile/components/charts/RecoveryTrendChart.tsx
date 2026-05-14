/**
 * RecoveryTrendChart — Interactive 7-day recovery trend chart.
 *
 * Shows Sleep Score, HRV, and Resting HR as line charts with touch-based
 * pointer that shows values for the selected day. Uses react-native-gifted-charts
 * pointerConfig for native-feeling interaction.
 *
 * @see Requirements 5.7, 14.1, 14.2, 14.5
 */

import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LineChart } from "react-native-gifted-charts";

import { Card } from "@/components/ui/Card";
import { useThemeColors } from "@/lib/theme";
import type { HealthSparklinePoint } from "@/lib/types";

export interface RecoveryTrendChartProps {
  data: HealthSparklinePoint[];
  height?: number;
}

function formatDateLabel(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(parts[1], 10) - 1]} ${parseInt(parts[2], 10)}`;
}

export function RecoveryTrendChart({ data, height = 200 }: RecoveryTrendChartProps) {
  const colors = useThemeColors();

  const { sleepData, hrvData, hrData, yAxisMin, yAxisMax } = useMemo(() => {
    const sleep: Array<{ value: number; label?: string; date?: string }> = [];
    const hrv: Array<{ value: number }> = [];
    const hr: Array<{ value: number }> = [];

    let allValues: number[] = [];

    data.forEach((point, i) => {
      const showLabel =
        i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2);
      const sleepVal = point.sleep_score ?? 0;
      const hrvVal = point.hrv ?? 0;
      const hrVal = point.resting_hr ?? 0;

      sleep.push({
        value: sleepVal,
        label: showLabel ? formatDateLabel(point.date) : "",
        date: formatDateLabel(point.date),
      });
      hrv.push({ value: hrvVal });
      hr.push({ value: hrVal });

      if (sleepVal > 0) allValues.push(sleepVal);
      if (hrvVal > 0) allValues.push(hrvVal);
      if (hrVal > 0) allValues.push(hrVal);
    });

    // Dynamic Y-axis range — don't start at 0, pad 10% below min
    const minVal = allValues.length > 0 ? Math.min(...allValues) : 0;
    const maxVal = allValues.length > 0 ? Math.max(...allValues) : 100;
    const padding = Math.max(5, Math.round((maxVal - minVal) * 0.1));
    const yMin = Math.max(0, Math.floor((minVal - padding) / 5) * 5); // Round down to nearest 5
    const yMax = Math.ceil((maxVal + padding) / 5) * 5; // Round up to nearest 5

    return { sleepData: sleep, hrvData: hrv, hrData: hr, yAxisMin: yMin, yAxisMax: yMax };
  }, [data]);

  if (data.length === 0) {
    return (
      <Card>
        <Text style={[styles.header, { color: colors.foreground }]}>
          Recovery Trend
        </Text>
        <View style={[styles.emptyContainer, { height }]}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No recovery data available
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={[styles.header, { color: colors.foreground }]}>
        Recovery Trend
      </Text>

      <LineChart
        data={sleepData}
        data2={hrvData}
        data3={hrData}
        height={height}
        spacing={data.length > 1 ? Math.floor(260 / (data.length - 1)) : 40}
        initialSpacing={0}
        endSpacing={0}
        scrollToEnd
        color1={colors.primary}
        color2={colors.statusPositive}
        color3={colors.statusNegative}
        thickness={2.5}
        thickness2={2}
        thickness3={2}
        hideDataPoints
        curved
        yAxisOffset={yAxisMin}
        maxValue={yAxisMax - yAxisMin}
        yAxisColor={colors.cardBorder}
        xAxisColor={colors.cardBorder}
        yAxisTextStyle={{ color: colors.mutedForeground, fontSize: 10 }}
        xAxisLabelTextStyle={{ color: colors.mutedForeground, fontSize: 9 }}
        noOfSections={4}
        rulesColor={colors.cardBorder}
        rulesType="dashed"
        backgroundColor={colors.card}
        // Interactive pointer config
        pointerConfig={{
          pointerStripHeight: height,
          pointerStripColor: colors.mutedForeground,
          pointerStripWidth: 1,
          pointerColor: colors.primary,
          radius: 5,
          pointerLabelWidth: 160,
          pointerLabelHeight: 90,
          activatePointersOnLongPress: false,
          autoAdjustPointerLabelPosition: true,
          pointerLabelComponent: (items: any[]) => {
            // Read date from the data point itself (stored in sleep data)
            const sleepItem = items?.[0] ?? {};
            const hrvItem = items?.[1] ?? {};
            const hrItem = items?.[2] ?? {};
            const dateLabel = (sleepItem as any).date || "";
            const sleepVal = sleepItem.value ?? 0;
            const hrvVal = hrvItem.value ?? 0;
            const hrVal = hrItem.value ?? 0;

            return (
              <View
                style={[
                  styles.tooltip,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={[styles.tooltipDate, { color: colors.foreground }]}>
                  {dateLabel}
                </Text>
                <View style={styles.tooltipRow}>
                  <View style={[styles.tooltipDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.tooltipText, { color: colors.foreground }]}>
                    Sleep: {sleepVal}
                  </Text>
                </View>
                <View style={styles.tooltipRow}>
                  <View style={[styles.tooltipDot, { backgroundColor: colors.statusPositive }]} />
                  <Text style={[styles.tooltipText, { color: colors.foreground }]}>
                    HRV: {hrvVal} ms
                  </Text>
                </View>
                <View style={styles.tooltipRow}>
                  <View style={[styles.tooltipDot, { backgroundColor: colors.statusNegative }]} />
                  <Text style={[styles.tooltipText, { color: colors.foreground }]}>
                    RHR: {hrVal} bpm
                  </Text>
                </View>
              </View>
            );
          },
        }}
      />

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
            Sleep
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.statusPositive }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
            HRV
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.statusNegative }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
            Rest HR
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  emptyContainer: { alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 14 },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 10,
    paddingTop: 8,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: "500" },
  tooltip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tooltipDate: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  tooltipDot: { width: 6, height: 6, borderRadius: 3 },
  tooltipText: { fontSize: 11, fontWeight: "500" },
});
