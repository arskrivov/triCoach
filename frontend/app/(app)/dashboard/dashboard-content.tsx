/**
 * DashboardContent — client-side dashboard orchestrator.
 *
 * Manages the full dashboard lifecycle:
 * - Fetches data from GET /dashboard/overview with the user's timezone header
 * - Distributes data to all card components
 * - Reacts to the shared Garmin sync lifecycle
 * - Manages loading, error, and sync notice states
 *
 * Rendered inside a Suspense boundary in page.tsx.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { postGarminSync } from "@/lib/garmin-sync-api";
import {
  runGarminSyncOperation,
  useGarminSyncReload,
  useGarminSyncState,
} from "@/lib/garmin-sync";
import { extractApiError, shouldRedirectToLogin } from "@/lib/error-handling";
import { getUserTimezone } from "@/lib/timezone";
import type { DashboardOverview } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CoachBriefingCard } from "./coach-briefing-card";
import { RecoveryOverviewCard } from "./recovery-overview-card";
import { ActivityOverviewCard } from "./activity-overview-card";
import { UpcomingWorkoutsCard } from "./upcoming-workouts-card";

type SyncNotice = {
  tone: "success" | "error";
  message: string;
};

export function DashboardContent() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<SyncNotice | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);
  const lastFailureHandledRef = useRef<number | null>(null);
  const {
    isSyncing,
    lastFailureAt,
    lastFailureDetail,
  } = useGarminSyncState();

  const loadDashboard = useCallback(async () => {
    setLoadError(null);
    const response = await api.get<DashboardOverview>("/dashboard/overview", {
      headers: { "X-User-Timezone": getUserTimezone() },
      skipAuthRedirect: true,
    } as Parameters<typeof api.get>[1]);
    setData(response.data);
  }, [setLoadError]);

  const clearSyncNoticeTimeout = useCallback(() => {
    if (noticeTimeoutRef.current !== null) {
      window.clearTimeout(noticeTimeoutRef.current);
      noticeTimeoutRef.current = null;
    }
  }, []);

  const showSyncNotice = useCallback((tone: SyncNotice["tone"], message: string) => {
    clearSyncNoticeTimeout();
    setSyncNotice({ tone, message });
    noticeTimeoutRef.current = window.setTimeout(() => {
      setSyncNotice(null);
      noticeTimeoutRef.current = null;
    }, 4000);
  }, [clearSyncNoticeTimeout]);

  const getErrorMessage = useCallback((error: unknown): string => extractApiError(error).message, []);

  const syncLastWeek = useCallback(async () => {
    setSyncNotice(null);
    try {
      await runGarminSyncOperation(
        "dashboard",
        () => postGarminSync("/sync/now", { timezone: getUserTimezone() }),
        getErrorMessage,
      );
    } catch {
      // Sync failure is surfaced via shared Garmin sync state.
    }
  }, [getErrorMessage]);

  useEffect(() => {
    let cancelled = false;

    async function initializeDashboard() {
      try {
        await loadDashboard();
      } catch (error: unknown) {
        const apiError = extractApiError(error);
        if (shouldRedirectToLogin(apiError)) {
          window.location.href = "/login";
          return;
        }
        if (!cancelled) setLoadError(`Failed to load dashboard: ${apiError.message}`);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void initializeDashboard();

    return () => {
      cancelled = true;
      clearSyncNoticeTimeout();
    };
  }, [clearSyncNoticeTimeout, loadDashboard]);

  useGarminSyncReload(useCallback(async (detail) => {
    clearSyncNoticeTimeout();
    setSyncNotice(null);
    setRefreshing(true);

    try {
      await loadDashboard();
      showSyncNotice(
        "success",
        `Synced ${detail.activitiesSynced} activities and ${detail.healthDaysSynced} health days.`,
      );
    } catch {
      showSyncNotice("error", "Dashboard refresh failed after sync.");
    } finally {
      setRefreshing(false);
    }
  }, [clearSyncNoticeTimeout, loadDashboard, showSyncNotice]));

  useEffect(() => {
    if (
      lastFailureAt === null
      || lastFailureDetail === null
      || lastFailureHandledRef.current === lastFailureAt
    ) {
      return;
    }

    lastFailureHandledRef.current = lastFailureAt;
    showSyncNotice("error", lastFailureDetail.message);
  }, [lastFailureAt, lastFailureDetail, showSyncNotice]);

  useEffect(() => {
    const refreshNow = () => setNowMs(Date.now());
    refreshNow();
    const timer = window.setInterval(refreshNow, 60000);
    return () => window.clearInterval(timer);
  }, []);

  function formatLastSync(isoStr: string | null | undefined): string {
    if (!isoStr) return "Never synced";
    if (nowMs === null) {
      return `Last synced ${new Date(isoStr).toLocaleString()}`;
    }
    const diff = nowMs - new Date(isoStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just synced";
    if (minutes < 60) return `Last synced ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Last synced ${hours}h ago`;
    return `Last synced ${Math.floor(hours / 24)}d ago`;
  }

  const showPlaceholderState = loading || isSyncing || refreshing;

  if ((loadError || !data) && !showPlaceholderState) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-[--status-negative]/20 bg-[--status-negative]/10 p-5">
        <p className="text-sm font-medium text-[--status-negative]">{loadError ?? "Failed to load dashboard."}</p>
        <Button variant="outline" size="sm" onClick={() => { setLoading(true); void loadDashboard().finally(() => setLoading(false)); }}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        {showPlaceholderState ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          <p className="text-sm text-muted-foreground">{formatLastSync(data?.last_sync_at)}</p>
        )}
        <Button variant="outline" size="sm" onClick={() => void syncLastWeek()} disabled={isSyncing}>
          {isSyncing ? "Syncing…" : "Sync Now"}
        </Button>
      </div>

      {!isSyncing && !refreshing && syncNotice && (
        <div
          className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            syncNotice.tone === "error"
              ? "border-[--status-negative]/30 bg-[--status-negative]/10 text-[--status-negative]"
              : "border-[--status-positive]/30 bg-[--status-positive]/10 text-[--status-positive]"
          }`}
        >
          <span>{syncNotice.tone === "error" ? "!" : "✓"}</span>
          {syncNotice.message}
        </div>
      )}

      <CoachBriefingCard briefing={data?.briefing ?? null} loading={showPlaceholderState} />

      <div className="grid grid-cols-1 gap-5">
        <RecoveryOverviewCard
          recovery={data?.recovery ?? {
            status: "steady",
            headline: "",
            last_night: {
              date: null,
              sleep_score: null,
              sleep_duration_hours: null,
              hrv_last_night: null,
              resting_hr: null,
              respiration_sleep: null,
              stress_avg: null,
              pulse_ox_avg: null,
              morning_training_readiness_score: null,
            },
            metrics: [],
            sparkline: [],
          }}
          analysis={data?.briefing?.sleep_analysis ?? null}
          loading={showPlaceholderState}
        />
        <ActivityOverviewCard
          activity={data?.activity ?? {
            status: "idle",
            headline: "",
            movement: {
              steps_avg_7d: null,
              daily_calories_avg_7d: null,
            },
            last_7d: {
              sessions: 0,
              distance_km: 0,
              duration_hours: 0,
              tss: 0,
              by_discipline: {
                swim: { sessions: 0, distance_km: 0, duration_hours: 0, avg_calories: null, avg_hr: null },
                bike: { sessions: 0, distance_km: 0, duration_hours: 0, avg_calories: null, avg_hr: null },
                run: { sessions: 0, distance_km: 0, duration_hours: 0, avg_calories: null, avg_hr: null },
                strength: { sessions: 0, distance_km: 0, duration_hours: 0, avg_calories: null, avg_hr: null },
                mobility: { sessions: 0, distance_km: 0, duration_hours: 0, avg_calories: null, avg_hr: null },
              },
            },
            previous_7d: {
              sessions: 0,
              distance_km: 0,
              duration_hours: 0,
              tss: 0,
              by_discipline: {
                swim: { sessions: 0, distance_km: 0, duration_hours: 0, avg_calories: null, avg_hr: null },
                bike: { sessions: 0, distance_km: 0, duration_hours: 0, avg_calories: null, avg_hr: null },
                run: { sessions: 0, distance_km: 0, duration_hours: 0, avg_calories: null, avg_hr: null },
                strength: { sessions: 0, distance_km: 0, duration_hours: 0, avg_calories: null, avg_hr: null },
                mobility: { sessions: 0, distance_km: 0, duration_hours: 0, avg_calories: null, avg_hr: null },
              },
            },
            last_30d: {
              sessions: 0,
              distance_km: 0,
              duration_hours: 0,
              discipline_breakdown: {},
            },
            fitness: {
              ctl: null,
              atl: null,
              tsb: null,
              direction: "unknown",
              vo2max_running: null,
              vo2max_cycling: null,
            },
            planned: {
              upcoming_count: 0,
              next_workout: null,
              completion_rate_this_week: null,
            },
          }}
          analysis={data?.briefing?.activity_analysis ?? null}
          fitnessTimeline={data?.fitness_timeline}
          loading={showPlaceholderState}
        />
      </div>

      <UpcomingWorkoutsCard workouts={data?.upcoming_workouts ?? []} loading={showPlaceholderState} />
    </div>
  );
}
