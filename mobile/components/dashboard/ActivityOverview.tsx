/**
 * ActivityOverview — Displays activity status, 6 metric tiles, and discipline breakdown.
 *
 * Shows an "Activity" header with a status badge (idle/overreaching/building/lighter/steady),
 * the headline text, 6 MetricTile components in a 2-column grid for 7-day activity
 * and fitness metrics, and a discipline breakdown section with per-discipline stats
 * including sessions, distance/duration, week-over-week delta, average intensity, and VO2max.
 *
 * @see Requirements 5.9, 5.10
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LineChart, BarChart } from "react-native-gifted-charts";

import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { MetricTile } from "@/components/dashboard/MetricTile";
import { useThemeColors } from "@/lib/theme";
import { formatNumber, calculateDelta, getDisciplineMeta } from "@/lib/format";
import type {
  ActivityOverview as ActivityOverviewType,
  DisciplineSummary,
  Discipline,
  FitnessPoint,
} from "@/lib/types";

export interface ActivityOverviewProps {
  activity: ActivityOverviewType;
  fitnessTimeline?: FitnessPoint[];
}

/**
 * Map activity status to a Badge variant.
 */
function getStatusBadgeVariant(status: string): BadgeVariant {
  if (status === "building") return "positive";
  if (status === "overreaching") return "negative";
  // idle, lighter, steady → caution (lighter/steady) or default (idle)
  if (status === "lighter" || status === "steady") return "caution";
  return "default";
}

/**
 * Map the by_discipline key to a canonical Discipline enum value.
 */
function disciplineKeyToEnum(key: string): Discipline {
  const map: Record<string, Discipline> = {
    swim: "SWIM",
    bike: "RIDE_ROAD",
    run: "RUN",
    strength: "STRENGTH",
    mobility: "MOBILITY",
  };
  return map[key] ?? "OTHER";
}

/**
 * Friendly label for discipline breakdown keys.
 */
function disciplineKeyLabel(key: string): string {
  const labels: Record<string, string> = {
    swim: "Swim",
    bike: "Bike",
    run: "Run",
    strength: "Strength",
    mobility: "Mobility",
  };
  return labels[key] ?? key;
}

/**
 * Format a duration in hours to a readable string.
 */
