"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { getDisciplineMeta, formatDuration } from "@/lib/format";
import type { Discipline } from "@/lib/types";
import { Button } from "@/components/ui/button";

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

export function SavedRoutes() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [sport, setSport] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  async function del(id: string) {
    if (!confirm("Delete this route?")) return;
    await api.delete(`/routes/${id}`);
    setRoutes((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {SPORT_FILTERS.map((f) => (
          <button key={f.value} onClick={() => setSport(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              sport === f.value ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <p className="text-zinc-400 text-sm">Loading…</p>
        : error ? (
          <div className="text-center py-16 text-sm text-red-500">{error}</div>
        )
        : routes.length === 0 ? (
          <div className="text-center py-16 text-zinc-400">
            <p className="mb-3">No saved routes yet.</p>
            <Link href="/routes/new"><Button variant="outline" size="sm">Plan your first route</Button></Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {routes.map((r) => {
              const { icon, color } = getDisciplineMeta(r.sport as Discipline);
              const dist = r.distance_meters ? `${(r.distance_meters / 1000).toFixed(1)} km` : "—";
              const elev = r.elevation_gain_meters ? `+${r.elevation_gain_meters.toFixed(0)} m` : "";
              return (
                <div key={r.id} className="flex items-center gap-4 p-4 bg-white border border-zinc-100 rounded-xl hover:border-zinc-300 transition-all">
                  <span className={`w-10 h-10 flex items-center justify-center rounded-full text-lg shrink-0 ${color}`}>{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.name}</p>
                    <p className="text-xs text-zinc-400">
                      {dist}{elev ? ` · ${elev}` : ""}
                      {r.estimated_duration_seconds ? ` · ~${formatDuration(r.estimated_duration_seconds)}` : ""}
                      {r.is_loop ? " · Loop" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <a href={`${process.env.NEXT_PUBLIC_API_URL}/api/v1/routes/${r.id}/gpx`}
                      target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm">GPX</Button>
                    </a>
                    <Button variant="ghost" size="sm" onClick={() => del(r.id)}
                      className="text-red-400 hover:text-red-600">Del</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
