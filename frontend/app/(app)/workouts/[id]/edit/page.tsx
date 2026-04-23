"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { WorkoutBuilder } from "../../workout-builder";

interface Workout {
  id: string;
  name: string;
  discipline: string;
  builder_type: string;
  content: object;
  is_template: boolean;
  scheduled_date: string | null;
}

export default function EditWorkoutPage() {
  const params = useParams();
  const id = params.id as string;
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Workout>(`/workouts/${id}`)
      .then((r) => setWorkout(r.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-6 text-zinc-400 text-sm">Loading…</div>;
  if (!workout) return <div className="p-6 text-red-500 text-sm">Workout not found.</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Edit Workout</h1>
      <WorkoutBuilder initial={workout} />
    </div>
  );
}
