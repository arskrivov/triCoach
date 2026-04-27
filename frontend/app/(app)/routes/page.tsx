"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SavedRoutes } from "./saved-routes";
import { Skeleton } from "@/components/ui/skeleton";
import type { Discipline } from "@/lib/types";
import type { WorkoutRouteContext } from "@/lib/types";

/** Typical pace in m/s used to estimate distance from workout duration. */
const TYPICAL_PACE: Record<string, number> = {
  RUN: 3.0,
  RIDE_ROAD: 7.0,
  RIDE_GRAVEL: 5.0,
};

const ROUTE_DISCIPLINES = new Set(["RUN", "RIDE_ROAD", "RIDE_GRAVEL"]);

function RoutesPageInner() {
  const searchParams = useSearchParams();

  const workoutContext = useMemo<WorkoutRouteContext | null>(() => {
    const workoutId = searchParams.get("workout_id");
    const discipline = searchParams.get("discipline");
    const durationStr = searchParams.get("duration");

    if (!workoutId || !discipline || !ROUTE_DISCIPLINES.has(discipline)) {
      return null;
    }

    const estimatedDuration = durationStr ? parseInt(durationStr, 10) : 0;
    const pace = TYPICAL_PACE[discipline] ?? 3.0;
    const suggestedDistanceMeters =
      estimatedDuration > 0 ? estimatedDuration * pace : 0;

    return {
      workoutId,
      discipline: discipline as Discipline,
      estimatedDuration: isNaN(estimatedDuration) ? 0 : estimatedDuration,
      suggestedDistanceMeters,
    };
  }, [searchParams]);

  // Build the "Plan route" link — include workout context params when active
  const planRouteHref = workoutContext
    ? `/routes/new?workout_id=${workoutContext.workoutId}&discipline=${workoutContext.discipline}&duration=${workoutContext.estimatedDuration}`
    : "/routes/new";

  return (
    <div className="px-4 py-5 sm:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Routes</h1>
        <Link href={planRouteHref} className="w-full sm:w-auto">
          <Button size="sm" className="w-full sm:w-auto">+ Plan route</Button>
        </Link>
      </div>
      <SavedRoutes workoutContext={workoutContext} />
    </div>
  );
}

export default function RoutesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <RoutesPageInner />
    </Suspense>
  );
}
