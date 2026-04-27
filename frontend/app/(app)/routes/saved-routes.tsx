"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, CheckCircle, Loader2 } from "lucide-react";
import { api, linkRouteToWorkout, getRouteSuggestions } from "@/lib/api";
import { getDisciplineMeta, formatDuration } from "@/lib/format";
import type { Discipline, RouteSuggestion, WorkoutRouteContext } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { SuggestionCard } from "./suggestion-card";

interface Route {
  id: string;
  name: string;
  sport: string;
  distance_meters: number | null;
  elevation_gain_meters: number | null;
  estimated_duration_seconds: number | null;
  is_loop: boolean;
}

const SPORT_FILTERS = [
  { label: "All", value: "" },
  { label: "🏃 Run", value: "RUN" },
  { label: "🚴 Road", value: "RIDE_ROAD" },
  { label: "🚵 Gravel", value: "RIDE_GRAVEL" },
];

interface SavedRoutesProps {
  workoutContext?: WorkoutRouteContext | null;
}

export function SavedRoutes({ workoutContext }: SavedRoutesProps) {
  const router = useRouter();
  const inContextMode = !!workoutContext;

  // Pre-fill sport filter from workout discipline when in context mode
  const [sport, setSport] = useState(
    inContextMode ? workoutContext.discipline : "",
  );
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<RouteSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setLoading(true);
      setError("");
      const params: Record<string, string> = {};
      if (sport) params.sport = sport;
      api.get<Route[]>("/routes", { params })
        .then((r) => setRoutes(r.data))
        .catch((err: unknown) => {
          const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
          setRoutes([]);
          setError(msg ?? "Could not load saved routes.");
        })
        .finally(() => setLoading(false));
    });
  }, [sport]);

  // Fetch route suggestions when in workout context mode
  useEffect(() => {
    if (!workoutContext || workoutContext.suggestedDistanceMeters <= 0) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      setSuggestionsLoading(true);
      getRouteSuggestions({
        discipline: workoutContext.discipline,
        target_distance_meters: workoutContext.suggestedDistanceMeters,
        start_lat: 0,
        start_lng: 0,
      })
        .then((data) => {
          if (!cancelled) setSuggestions(data);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setSuggestionsLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [workoutContext]);

  async function del(id: string) {
    if (!confirm("Delete this route?")) return;
    await api.delete(`/routes/${id}`);
    setRoutes((prev) => prev.filter((r) => r.id !== id));
  }

  async function downloadGpx(id: string, name: string) {
    try {
      const res = await api.get(`/routes/${id}/gpx`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/gpx+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/\s+/g, "_")}.gpx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download GPX file.");
    }
  }

  async function handleSelect(routeId: string) {
    if (!workoutContext) return;
    setSelectingId(routeId);
    setError("");
    try {
      await linkRouteToWorkout(workoutContext.workoutId, routeId);
      router.push(`/workouts/${workoutContext.workoutId}`);
    } catch {
      setError("Failed to link route to workout. Please try again.");
      setSelectingId(null);
    }
  }

  function handleCancelContext() {
    router.push("/routes");
  }

  const suggestedDistKm =
    workoutContext && workoutContext.suggestedDistanceMeters > 0
      ? (workoutContext.suggestedDistanceMeters / 1000).toFixed(1)
      : null;

  return (
    <div>
      {/* Workout context banner */}
      {inContextMode && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Selecting route for workout
            </p>
            <p className="text-xs text-muted-foreground">
              {getDisciplineMeta(workoutContext.discipline).icon}{" "}
              {getDisciplineMeta(workoutContext.discipline).label}
              {suggestedDistKm ? ` · ~${suggestedDistKm} km target` : ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancelContext}
            className="shrink-0"
          >
            <X className="size-3.5" />
            Cancel
          </Button>
        </div>
      )}

      {/* Sport filters */}
      <div className="flex gap-2 mb-4">
        {SPORT_FILTERS.map((f) => (
          <button key={f.value} onClick={() => setSport(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              sport === f.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Suggested routes (workout context mode only) */}
      {inContextMode && (suggestionsLoading || suggestions.length > 0) && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-2">
            Suggested routes
          </h2>
          {suggestionsLoading ? (
            <p className="text-muted-foreground text-sm">
              Finding suggestions…
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  onSelect={() => handleSelect(s.id)}
                  isSelecting={selectingId === s.id}
                  disabled={!!selectingId}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Saved routes heading when suggestions are shown */}
      {inContextMode && suggestions.length > 0 && !loading && routes.length > 0 && (
        <h2 className="text-sm font-semibold text-foreground mb-2">
          Your saved routes
        </h2>
      )}

      {loading ? <p className="text-muted-foreground text-sm">Loading…</p>
        : error ? (
          <div className="text-center py-16 text-sm text-[--status-negative]">{error}</div>
        )
        : routes.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="mb-3">No saved routes yet.</p>
            <Link href="/routes/new"><Button variant="outline" size="sm">Plan your first route</Button></Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {routes.map((r) => {
              const { icon, color } = getDisciplineMeta(r.sport as Discipline);
              const dist = r.distance_meters ? `${(r.distance_meters / 1000).toFixed(1)} km` : "—";
              const elev = r.elevation_gain_meters ? `+${r.elevation_gain_meters.toFixed(0)} m` : "";
              const isSelecting = selectingId === r.id;
              return (
                <div key={r.id} className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-primary/30 transition-all">
                  <span className={`w-10 h-10 flex items-center justify-center rounded-full text-lg shrink-0 ${color}`}>{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {dist}{elev ? ` · ${elev}` : ""}
                      {r.estimated_duration_seconds ? ` · ~${formatDuration(r.estimated_duration_seconds)}` : ""}
                      {r.is_loop ? " · Loop" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {inContextMode ? (
                      <Button
                        size="sm"
                        onClick={() => handleSelect(r.id)}
                        disabled={!!selectingId}
                      >
                        {isSelecting ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="size-3.5" />
                        )}
                        {isSelecting ? "Linking…" : "Select"}
                      </Button>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={() => downloadGpx(r.id, r.name)}>GPX</Button>
                        <Button variant="ghost" size="sm" onClick={() => del(r.id)}
                          className="text-red-400 hover:text-red-600">Del</Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
