/**
 * DashboardContent — client-side dashboard orchestrator.
 *
 * Manages the full dashboard lifecycle:
 * - Fetches data from GET /dashboard/overview with the user's timezone header
 * - Distributes data to all card components
 * - Handles Garmin sync events (started / completed / failed)
 * - Manages loading, error, and sync notice states
 *
 * Rendered inside a Suspense boundary in page.tsx.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { postGarminSync } from "@/lib/garmin-sync-api";
import {
  GARMIN_SYNC_COMPLETED_EVENT,
  GARMIN_SYNC_FAILED_EVENT,
  GARMIN_SYNC_STARTED_EVENT,
  type GarminSyncCompletedDetail,
  type GarminSyncFailedDetail,
} from "@/lib/garmin-sync";
import { extractApiError, shouldRedirectToLogin } from "@/lib/error-handling";
import { getUserTimezone } from "@/lib/timezone";
import type { DashboardOverview } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CoachBriefingCard } from "./coach-briefing-card";
import { RecoveryOverviewCard } from "./recovery-overview-card";
import { ActivityOverviewCard } from "./activity-overview-card";
import { RecentActivitiesCard } from "./recent-activities-card";
import { UpcomingWorkoutsCard } from "./upcoming-workouts-card";

type SyncNotice = {
  tone: "success" | "error";
  message: string;
};

export function DashboardContent() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<SyncNotice | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const noticeTimeoutRef = useRef<number | null>(null);

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

  function getErrorMessage(error: unknown): string {
    return extractApiError(error).message;
  }

  const syncLastWeek = useCallback(async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const response = await postGarminSync("/sync/now", { timezone: getUserTimezone() });
      await loadDashboard();
      showSyncNotice(
        "success",
        `Sync complete: ${response.activities_synced} activities, ${response.health_days_synced} health days.`,
      );
    } catch (error: unknown) {
      showSyncNotice("error", getErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  }, [loadDashboard, showSyncNotice]);

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

    function onGarminSyncStarted() {
      setSyncing(true);
      clearSyncNoticeTimeout();
      setSyncNotice(null);
    }

    function onGarminSynced(event: Event) {
      const detail = (event as CustomEvent<GarminSyncCompletedDetail>).detail;
      setSyncing(false);
      void loadDashboard()
        .then(() => {
          showSyncNotice(
            "success",
            `Synced ${detail.activitiesSynced} activities and ${detail.healthDaysSynced} health days.`,
          );
        })
        .catch(() => {
          showSyncNotice("error", "Dashboard refresh failed after sync.");
        });
    }

    function onGarminSyncFailed(event: Event) {
      const detail = (event as CustomEvent<GarminSyncFailedDetail>).detail;
      setSyncing(false);
      showSyncNotice("error", detail.message);
    }

    window.addEventListener(GARMIN_SYNC_STARTED_EVENT, onGarminSyncStarted);
    window.addEventListener(GARMIN_SYNC_COMPLETED_EVENT, onGarminSynced);
    window.addEventListener(GARMIN_SYNC_FAILED_EVENT, onGarminSyncFailed);

    return () => {
      cancelled = true;
      window.removeEventListener(GARMIN_SYNC_STARTED_EVENT, onGarminSyncStarted);
      window.removeEventListener(GARMIN_SYNC_COMPLETED_EVENT, onGarminSynced);
      window.removeEventListener(GARMIN_SYNC_FAILED_EVENT, onGarminSyncFailed);
      clearSyncNoticeTimeout();
    };
  }, [showSyncNotice, clearSyncNoticeTimeout, loadDashboard]);

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

  if (loading) return <div className="text-zinc-400 text-sm">Loading…</div>;

  if (loadError || !data) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-5">
        <p className="text-sm font-medium text-rose-700">{loadError ?? "Failed to load dashboard."}</p>
        <Button variant="outline" size="sm" onClick={() => { setLoading(true); void loadDashboard().finally(() => setLoading(false)); }}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500">{formatLastSync(data.last_sync_at)}</p>
        <Button variant="outline" size="sm" onClick={() => void syncLastWeek()} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync Now"}
        </Button>
      </div>

      {syncing && (
        <div className="flex items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700 shadow-sm">
          <span className="inline-block animate-spin text-base">↻</span>
          Syncing Garmin data…
        </div>
      )}

      {!syncing && syncNotice && (
        <div
          className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            syncNotice.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          <span>{syncNotice.tone === "error" ? "!" : "✓"}</span>
          {syncNotice.message}
        </div>
      )}

      <CoachBriefingCard briefing={data.briefing} />

      <div className="grid grid-cols-1 gap-5">
        <RecoveryOverviewCard recovery={data.recovery} analysis={data.briefing?.sleep_analysis ?? null} />
        <ActivityOverviewCard
          activity={data.activity}
          analysis={data.briefing?.activity_analysis ?? null}
          fitnessTimeline={data.fitness_timeline}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[8fr_4fr]">
        <RecentActivitiesCard activities={data.recent_activities} />
        <UpcomingWorkoutsCard workouts={data.upcoming_workouts} />
      </div>
    </div>
  );
}
