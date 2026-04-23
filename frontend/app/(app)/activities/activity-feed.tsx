"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  getDisciplineMeta,
  formatDuration,
  formatRelativeDate,
  primaryStat,
} from "@/lib/format";
import type { ActivitySummary, Discipline } from "@/lib/types";
import { Button } from "@/components/ui/button";

const FILTERS: { label: string; value: Discipline | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "🏃 Run", value: "RUN" },
  { label: "🏊 Swim", value: "SWIM" },
  { label: "🚴 Road", value: "RIDE_ROAD" },
  { label: "🚵 Gravel", value: "RIDE_GRAVEL" },
  { label: "🏋️ Strength", value: "STRENGTH" },
  { label: "🧘 Yoga", value: "YOGA" },
  { label: "🤸 Mobility", value: "MOBILITY" },
];

const PAGE_SIZE = 20;

export function ActivityFeed() {
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [filter, setFilter] = useState<Discipline | "ALL">("ALL");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchActivities = useCallback(
    async (discipline: Discipline | "ALL", off: number, replace: boolean) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {
          limit: PAGE_SIZE,
          offset: off,
        };
        if (discipline !== "ALL") params.discipline = discipline;
        const res = await api.get<ActivitySummary[]>("/activities", { params });
        const items = res.data;
        setActivities((prev) => (replace ? items : [...prev, ...items]));
        setHasMore(items.length === PAGE_SIZE);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    queueMicrotask(() => {
      void fetchActivities(filter, 0, true);
    });
  }, [filter, fetchActivities]);

  function loadMore() {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    fetchActivities(filter, next, false);
  }

  return (
    <div>
      {/* Filter pills */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-2 scrollbar-hide sm:flex-wrap sm:overflow-x-visible">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setOffset(0);
              setFilter(f.value);
            }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Activity list */}
      {activities.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No activities found. Sync your Garmin to import data.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {activities.map((a) => (
            <ActivityCard key={a.id} activity={a} />
          ))}
        </div>
      )}

      {hasMore && activities.length > 0 && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ActivityCard({ activity: a }: { activity: ActivitySummary }) {
  const { label, icon, color } = getDisciplineMeta(a.discipline);
  return (
    <Link
      href={`/activities/${a.id}`}
      className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-sm transition-all"
    >
      <span
        className={`w-10 h-10 flex items-center justify-center rounded-full text-lg shrink-0 ${color}`}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{a.name || label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatRelativeDate(a.start_time)}
          {a.duration_seconds ? ` · ${formatDuration(a.duration_seconds)}` : ""}
          {a.avg_hr ? ` · ${a.avg_hr} bpm` : ""}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-semibold tabular-nums text-sm">{primaryStat(a)}</p>
        {a.tss && (
          <p className="text-xs tabular-nums text-muted-foreground">TSS {a.tss.toFixed(0)}</p>
        )}
      </div>
    </Link>
  );
}
