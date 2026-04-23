import { Suspense } from "react";
import { ActivityFeed } from "./activity-feed";
import { Skeleton } from "@/components/ui/skeleton";

export default function ActivitiesPage() {
  return (
    <div className="px-4 py-5 sm:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold mb-6">Activities</h1>
      <Suspense fallback={<FeedSkeleton />}>
        <ActivityFeed />
      </Suspense>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}
