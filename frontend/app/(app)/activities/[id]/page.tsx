import { Suspense } from "react";
import { ActivityDetailContent } from "./activity-detail-content";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ActivityDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <ActivityDetailContent id={id} />
      </Suspense>
    </div>
  );
}
