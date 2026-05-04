/**
 * Activity Feed screen — Paginated list of all activities with discipline filtering.
 *
 * Fetches `GET /activities` with `limit` and `offset` query params.
 * Supports discipline filtering via DisciplineFilter, infinite scroll via
 * FlatList `onEndReached`, and pull-to-refresh. Tapping an activity navigates
 * to the Activity Detail screen.
 *
 * @see Requirements 6.1, 6.3, 6.4, 6.5
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { DisciplineFilter } from "@/components/activities/DisciplineFilter";
import { ActivityListItem } from "@/components/activities/ActivityListItem";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { useThemeColors } from "@/lib/theme";
import { api } from "@/lib/api";
import {
  extractApiError,
  isNetworkError,
  getNetworkErrorMessage,
} from "@/lib/error-handling";
import type { ActivitySummary, Discipline } from "@/lib/types";

const PAGE_SIZE = 20;

/**
 * Skeleton placeholder shown during initial load.
 */
function ActivityFeedSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} width="100%" height={56} borderRadius={8} />
      ))}
    </View>
  );
}

export default function ActivityFeedScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discipline, setDiscipline] = useState<Discipline | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Track offset for pagination
  const offsetRef = useRef(0);

  /**
   * Fetch a page of activities from the API.
   * When `reset` is true, fetches from offset 0 and replaces the list.
   */
  const fetchActivities = useCallback(
    async (reset: boolean = false) => {
      try {
        const offset = reset ? 0 : offsetRef.current;
        const params: Record<string, string | number> = {
          limit: PAGE_SIZE,
          offset,
        };
        if (discipline) {
          params.discipline = discipline;
        }

        const res = await api.get<ActivitySummary[]>("/activities", { params });
        const newActivities = res.data;

        if (reset) {
          setActivities(newActivities);
          offsetRef.current = newActivities.length;
        } else {
          setActivities((prev) => [...prev, ...newActivities]);
          offsetRef.current = offset + newActivities.length;
        }

        setHasMore(newActivities.length >= PAGE_SIZE);
        setError(null);
      } catch (err: unknown) {
        if (isNetworkError(err)) {
          setError(getNetworkErrorMessage());
        } else {
          const apiError = extractApiError(err);
          setError(apiError.message);
        }
      }
    },
    [discipline]
  );

  // Initial load and reload when discipline filter changes
  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setHasMore(true);
      await fetchActivities(true);
      if (mounted) {
        setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [fetchActivities]);

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchActivities(true);
    setRefreshing(false);
  }, [fetchActivities]);

  // Infinite scroll — load next page
  const handleEndReached = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    await fetchActivities(false);
    setLoadingMore(false);
  }, [loadingMore, hasMore, loading, fetchActivities]);

  // Navigate to activity detail
  const handleActivityPress = useCallback(
    (activityId: string) => {
      router.push(`/dashboard/activity/${activityId}`);
    },
    [router]
  );

  // Render a single activity row
  const renderItem = useCallback(
    ({ item }: { item: ActivitySummary }) => (
      <ActivityListItem
        activity={item}
        onPress={() => handleActivityPress(item.id)}
      />
    ),
    [handleActivityPress]
  );

  // Separator between items
  const renderSeparator = useCallback(
    () => (
      <View
        style={[styles.separator, { backgroundColor: colors.cardBorder }]}
      />
    ),
    [colors.cardBorder]
  );

  // Footer: loading indicator for infinite scroll
  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [loadingMore, colors.primary]);

  // Empty state when no activities match
  const renderEmpty = useCallback(() => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          {discipline
            ? "No activities found for this discipline."
            : "No activities yet. Sync your Garmin to get started."}
        </Text>
      </View>
    );
  }, [loading, discipline, colors.mutedForeground]);

  const keyExtractor = useCallback(
    (item: ActivitySummary) => item.id,
    []
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Error alert */}
      {error && (
        <Alert
          message={error}
          variant="error"
          onDismiss={() => setError(null)}
          style={styles.errorAlert}
        />
      )}

      {/* Discipline filter bar */}
      <DisciplineFilter selected={discipline} onSelect={setDiscipline} />

      {/* Activity list */}
      {loading && activities.length === 0 ? (
        <ActivityFeedSkeleton />
      ) : (
        <FlatList
          data={activities}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ItemSeparatorComponent={renderSeparator}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorAlert: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 36,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  skeletonContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
});
