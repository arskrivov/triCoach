/**
 * Activity Detail screen.
 *
 * Fetches full activity data from `GET /activities/{id}` and displays:
 * - Key metrics grid (duration, distance, elevation, HR, pace/power, cadence, TSS, training effect)
 * - Lap table (when laps are available)
 * - HR zone chart (when HR zone data is available)
 * - Exercise list (when exercise data is available)
 * - AI analysis text (when available)
 *
 * @see Requirements 6.6, 6.7, 6.10, 6.12
 */

import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { api } from "@/lib/api";
import { useThemeColors } from "@/lib/theme";
import { formatDuration } from "@/lib/format";
import { extractApiError } from "@/lib/error-handling";
import type { ActivityDetail } from "@/lib/types";

import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Alert } from "@/components/ui/Alert";
import { MetricTile } from "@/components/dashboard/MetricTile";
import { LapTable, type Lap } from "@/components/activities/LapTable";
import { HRZoneChart } from "@/components/charts/HRZoneChart";
import { ExerciseList } from "@/components/activities/ExerciseList";

// ---------------------------------------------------------------------------
// Data normalizers — Garmin raw data → component-expected format
// ---------------------------------------------------------------------------

/**
 * Normalize raw Garmin lapDTOs into the Lap format expected by LapTable.
 * Garmin fields: duration (sec), distance (m), averageHR, averageSpeed (m/s)
 */
function normalizeLaps(rawLaps: any[]): Lap[] {
  return rawLaps.map((lap, index) => {
    const duration = lap.duration_seconds ?? lap.duration ?? lap.elapsedDuration ?? null;
    const distance = lap.distance_meters ?? lap.distance ?? null;
    const avgHr = lap.avg_hr ?? lap.averageHR ?? lap.averageHeartRate ?? null;
    const avgSpeed = lap.averageSpeed ?? lap.avgSpeed ?? null;
    const pace = lap.avg_pace_sec_per_km ?? (avgSpeed && avgSpeed > 0 ? 1000 / avgSpeed : null);

    return {
      lap_number: lap.lap_number ?? lap.lapNumber ?? index + 1,
      duration_seconds: typeof duration === "number" ? Math.round(duration) : 0,
      distance_meters: typeof distance === "number" ? distance : null,
      avg_hr: typeof avgHr === "number" ? avgHr : null,
      avg_pace_sec_per_km: typeof pace === "number" ? Math.round(pace) : null,
    };
  });
}

/**
 * Normalize HR zones data. The backend may return:
 * - An array like [{ secsInZone: 767, zoneNumber: 1, zoneLowBoundary: 116 }, ...]
 * - A record like { "0": seconds, "1": seconds, ... }
 * - Or { "Zone 1": percentage, ... }
 * Convert to percentage-based display values.
 */
