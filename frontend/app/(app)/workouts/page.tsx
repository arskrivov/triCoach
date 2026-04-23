import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WorkoutList } from "./workout-list";
import { Skeleton } from "@/components/ui/skeleton";

export default function WorkoutsPage() {
  return (
    <div className="px-4 py-5 sm:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold">Workouts</h1>
        <Link href="/workouts/new" className="w-full sm:w-auto">
          <Button size="sm" className="w-full sm:w-auto">+ New workout</Button>
        </Link>
      </div>
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <WorkoutList />
      </Suspense>
    </div>
  );
}
