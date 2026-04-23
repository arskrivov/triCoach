"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate, formatDuration, getDisciplineMeta } from "@/lib/format";
import type { Discipline } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Workout {
  id: string;
  name: string;
  discipline: Discipline;
  builder_type: string;
  description: string | null;
  estimated_duration_seconds: number | null;
  estimated_tss: number | null;
  estimated_volume_kg: number | null;
  is_template: boolean;
  scheduled_date: string | null;
}

const FILTERS = [
  { label: "All", value: "" },
  { label: "Endurance", value: "ENDURANCE" },
  { label: "Strength", value: "STRENGTH" },
  { label: "Yoga", value: "YOGA" },
];

export function WorkoutList() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (filter) params.builder_type = filter;
    api.get<Workout[]>("/workouts", { params })
      .then((r) => setWorkouts(r.data))
      .finally(() => setLoading(false));
  }, [filter]);

  async function del(id: string) {
    if (!confirm("Delete this workout?")) return;
    await api.delete(`/workouts/${id}`);
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setLoading(true);
              setFilter(f.value);
            }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : workouts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="mb-3">No workouts yet.</p>
          <Link href="/workouts/new">
            <Button variant="outline" size="sm">Create your first workout</Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {workouts.map((w) => {
            const { icon, color } = getDisciplineMeta(w.discipline);
            return (
              <div
                key={w.id}
                className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-primary/30 transition-all"
              >
                <span className={`w-10 h-10 flex items-center justify-center rounded-full text-lg shrink-0 ${color}`}>
                  {icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{w.name}</p>
                  <div className="flex gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{w.builder_type}</span>
                    {w.is_template && <Badge variant="secondary" className="text-xs py-0">template</Badge>}
                    {!w.is_template && w.scheduled_date && (
                      <Badge variant="outline" className="text-xs py-0">
                        {formatDate(w.scheduled_date)}
                      </Badge>
                    )}
                    {w.estimated_duration_seconds && (
                      <span className="text-xs text-muted-foreground">
                        ~{formatDuration(w.estimated_duration_seconds)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link href={`/workouts/${w.id}/edit`}>
                    <Button variant="outline" size="sm">Edit</Button>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => del(w.id)}
                    className="text-red-400 hover:text-red-600">
                    Del
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
