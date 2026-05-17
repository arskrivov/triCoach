/**
 * Dashboard screen — Main screen composing all dashboard sections.
 *
 * Fetches `GET /dashboard/overview` with `X-User-Timezone` header on mount.
 * Composes SyncStatusBar, BriefingCard, RecoveryOverview, RecoveryTrendChart,
 * ActivityOverview, FitnessFormChart, and UpcomingWorkouts in a ScrollView.
 * Supports pull-to-refresh via RefreshControl, skeleton placeholders while
 * loading, and auto-refresh on sync completion via useRefreshOnSync.
 *
 * @see Requirements 5.1, 5.13, 5.14
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { BriefingCard } from "@/components/dashboard/BriefingCard";
import { RecoveryOverview } from "@/components/dashboard/RecoveryOverview";
import { RecoveryTrendChart } from "@/components/charts/RecoveryTrendChart";
import { ActivityOverview } from "@/components/dashboard/ActivityOverview";
import { UpcomingWorkouts } from "@/components/dashboard/UpcomingWorkouts";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { useRefreshOnSync } from "@/hooks/useRefreshOnSync";
import { useSyncState } from "@/hooks/useSyncState";
import { useThemeColors } from "@/lib/theme";
import { api } from "@/lib/api";
import { extractApiError, isNetworkError, getNetworkErrorMessage } from "@/lib/error-handling";
import type { DashboardOverview } from "@/lib/types";

/**
 * Skeleton placeholder for the dashboard while data is loading.
 * Renders approximate shapes matching each dashboard section.
 */
function DashboardSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {/* BriefingCard skeleton */}
      <Skeleton width="100%" height={160} borderRadius={12} />

      {/* RecoveryOverview skeleton */}
      <Skeleton width="100%" height={280} borderRadius={12} />

      {/* RecoveryTrendChart skeleton */}
      <Skeleton width="100%" height={300} borderRadius={12} />

      {/* ActivityOverview skeleton */}
      <Skeleton width="100%" height={280} borderRadius={12} />

      {/* FitnessFormChart skeleton */}
      <Skeleton width="100%" height={320} borderRadius={12} />

      {/* UpcomingWorkouts skeleton */}
      <Skeleton width="100%" height={140} borderRadius={12} />
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The sync icon lives in the header (see dashboard/_layout.tsx) and stores
  // failures in the global sync store. Surface them here so users get feedback
  // (Garmin session expired, network error, etc.) instead of a silent no-op.
  const syncError = useSyncState().lastError;

  const fetchData = useCallback(async () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await api.get<DashboardOverview>("/dashboard/overview", {
        headers: { "X-User-Timezone": tz },
      });
      setData(res.data);
      setError(null);
    } catch (err: unknown) {
      // Preserve previously loaded data on refresh failure (Req 17.5)
      console.log("[Dashboard] fetch error:", err);
      if (isNetworkError(err)) {
        setError(getNetworkErrorMessage());
      } else {
        const apiError = extractApiError(err);
        setError(apiError.message || "Unknown error loading dashboard");
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      await fetchData();
      if (mounted) {
        setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [fetchData]);

  // Auto-refresh when a Garmin sync completes
  useRefreshOnSync(fetchData);

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

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
      {/* Error alert — shown above content, does not clear existing data */}
      {error && (
        <Alert
          message={error}
          variant="error"
          onDismiss={() => setError(null)}
          style={styles.errorAlert}
        />
      )}

      {/* Sync error alert — surfaces failures from the header Sync icon. */}
      {syncError && (
        <Alert
          message={syncError}
          variant="error"
          style={styles.errorAlert}
        />
      )}

      {/* Loading skeleton */}
      {loading && !data ? (
        <DashboardSkeleton />
      ) : data ? (
        <View style={styles.sectionsContainer}>
          {/* 1. Coach Briefing */}
          <BriefingCard briefing={data.briefing} />

          {/* 2. Recovery Trend Chart — last 7 days */}
          <RecoveryTrendChart data={data.recovery.sparkline.slice(-7)} />

          {/* 3. Recovery Overview (metric cards) */}
          <RecoveryOverview recovery={data.recovery} />

          {/* 4. Activity Overview (includes fitness sparkline cards) */}
          <ActivityOverview activity={data.activity} fitnessTimeline={data.fitness_timeline.slice(-7)} />

          {/* See all activities link */}
          <TouchableOpacity
            style={styles.seeAllLink}
            onPress={() => router.push("/dashboard/activities")}
            activeOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel="See all activities"
          >
            <Text style={[styles.seeAllText, { color: colors.primary }]}>
              See all activities →
            </Text>
          </TouchableOpacity>

          {/* 5. Upcoming Workouts */}
          <UpcomingWorkouts workouts={data.upcoming_workouts} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  errorAlert: {
    marginBottom: 12,
  },
  skeletonContainer: {
    gap: 14,
  },
  sectionsContainer: {
    gap: 14,
  },
  seeAllLink: {
    alignSelf: "flex-end",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
    marginTop: -6,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
