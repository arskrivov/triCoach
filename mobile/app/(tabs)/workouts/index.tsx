/**
 * Workout Hub screen — Training plan view with calendars, races, and plan management.
 *
 * Fetches `GET /plans` and `GET /plans/{id}` on mount. Displays plan name,
 * date range, weekly hours, phase indicator, weekly coach briefing, and
 * weekly/monthly calendar views. Provides "Generate & Sync" to enrich the
 * current week and push workouts to Garmin. Shows an empty state when no
 * active plan exists, prompting the user to add a race and generate a plan.
 *
 * @see Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.9, 8.10
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { PhaseIndicator } from "@/components/workouts/PhaseIndicator";
import { TrainingCalendar } from "@/components/workouts/TrainingCalendar";
import { WorkoutDetailModal } from "@/components/workouts/WorkoutDetailModal";
import { RacesSection } from "@/components/workouts/RacesSection";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { useRefreshOnSync } from "@/hooks/useRefreshOnSync";
import { useThemeColors } from "@/lib/theme";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  extractApiError,
  isNetworkError,
  getNetworkErrorMessage,
} from "@/lib/error-handling";
import type {
  Goal,
  PlanWorkout,
  TrainingPlan,
  WorkoutStatus,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Response shape from GET /plans/{id} — plan with embedded workouts. */
interface PlanWithWorkouts extends TrainingPlan {
  workouts: PlanWorkout[];
}

/** Response shape from GET /plans/{id}/week-briefing/{week}. */
interface WeekBriefing {
  week_number: number;
  briefing: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine which plan week number a given date falls in.
 * Returns 1-based week number, clamped to [1, totalWeeks].
 */
function getCurrentWeekNumber(
  startDate: string,
  totalWeeks: number
): number {
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(week, totalWeeks));
}

/**
 * Filter workouts belonging to a specific plan week.
 */
function getWorkoutsForWeek(
  workouts: PlanWorkout[],
  week: number
): PlanWorkout[] {
  return workouts.filter((w) => w.plan_week === week);
}

/**
 * Determine the display status for a workout based on its scheduled date
 * and whether it has been completed (simple heuristic: if garmin_workout_id
 * is set or the date is in the past, mark accordingly).
 */