function normalizeHrZones(rawZones: any): Record<string, number> {
  // Handle array format (Garmin raw data)
  if (Array.isArray(rawZones)) {
    const total = rawZones.reduce((sum: number, z: any) => sum + (z.secsInZone ?? 0), 0);
    if (total === 0) return {};

    const result: Record<string, number> = {};
    for (const zone of rawZones) {
      const zoneNum = zone.zoneNumber ?? zone.zone ?? 0;
      const secs = zone.secsInZone ?? zone.seconds ?? 0;
      result[`Zone ${zoneNum}`] = Math.round((secs / total) * 100);
    }
    return result;
  }

  // Handle object format
  const entries = Object.entries(rawZones);
  if (entries.length === 0) return {};

  const values = entries.map(([, v]) => (typeof v === "number" ? v : 0));
  const total = values.reduce((sum, v) => sum + v, 0);
  const isSeconds = total > 100;

  const result: Record<string, number> = {};
  for (const [key, value] of entries) {
    const numValue = typeof value === "number" ? value : 0;
    const label = key.startsWith("Zone") ? key : `Zone ${key}`;
    result[label] = isSeconds && total > 0
      ? Math.round((numValue / total) * 100)
      : numValue;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format distance in metres to a readable km string. */
function formatDistance(meters: number | null): string {
  if (meters === null) return "—";
  const km = meters / 1000;
  return km < 10 ? km.toFixed(2) : km.toFixed(1);
}

/** Format elevation gain in metres. */
function formatElevation(meters: number | null): string {
  if (meters === null) return "—";
  return Math.round(meters).toString();
}

/** Format pace in seconds per km to min:sec string (running). */
function formatPace(secPerKm: number | null): string {
  if (secPerKm === null) return "—";
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.round(secPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Format swim pace: convert sec/km to min:sec per 100m. */
function formatSwimPace(secPerKm: number | null): string {
  if (secPerKm === null) return "—";
  const secPer100m = secPerKm / 10; // sec/km ÷ 10 = sec/100m
  const minutes = Math.floor(secPer100m / 60);
  const seconds = Math.round(secPer100m % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Format cycling speed: convert sec/km to km/h. */
function formatSpeed(secPerKm: number | null): string {
  if (secPerKm === null || secPerKm === 0) return "—";
  const kmh = 3600 / secPerKm;
  return kmh.toFixed(1);
}

/** Format heart rate value. */
function formatHR(hr: number | null): string {
  if (hr === null) return "—";
  return Math.round(hr).toString();
}

/** Format training effect value. */
function formatTrainingEffect(aerobic: number | null, label: string | null): string {
  if (aerobic === null) return "—";
  const text = aerobic.toFixed(1);
  return label ? `${text} (${label})` : text;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ActivityDetailSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {/* Metrics grid placeholder */}
      <View style={styles.metricsGrid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={styles.metricCell}>
            <Skeleton width="100%" height={80} borderRadius={12} />
          </View>
        ))}
      </View>

      {/* Sections placeholder */}
      <Skeleton width="100%" height={120} borderRadius={12} />
      <Skeleton width="100%" height={160} borderRadius={12} style={{ marginTop: 12 }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();

  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<ActivityDetail>(`/activities/${id}`);
      setActivity(res.data);
    } catch (err) {
      const apiError = extractApiError(err);
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // --- Error state ---
  if (error && !activity) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Alert message={error} variant="error" onDismiss={() => setError(null)} />
      </View>
    );
  }

  // --- Loading state ---
  if (loading && !activity) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
        <ActivityDetailSkeleton />
      </ScrollView>
    );
  }

  if (!activity) return null;

  // Determine whether to show pace or power based on discipline
  const isPowerDiscipline =
    activity.discipline === "RIDE_ROAD" ||
    activity.discipline === "RIDE_GRAVEL";
  const isSwim = activity.discipline === "SWIM";
  const isCycling = isPowerDiscipline;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Activity name & date */}
      <View style={styles.headerSection}>
        <Text style={[styles.activityName, { color: colors.foreground }]}>
          {activity.name ?? "Untitled Activity"}
        </Text>
        <Text style={[styles.activityDate, { color: colors.mutedForeground }]}>
          {new Date(activity.start_time).toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </Text>
      </View>



      {/* Key metrics grid */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Key Metrics
        </Text>
        <View style={styles.metricsGrid}>
          <View style={styles.metricCell}>
            <MetricTile
              label="Duration"
              value={formatDuration(activity.duration_seconds)}
            />
          </View>
          <View style={styles.metricCell}>
            <MetricTile
              label="Distance"
              value={formatDistance(activity.distance_meters)}
              unit={activity.distance_meters !== null ? "km" : undefined}
            />
          </View>
          <View style={styles.metricCell}>
            <MetricTile
              label="Elevation"
              value={formatElevation(activity.elevation_gain_meters)}
              unit={activity.elevation_gain_meters !== null ? "m" : undefined}
            />
          </View>
          <View style={styles.metricCell}>
            <MetricTile
              label="Avg HR"
              value={formatHR(activity.avg_hr)}
              unit={activity.avg_hr !== null ? "bpm" : undefined}
            />
          </View>
          <View style={styles.metricCell}>
            <MetricTile
              label="Max HR"
              value={formatHR(activity.max_hr)}
              unit={activity.max_hr !== null ? "bpm" : undefined}
            />
          </View>
          <View style={styles.metricCell}>
            {isCycling ? (
              <MetricTile
                label="Avg Speed"
                value={formatSpeed(activity.avg_pace_sec_per_km)}
                unit={activity.avg_pace_sec_per_km !== null ? "km/h" : undefined}
              />
            ) : isSwim ? (
              <MetricTile
                label="Avg Pace"
                value={formatSwimPace(activity.avg_pace_sec_per_km)}
                unit={activity.avg_pace_sec_per_km !== null ? "/100m" : undefined}
              />
            ) : (
              <MetricTile
                label="Avg Pace"
                value={formatPace(activity.avg_pace_sec_per_km)}
                unit={activity.avg_pace_sec_per_km !== null ? "/km" : undefined}
              />
            )}
          </View>
          {/* Power (cycling only) */}
          {isCycling && activity.avg_power_watts != null && (
            <View style={styles.metricCell}>
              <MetricTile
                label="Avg Power"
                value={String(activity.avg_power_watts)}
                unit="W"
              />
            </View>
          )}
          <View style={styles.metricCell}>
            <MetricTile
              label="Cadence"
              value={activity.avg_cadence !== null ? String(activity.avg_cadence) : "—"}
              unit={activity.avg_cadence !== null ? "rpm" : undefined}
            />
          </View>
          <View style={styles.metricCell}>
            <MetricTile
              label="TSS"
              value={activity.tss !== null ? Math.round(activity.tss).toString() : "—"}
            />
          </View>
          <View style={styles.metricCell}>
            <MetricTile
              label="Training Effect"
              value={formatTrainingEffect(
                activity.aerobic_training_effect,
                activity.training_effect_label
              )}
            />
          </View>
        </View>
      </View>

      {/* Laps */}
      {activity.laps && activity.laps.length > 0 ? (
        <View style={styles.section}>
          <LapTable laps={normalizeLaps(activity.laps)} />
        </View>
      ) : null}

      {/* HR Zones */}
      {activity.hr_zones && (Array.isArray(activity.hr_zones) ? activity.hr_zones.length > 0 : Object.keys(activity.hr_zones).length > 0) ? (
        <View style={styles.section}>
          <HRZoneChart zones={normalizeHrZones(activity.hr_zones)} />
        </View>
      ) : null}

      {/* Exercises (strength activities) */}
      {activity.exercises && activity.exercises.length > 0 ? (
        <View style={styles.section}>
          <ExerciseList exercises={activity.exercises} />
        </View>
      ) : null}

      {/* AI Analysis */}
      {activity.ai_analysis ? (
        <View style={styles.section}>
          <Card>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              AI Analysis
            </Text>
            <Text style={[styles.analysisText, { color: colors.foreground }]}>
              {activity.ai_analysis}
            </Text>
            {activity.ai_analyzed_at ? (
              <Text style={[styles.analysisDate, { color: colors.mutedForeground }]}>
                Analyzed{" "}
                {new Date(activity.ai_analyzed_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </Text>
            ) : null}
          </Card>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },
  headerSection: {
    marginBottom: 16,
  },
  activityName: {
    fontSize: 22,
    fontWeight: "700",
  },
  activityDate: {
    fontSize: 14,
    marginTop: 4,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  metricCell: {
    width: "50%",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  skeletonContainer: {
    gap: 12,
  },
  analysisText: {
    fontSize: 15,
    lineHeight: 22,
  },
  analysisDate: {
    fontSize: 12,
    marginTop: 8,
  },
});
