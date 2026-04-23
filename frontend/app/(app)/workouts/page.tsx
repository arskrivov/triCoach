import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WorkoutList } from "./workout-list";
import { Skeleton } from "@/components/ui/skeleton";

export default function WorkoutsPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Workouts</h1>
        <Link href="/workouts/new">
          <Button size="sm">+ New workout</Button>
        </Link>
      </div>
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <WorkoutList />
      </Suspense>
    </div>
  );
}