function resolveWorkoutStatus(workout: PlanWorkout): WorkoutStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!workout.scheduled_date) return "upcoming";

  const scheduled = new Date(workout.scheduled_date);
  scheduled.setHours(0, 0, 0, 0);

  const todayStr = today.toISOString().slice(0, 10);
  const scheduledStr = scheduled.toISOString().slice(0, 10);

  if (scheduledStr === todayStr) return "today";
  if (scheduled < today) return "completed";
  return "upcoming";
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function WorkoutHubSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <Skeleton width="100%" height={80} borderRadius={12} />
      <Skeleton width="100%" height={40} borderRadius={8} />
      <Skeleton width="100%" height={120} borderRadius={12} />
      <Skeleton width="100%" height={300} borderRadius={12} />
      <Skeleton width="100%" height={200} borderRadius={12} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({
  races,
  onRacesChanged,
  onGeneratePlan,
  generatingPlan,
}: {
  races: Goal[];
  onRacesChanged: () => void;
  onGeneratePlan: () => void;
  generatingPlan: boolean;
}) {
  const colors = useThemeColors();

  return (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyIcon]}>📋</Text>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        No Active Training Plan
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
        Add a race below and generate a personalised training plan.
      </Text>

      <RacesSection
        races={races}
        onRacesChanged={onRacesChanged}
        onGeneratePlan={onGeneratePlan}
        generatingPlan={generatingPlan}
        style={styles.emptyRaces}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function WorkoutHubScreen() {
  const colors = useThemeColors();

  // Data state
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [activePlan, setActivePlan] = useState<PlanWithWorkouts | null>(null);
  const [races, setRaces] = useState<Goal[]>([]);
  const [weekBriefing, setWeekBriefing] = useState<WeekBriefing | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<"weekly" | "monthly">("weekly");
  const [currentWeek, setCurrentWeek] = useState(1);

  // Modal state
  const [selectedWorkout, setSelectedWorkout] = useState<PlanWorkout | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [deletingWorkout, setDeletingWorkout] = useState(false);

  // Action state
  const [enriching, setEnriching] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchRaces = useCallback(async () => {
    try {
      const res = await api.get<Goal[]>("/coach/goals");
      setRaces(res.data);
    } catch {
      // Non-critical — races section will show empty
    }
  }, []);

  const fetchWeekBriefing = useCallback(
    async (planId: string, week: number) => {
      try {
        const res = await api.get<WeekBriefing>(
          `/plans/${planId}/week-briefing/${week}`
        );
        setWeekBriefing(res.data);
      } catch {
        setWeekBriefing(null);
      }
    },
    []
  );

  const fetchData = useCallback(async () => {
    try {
      // Fetch all plans
      const plansRes = await api.get<TrainingPlan[]>("/plans");
      setPlans(plansRes.data);

      // Find the active plan
      const active = plansRes.data.find((p) => p.status === "active");

      if (active) {
        // Fetch full plan with workouts
        const planRes = await api.get<PlanWithWorkouts>(`/plans/${active.id}`);
        setActivePlan(planRes.data);

        // Determine current week
        const totalWeeks = planRes.data.plan_structure?.total_weeks ?? 1;
        const week = getCurrentWeekNumber(planRes.data.start_date, totalWeeks);
        setCurrentWeek(week);

        // Fetch week briefing
        await fetchWeekBriefing(active.id, week);
      } else {
        setActivePlan(null);
        setWeekBriefing(null);
      }

      // Fetch races
      await fetchRaces();

      setError(null);
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        setError(getNetworkErrorMessage());
      } else {
        setError(extractApiError(err).message);
      }
    }
  }, [fetchRaces, fetchWeekBriefing]);

  // Initial load
  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      await fetchData();
      if (mounted) setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [fetchData]);

  // Auto-refresh on sync
  useRefreshOnSync(fetchData);

  // Refresh week briefing when week changes
  useEffect(() => {
    if (activePlan) {
      fetchWeekBriefing(activePlan.id, currentWeek);
    }
  }, [activePlan?.id, currentWeek, fetchWeekBriefing]);

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const totalWeeks = activePlan?.plan_structure?.total_weeks ?? 0;
  const phases = activePlan?.plan_structure?.phases ?? [];
  const allWorkouts = activePlan?.workouts ?? [];

  const weekWorkouts = useMemo(
    () => getWorkoutsForWeek(allWorkouts, currentWeek),
    [allWorkouts, currentWeek]
  );

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const handleWorkoutPress = (workout: PlanWorkout) => {
    setSelectedWorkout(workout);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedWorkout(null);
  };

  const handleDeleteWorkout = async (workoutId: string) => {
    setDeletingWorkout(true);
    try {
      await api.delete(`/workouts/${workoutId}`);
      handleCloseModal();
      await fetchData();
    } catch (err: unknown) {
      setError(extractApiError(err).message);
    } finally {
      setDeletingWorkout(false);
    }
  };

  const handleWeekChange = (week: number) => {
    setCurrentWeek(week);
  };

  const handleEnrichAndSync = async () => {
    if (!activePlan) return;

    setEnriching(true);
    setError(null);
    try {
      // Step 1: Enrich the current week with detailed workout programs
      await api.post(`/plans/${activePlan.id}/enrich-week/${currentWeek}`);
      // Step 2: Sync enriched workouts to Garmin
      await api.post(`/plans/${activePlan.id}/sync-garmin`);
      // Refresh plan data
      await fetchData();
    } catch (err: unknown) {
      setError(extractApiError(err).message);
    } finally {
      setEnriching(false);
    }
  };

  const handleGeneratePlan = async () => {
    setGeneratingPlan(true);
    setError(null);
    try {
      await api.post("/plans/generate", {});
      await fetchData();
    } catch (err: unknown) {
      setError(extractApiError(err).message);
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleRacesChanged = () => {
    fetchRaces();
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

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
      {/* Error alert */}
      {error && (
        <Alert
          message={error}
          variant="error"
          onDismiss={() => setError(null)}
          style={styles.alert}
        />
      )}

      {/* Loading skeleton */}
      {loading && !activePlan ? (
        <WorkoutHubSkeleton />
      ) : !activePlan ? (
        /* Empty state — no active plan */
        <EmptyState
          races={races}
          onRacesChanged={handleRacesChanged}
          onGeneratePlan={handleGeneratePlan}
          generatingPlan={generatingPlan}
        />
      ) : (
        /* Active plan view */
        <View style={styles.sectionsContainer}>
          {/* Plan header */}
          <Card>
            <Text style={[styles.planName, { color: colors.foreground }]}>
              {activePlan.name}
            </Text>
            <View style={styles.planMeta}>
              <Text style={[styles.planMetaText, { color: colors.mutedForeground }]}>
                {formatDate(activePlan.start_date)} — {formatDate(activePlan.end_date)}
              </Text>
              <Badge
                text={`${activePlan.weekly_hours}h/week`}
                variant="default"
              />
            </View>
          </Card>

          {/* Phase indicator */}
          {phases.length > 0 && (
            <PhaseIndicator
              phases={phases}
              currentWeek={currentWeek}
            />
          )}

          {/* Weekly coach briefing */}
          {weekBriefing?.briefing && (
            <Card>
              <Text style={[styles.briefingLabel, { color: colors.mutedForeground }]}>
                Week {weekBriefing.week_number} Briefing
              </Text>
              <Text style={[styles.briefingText, { color: colors.foreground }]}>
                {weekBriefing.briefing}
              </Text>
            </Card>
          )}

          {/* Training Calendar — expandable week/month with agenda */}
          <TrainingCalendar
            workouts={allWorkouts}
            getWorkoutStatus={resolveWorkoutStatus}
            onWorkoutPress={handleWorkoutPress}
          />

          {/* Races section */}
          <RacesSection
            races={races}
            onRacesChanged={handleRacesChanged}
            onGeneratePlan={handleGeneratePlan}
            generatingPlan={generatingPlan}
          />
        </View>
      )}

      {/* Workout detail modal */}
      <WorkoutDetailModal
        workout={selectedWorkout}
        status={selectedWorkout ? resolveWorkoutStatus(selectedWorkout) : "upcoming"}
        visible={modalVisible}
        onClose={handleCloseModal}
        onDelete={handleDeleteWorkout}
        deleting={deletingWorkout}
      />
    </ScrollView>
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
  // Plan header
  planName: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  planMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  planMetaText: {
    fontSize: 13,
    fontWeight: "500",
  },
  // Briefing
  briefingLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  briefingText: {
    fontSize: 14,
    lineHeight: 22,
  },
  // Calendar toggle
  // (removed — using unified TrainingCalendar)
  // Empty state
  emptyContainer: {
    alignItems: "center",
    paddingTop: 40,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: 24,
    lineHeight: 22,
  },
  emptyRaces: {
    width: "100%",
    marginTop: 16,
  },
});
