"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Clock, Dumbbell, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDuration, getDisciplineMeta } from "@/lib/format";
import type { Workout } from "@/lib/types";

export default function WorkoutDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkout = useCallback(async () => {
    try {
      const res = await api.get<Workout>(`/workouts/${id}`);
      setWorkout(res.data);
      setError(null);
    } catch {
      setError("Failed to load workout.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchWorkout();
  }, [fetchWorkout]);

  if (loading) {
    return (
      <div className="p-6 text-muted-foreground text-sm">Loading…</div>
    );
  }

  if (error || !workout) {
    return (
      <div className="p-6">
        <p className="text-destructive text-sm">{error ?? "Workout not found."}</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>
    );
  }

  const discipline = getDisciplineMeta(workout.discipline);

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold truncate">{workout.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Badge variant="secondary" className={discipline.color}>
              {discipline.icon} {discipline.label}
            </Badge>
            {workout.scheduled_date && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Calendar className="size-3.5" />
                {formatDate(workout.scheduled_date)}
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push(`/workouts/${id}/edit`)}>
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </div>

      {/* Workout details card */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {workout.description && (
            <p className="text-sm text-muted-foreground">{workout.description}</p>
          )}

          <div className="flex flex-wrap gap-4 text-sm">
            {workout.estimated_duration_seconds != null && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="size-3.5" />
                {formatDuration(workout.estimated_duration_seconds)}
              </span>
            )}
            {workout.estimated_tss != null && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Dumbbell className="size-3.5" />
                TSS {Math.round(workout.estimated_tss)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