function formatHours(hours: number): string {
  if (hours === 0) return "0h";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

// ---------------------------------------------------------------------------
// FitnessCard — mini sparkline card for CTL/ATL/TSB/TSS
// ---------------------------------------------------------------------------

function FitnessCard({ label, value, values, color, desc, isBar, colors }: {
  label: string; value: number; values: number[]; color: string;
  desc: string; isBar?: boolean; colors: ReturnType<typeof useThemeColors>;
}) {
  const displayValue = Math.round(value);
  const trend = values.length >= 2 ? values[values.length - 1] - values[values.length - 2] : 0;
  const trendArrow = trend > 1 ? "↑" : trend < -1 ? "↓" : "→";
  const trendColor = trend > 1 ? colors.statusPositive : trend < -1 ? colors.statusNegative : colors.mutedForeground;

  const chartData = values.map((v) => ({ value: v, frontColor: color }));

  return (
    <View style={[fitnessStyles.card, { backgroundColor: colors.muted }]}>
      <Text style={[fitnessStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={fitnessStyles.valueRow}>
        <Text style={[fitnessStyles.value, { color: colors.foreground }]}>{displayValue}</Text>
        <Text style={[fitnessStyles.trend, { color: trendColor }]}>{trendArrow}</Text>
      </View>
      <View style={fitnessStyles.sparkContainer}>
        {values.length >= 2 && (
          isBar ? (
            <BarChart data={chartData} height={28} width={100} barWidth={100 / values.length - 2} spacing={2} initialSpacing={0} hideYAxisText hideAxesAndRules disableScroll noOfSections={2} barBorderRadius={2} />
          ) : (
            <LineChart data={chartData.map(d => ({ value: d.value }))} height={28} width={100} spacing={100 / (values.length - 1)} initialSpacing={0} endSpacing={0} color={color} thickness={2} hideDataPoints curved hideYAxisText hideAxesAndRules disableScroll />
          )
        )}
      </View>
      <Text style={[fitnessStyles.desc, { color: colors.mutedForeground }]}>{desc}</Text>
    </View>
  );
}

const fitnessStyles = StyleSheet.create({
  card: { borderRadius: 12, padding: 10, flexBasis: "48%", flexGrow: 1 },
  label: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 3, marginTop: 2 },
  value: { fontSize: 22, fontWeight: "700", fontVariant: ["tabular-nums"] },
  trend: { fontSize: 14, fontWeight: "600" },
  sparkContainer: { height: 32, marginTop: 4, overflow: "hidden" },
  desc: { fontSize: 10, marginTop: 2 },
});

// ---------------------------------------------------------------------------

export function ActivityOverview({ activity, fitnessTimeline }: ActivityOverviewProps) {
  const colors = useThemeColors();
  const isDark = colors.background === "#0a0a0a";

  const { status, headline, last_7d, previous_7d, fitness } = activity;

  // Fitness sparkline data
  const fitnessCards = useMemo(() => {
    if (!fitnessTimeline || fitnessTimeline.length === 0) return null;
    const last = fitnessTimeline[fitnessTimeline.length - 1];
    return {
      ctl: { value: last.ctl, values: fitnessTimeline.map((d) => d.ctl) },
      atl: { value: last.atl, values: fitnessTimeline.map((d) => d.atl) },
      tsb: { value: last.tsb, values: fitnessTimeline.map((d) => d.tsb) },
      tss: { value: fitnessTimeline.reduce((s, d) => s + d.daily_tss, 0), values: fitnessTimeline.map((d) => d.daily_tss) },
    };
  }, [fitnessTimeline]);

  // Show ALL disciplines (even with 0 sessions this week)
  const disciplineEntries = Object.entries(last_7d.by_discipline);

  // Previous 7d discipline data for delta calculations
  const prevByDiscipline = previous_7d.by_discipline;

  return (
    <Card>
      {/* Header row: title + status badge */}
      <View style={styles.headerRow}>
        <Text style={[styles.header, { color: colors.foreground }]}>
          Activity
        </Text>
        <Badge
          text={status.charAt(0).toUpperCase() + status.slice(1)}
          variant={getStatusBadgeVariant(status)}
        />
      </View>

      {/* Headline text */}
      <Text style={[styles.headline, { color: colors.mutedForeground }]}>
        {headline}
      </Text>

      {/* Sessions + Duration tiles */}
      <View style={styles.tilesGrid}>
        <MetricTile
          label="Sessions 7d"
          value={last_7d.sessions}
          style={styles.tile}
        />
        <MetricTile
          label="Duration 7d"
          value={last_7d.duration_hours > 0 ? formatHours(last_7d.duration_hours) : null}
          style={styles.tile}
        />
      </View>

      {/* Fitness sparkline cards */}
      {fitnessCards && (
        <View style={styles.tilesGrid}>
          <FitnessCard label="Fitness" value={fitnessCards.ctl.value} values={fitnessCards.ctl.values} color={colors.primary} desc="CTL" colors={colors} />
          <FitnessCard label="Fatigue" value={fitnessCards.atl.value} values={fitnessCards.atl.values} color={colors.statusNegative} desc="ATL" colors={colors} />
          <FitnessCard label="Form" value={fitnessCards.tsb.value} values={fitnessCards.tsb.values} color={colors.statusCaution} desc={fitnessCards.tsb.value > 0 ? "Fresh" : fitnessCards.tsb.value < -10 ? "Fatigued" : "Balanced"} colors={colors} />
          <FitnessCard label="Load 7d" value={fitnessCards.tss.value} values={fitnessCards.tss.values} color={colors.mutedForeground} desc="TSS" isBar colors={colors} />
        </View>
      )}

      {/* Discipline breakdown section */}
      {disciplineEntries.length > 0 && (
        <View style={styles.breakdownSection}>
          <Text
            style={[styles.breakdownLabel, { color: colors.mutedForeground }]}
          >
            Discipline Breakdown
          </Text>

          {disciplineEntries.map(([key, summary]) => {
            const discipline = disciplineKeyToEnum(key);
            const meta = getDisciplineMeta(discipline, isDark);
            const prevSummary = prevByDiscipline[
              key as keyof typeof prevByDiscipline
            ] as DisciplineSummary | undefined;

            // Week-over-week session delta
            const sessionDelta =
              prevSummary != null
                ? calculateDelta(
                    summary.sessions,
                    prevSummary.sessions,
                    "",
                    0.5,
                    isDark
                  )
                : null;

            // Use distance for endurance disciplines, duration for others
            const isEndurance = ["swim", "bike", "run"].includes(key);
            const primaryStat = isEndurance
              ? `${summary.distance_km.toFixed(1)} km`
              : formatHours(summary.duration_hours);

            return (
              <View
                key={key}
                style={[
                  styles.disciplineRow,
                  { borderBottomColor: colors.cardBorder },
                ]}
              >
                {/* Discipline icon + name */}
                <View style={styles.disciplineNameCol}>
                  <Text style={styles.disciplineIcon}>{meta.icon}</Text>
                  <Text
                    style={[styles.disciplineName, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {disciplineKeyLabel(key)}
                  </Text>
                </View>

                {/* Sessions count + delta */}
                <View style={styles.disciplineStatCol}>
                  <Text
                    style={[
                      styles.disciplineStatValue,
                      { color: colors.foreground },
                    ]}
                  >
                    {summary.sessions}
                  </Text>
                  <Text
                    style={[
                      styles.disciplineStatUnit,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {summary.sessions === 1 ? "session" : "sessions"}
                  </Text>
                  {sessionDelta && (
                    <Text
                      style={[
                        styles.disciplineDelta,
                        { color: sessionDelta.color },
                      ]}
                    >
                      {sessionDelta.text}
                    </Text>
                  )}
                </View>

                {/* Distance/duration + avg HR */}
                <View style={styles.disciplineDetailCol}>
                  <Text
                    style={[
                      styles.disciplineStatValue,
                      { color: colors.foreground },
                    ]}
                  >
                    {primaryStat}
                  </Text>
                  {summary.avg_hr != null && (
                    <Text
                      style={[
                        styles.disciplineStatUnit,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {Math.round(summary.avg_hr)} bpm
                    </Text>
                  )}
                </View>
              </View>
            );
          })}

          {/* VO2max row (if available) */}
          {(fitness.vo2max_running != null || fitness.vo2max_cycling != null) && (
            <View style={styles.vo2maxRow}>
              <Text
                style={[styles.vo2maxLabel, { color: colors.mutedForeground }]}
              >
                VO2max
              </Text>
              <View style={styles.vo2maxValues}>
                {fitness.vo2max_running != null && (
                  <View style={styles.vo2maxItem}>
                    <Text style={styles.vo2maxIcon}>🏃</Text>
                    <Text
                      style={[
                        styles.vo2maxValue,
                        { color: colors.foreground },
                      ]}
                    >
                      {formatNumber(fitness.vo2max_running)}
                    </Text>
                  </View>
                )}
                {fitness.vo2max_cycling != null && (
                  <View style={styles.vo2maxItem}>
                    <Text style={styles.vo2maxIcon}>🚴</Text>
                    <Text
                      style={[
                        styles.vo2maxValue,
                        { color: colors.foreground },
                      ]}
                    >
                      {formatNumber(fitness.vo2max_cycling)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

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

  // 2-column grid for metric tiles
  tilesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  tile: {
    flexBasis: "48%",
    flexGrow: 1,
  },

  // Discipline breakdown section
  breakdownSection: {
    marginTop: 4,
  },
  breakdownLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  // Discipline row
  disciplineRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  disciplineNameCol: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  disciplineIcon: {
    fontSize: 16,
  },
  disciplineName: {
    fontSize: 13,
    fontWeight: "600",
  },
  disciplineStatCol: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 3,
  },
  disciplineStatValue: {
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  disciplineStatUnit: {
    fontSize: 11,
    fontWeight: "500",
  },
  disciplineDelta: {
    fontSize: 11,
    fontWeight: "600",
  },
  disciplineDetailCol: {
    flex: 1,
    alignItems: "flex-end",
  },

  // VO2max section
  vo2maxRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    marginTop: 4,
  },
  vo2maxLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  vo2maxValues: {
    flexDirection: "row",
    gap: 16,
  },
  vo2maxItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  vo2maxIcon: {
    fontSize: 14,
  },
  vo2maxValue: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
