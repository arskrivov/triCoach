import { Suspense } from "react";
import { DashboardContent } from "./dashboard-content";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-950">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Recovery, training direction, and today&apos;s coaching readout in one place.
        </p>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Skeleton className="h-56 rounded-3xl xl:col-span-2" />
      <Skeleton className="h-[30rem] rounded-3xl" />
      <Skeleton className="h-[30rem] rounded-3xl" />
      <Skeleton className="h-80 rounded-3xl xl:col-span-2" />
    </div>
  );
}
