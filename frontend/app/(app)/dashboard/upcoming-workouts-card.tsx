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
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDuration, getDisciplineMeta } from "@/lib/format";
import type { PlannedWorkout } from "@/lib/types";

export function UpcomingWorkoutsCard({
  workouts,
  loading = false,
}: {
  workouts: PlannedWorkout[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">Planned workouts</CardTitle>
          <Button variant="outline" size="sm" disabled>Manage</Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 rounded-2xl border border-border px-3 py-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="mt-2 h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">Planned workouts</CardTitle>
        <Link href="/workouts">
          <Button variant="outline" size="sm">Manage</Button>
        </Link>
      </CardHeader>
      <CardContent>
        {workouts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No scheduled workouts yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">Create a workout and give it a scheduled date.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {workouts.map((workout) => {
              const meta = getDisciplineMeta(workout.discipline);
              return (
                <div key={workout.id} className="flex items-center gap-3 rounded-2xl border border-border px-3 py-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full text-base ${meta.color}`}>
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{workout.name}</p>
                    <p className="text-xs text-muted-foreground">
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
