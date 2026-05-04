/**
 * Workout Detail screen — View a single workout's full details.
 *
 * Fetches `GET /workouts/{id}` and displays name, discipline badge,
 * scheduled date, description, estimated duration, and estimated TSS.
 * Provides an "Edit" button that navigates to the Workout Builder pre-filled.
 *
 * @see Requirements 10.1, 10.2, 10.3, 10.4
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useThemeColors } from "@/lib/theme";
import { api } from "@/lib/api";
import { formatDate, formatDuration, getDisciplineMeta } from "@/lib/format";
import {
  extractApiError,
  isNetworkError,
  getNetworkErrorMessage,
} from "@/lib/error-handling";
import type { Workout } from "@/lib/types";

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <Skeleton width="60%" height={28} borderRadius={8} />
      <Skeleton width={80} height={24} borderRadius={6} />
      <Skeleton width="100%" height={100} borderRadius={12} />
      <Skeleton width="100%" height={60} borderRadius={12} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WorkoutDetailScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchWorkout = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get<Workout>(`/workouts/${id}`);
      setWorkout(res.data);
      setError(null);
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        setError(getNetworkErrorMessage());
      } else {
        setError(extractApiError(err).message);
      }
    }
  }, [id]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      await fetchWorkout();
      if (mounted) setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [fetchWorkout]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchWorkout();
    setRefreshing(false);
  }, [fetchWorkout]);

  // -------------------------------------------------------------------------
  // Edit navigation
  // -------------------------------------------------------------------------

  const handleEdit = useCallback(() => {
    if (!workout) return;

    router.push({
      pathname: "/(tabs)/workouts/builder",
      params: {
        id: workout.id,
        name: workout.name,
        discipline: workout.discipline,
        scheduled_date: workout.scheduled_date ?? "",
        description: workout.description ?? "",
        content: workout.content ? JSON.stringify(workout.content) : "",
        is_template: workout.is_template ? "true" : "false",
      },
    });
  }, [workout, router]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const disciplineMeta = workout
    ? getDisciplineMeta(workout.discipline)
    : null;

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Error */}
      {error && (
        <Alert
          message={error}
          variant="error"
          onDismiss={() => setError(null)}
          style={styles.alert}
        />
      )}

      {/* Loading */}
      {loading && !workout ? (
        <DetailSkeleton />
      ) : workout ? (
        <View style={styles.sectionsContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.workoutName, { color: colors.foreground }]}>
              {workout.name}
            </Text>
            {disciplineMeta && (
              <Badge
                text={`${disciplineMeta.icon} ${disciplineMeta.label}`}
                color={disciplineMeta.color}
              />
            )}
          </View>

          {/* Metadata card */}
          <Card>
            <View style={styles.metaGrid}>
              {/* Scheduled date */}
              {workout.scheduled_date && (
                <MetaItem
                  label="Scheduled"
                  value={formatDate(workout.scheduled_date)}
                  colors={colors}
                />
              )}

              {/* Template badge */}
              {workout.is_template && (
                <MetaItem label="Type" value="Template" colors={colors} />
              )}

              {/* Estimated duration */}
              {workout.estimated_duration_seconds != null && (
                <MetaItem
                  label="Est. Duration"
                  value={formatDuration(workout.estimated_duration_seconds)}
                  colors={colors}
                />
              )}

              {/* Estimated TSS */}
              {workout.estimated_tss != null && (
                <MetaItem
                  label="Est. TSS"
                  value={String(workout.estimated_tss)}
                  colors={colors}
                />
              )}

              {/* Estimated volume */}
              {workout.estimated_volume_kg != null && (
                <MetaItem
                  label="Est. Volume"
                  value={`${workout.estimated_volume_kg.toLocaleString()} kg`}
                  colors={colors}
                />
              )}
            </View>
          </Card>

          {/* Description */}
          {workout.description ? (
            <Card>
              <Text
                style={[
                  styles.descriptionLabel,
                  { color: colors.mutedForeground },
                ]}
              >
                Description
              </Text>
              <Text
                style={[styles.descriptionText, { color: colors.foreground }]}
              >
                {workout.description}
              </Text>
            </Card>
          ) : null}

          {/* Workout content summary */}
          {workout.content && (
            <Card>
              <Text
                style={[
                  styles.descriptionLabel,
                  { color: colors.mutedForeground },
                ]}
              >
                Workout Content
              </Text>
              <WorkoutContentSummary
                content={workout.content}
                builderType={workout.builder_type}
                colors={colors}
              />
            </Card>
          )}

          {/* Edit button */}
          <Button
            title="Edit Workout"
            onPress={handleEdit}
            variant="primary"
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// MetaItem sub-component
// ---------------------------------------------------------------------------

function MetaItem({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={styles.metaItem}>
      <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[styles.metaValue, { color: colors.foreground }]}>
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// WorkoutContentSummary sub-component
// ---------------------------------------------------------------------------

function WorkoutContentSummary({
  content,
  builderType,
  colors,
}: {
  content: Record<string, unknown>;
  builderType: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  if (builderType === "endurance" && Array.isArray(content.steps)) {
    return (
      <View style={styles.contentList}>
        {(content.steps as Array<{ type: string; duration_min: number }>).map(
          (step, i) => (
            <Text
              key={i}
              style={[styles.contentItem, { color: colors.foreground }]}
            >
              {i + 1}. {step.type} — {step.duration_min} min
            </Text>
          )
        )}
      </View>
    );
  }

  if (builderType === "strength" && Array.isArray(content.blocks)) {
    return (
      <View style={styles.contentList}>
        {(
          content.blocks as Array<{
            type: string;
            exercises: Array<{
              name: string;
              sets: number;
              reps: number;
              weight_kg: number;
            }>;
          }>
        ).map((block, bi) => (
          <View key={bi} style={styles.contentBlock}>
            <Text
              style={[styles.contentBlockTitle, { color: colors.foreground }]}
            >
              {block.type.toUpperCase()}
            </Text>
            {block.exercises.map((ex, ei) => (
              <Text
                key={ei}
                style={[styles.contentItem, { color: colors.foreground }]}
              >
                • {ex.name || "Unnamed"} — {ex.sets}×{ex.reps}
                {ex.weight_kg > 0 ? ` @ ${ex.weight_kg}kg` : ""}
              </Text>
            ))}
          </View>
        ))}
      </View>
    );
  }

  if (builderType === "yoga" && Array.isArray(content.poses)) {
    return (
      <View style={styles.contentList}>
        {(
          content.poses as Array<{
            name: string;
            duration_seconds: number;
            side: string;
          }>
        ).map((pose, i) => (
          <Text
            key={i}
            style={[styles.contentItem, { color: colors.foreground }]}
          >
            {i + 1}. {pose.name || "Unnamed"} — {pose.duration_seconds}s
            {pose.side !== "none" ? ` (${pose.side})` : ""}
          </Text>
        ))}
      </View>
    );
  }

  return (
    <Text style={[styles.contentItem, { color: colors.mutedForeground }]}>
      No structured content available.
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  alert: {
    marginBottom: 12,
  },
  skeletonContainer: {
    gap: 14,
  },
  sectionsContainer: {
    gap: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  workoutName: {
    fontSize: 22,
    fontWeight: "700",
    flex: 1,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  metaItem: {
    minWidth: 100,
    gap: 2,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  metaValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  descriptionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
  },
  contentList: {
    gap: 4,
  },
  contentBlock: {
    gap: 2,
    marginBottom: 8,
  },
  contentBlockTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  contentItem: {
    fontSize: 14,
    lineHeight: 20,
  },
});
