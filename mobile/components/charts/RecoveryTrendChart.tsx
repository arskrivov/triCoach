/**
 * RecoveryTrendChart — 7-day recovery trend using react-native-gifted-charts.
 *
 * Shows Sleep Score, HRV, and Resting HR as line charts.
 * Works in Expo Go (no native modules needed).
 *
 * @see Requirements 5.7, 14.1, 14.2
 */

import React, { useMemo } from "react";
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
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(parts[1], 10) - 1]} ${parseInt(parts[2], 10)}`;
}

export function RecoveryTrendChart({ data, height = 180 }: RecoveryTrendChartProps) {
  const colors = useThemeColors();

  const { sleepData, hrvData, hrData } = useMemo(() => {
    const sleep: Array<{ value: number; label?: string }> = [];
    const hrv: Array<{ value: number }> = [];
    const hr: Array<{ value: number }> = [];

    data.forEach((point, i) => {
      const showLabel = i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2);
      sleep.push({
        value: point.sleep_score ?? 0,
        label: showLabel ? formatDateLabel(point.date) : "",
      });
      hrv.push({ value: point.hrv ?? 0 });
      hr.push({ value: point.resting_hr ?? 0 });
    });

    return { sleepData: sleep, hrvData: hrv, hrData: hr };
  }, [data]);

  if (data.length === 0) {
    return (
      <Card>
        <Text style={[styles.header, { color: colors.foreground }]}>Recovery Trend</Text>
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
      <Text style={[styles.header, { color: colors.foreground }]}>Recovery Trend</Text>

      <LineChart
        data={sleepData}
        data2={hrvData}
        data3={hrData}
        height={height}
        width={280}
        spacing={data.length > 1 ? 280 / (data.length - 1) : 40}
        initialSpacing={8}
        endSpacing={8}
        color1={colors.primary}
        color2={colors.statusPositive}
        color3={colors.statusNegative}
        thickness={2.5}
        thickness2={2}
        thickness3={2}
        hideDataPoints
        curved
        yAxisColor={colors.cardBorder}
        xAxisColor={colors.cardBorder}
        yAxisTextStyle={{ color: colors.mutedForeground, fontSize: 10 }}
        xAxisLabelTextStyle={{ color: colors.mutedForeground, fontSize: 9 }}
        noOfSections={4}
        rulesColor={colors.cardBorder}
        rulesType="dashed"
        backgroundColor={colors.card}
      />

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Sleep</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.statusPositive }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>HRV</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.statusNegative }]} />
          <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Rest HR</Text>
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
    flexDirection: "row", justifyContent: "center",
    gap: 16, marginTop: 10, paddingTop: 8,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: "500" },
});
