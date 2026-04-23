import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SavedRoutes } from "./saved-routes";
import { Skeleton } from "@/components/ui/skeleton";

export default function RoutesPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Routes</h1>
        <Link href="/routes/new">
          <Button size="sm">+ Plan route</Button>
        </Link>
      </div>
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <SavedRoutes />
      </Suspense>
    </div>
  );
}
