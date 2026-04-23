/**
 * UpcomingWorkoutsCard — displays the next 6 scheduled workouts.
 *
 * Shows discipline icon, workout name, scheduled date, estimated duration,
 * and estimated TSS. Links to `/workouts` for management.
 *
 * @param workouts - Array of PlannedWorkout objects (typically next 6).
 */
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate, formatDuration, getDisciplineMeta } from "@/lib/format";
import type { PlannedWorkout } from "@/lib/types";

export function UpcomingWorkoutsCard({ workouts }: { workouts: PlannedWorkout[] }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-zinc-600">Planned workouts</CardTitle>
        <Link href="/workouts">
          <Button variant="outline" size="sm">Manage</Button>
        </Link>
      </CardHeader>
      <CardContent>
        {workouts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-8 text-center">
            <p className="text-sm text-zinc-500">No scheduled workouts yet.</p>
            <p className="mt-1 text-xs text-zinc-400">Create a workout and give it a scheduled date.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {workouts.map((workout) => {
              const meta = getDisciplineMeta(workout.discipline);
              return (
                <div key={workout.id} className="flex items-center gap-3 rounded-2xl border border-zinc-100 px-3 py-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full text-base ${meta.color}`}>
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{workout.name}</p>
                    <p className="text-xs text-zinc-400">
                      {formatDate(workout.scheduled_date)}
                      {workout.estimated_duration_seconds ? ` · ${formatDuration(workout.estimated_duration_seconds)}` : ""}
                      {workout.estimated_tss ? ` · ${Math.round(workout.estimated_tss)} TSS` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
