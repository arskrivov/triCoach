import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SavedRoutes } from "./saved-routes";
import { Skeleton } from "@/components/ui/skeleton";

export default function RoutesPage() {
  return (
    <div className="px-4 py-5 sm:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Routes</h1>
        <Link href="/routes/new" className="w-full sm:w-auto">
          <Button size="sm" className="w-full sm:w-auto">+ Plan route</Button>
        </Link>
      </div>
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <SavedRoutes />
      </Suspense>
    </div>
  );
}
