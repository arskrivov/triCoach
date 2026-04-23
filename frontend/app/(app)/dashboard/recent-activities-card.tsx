/**
 * RecentActivitiesCard — displays the last 6 activities with links to detail views.
 *
 * Shows discipline icon, activity name, relative date, duration, and primary stat
 * (distance for endurance, volume/sets for strength). Links to `/activities/[id]`.
 *
 * @param activities - Array of ActivitySummary objects (typically last 6).
 */
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDisciplineMeta, formatDuration, formatDistance, formatRelativeDate } from "@/lib/format";
import type { ActivitySummary } from "@/lib/types";

interface Props {
  activities: ActivitySummary[];
}

export function RecentActivitiesCard({ activities }: Props) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">Recent activities</CardTitle>
        <Link href="/activities" className="text-xs text-muted-foreground hover:text-foreground">
          View all →
        </Link>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activities yet.{" "}
            <Link href="/settings" className="underline">
              Connect your Garmin
            </Link>{" "}
            and sync.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {activities.map((a) => {
              const { label, icon, color } = getDisciplineMeta(a.discipline);
              return (
                <li key={a.id}>
                  <Link
                    href={`/activities/${a.id}`}
                    className="flex items-center gap-3 py-2.5 hover:bg-muted rounded px-1 -mx-1 transition-colors"
                  >
                    <span
                      className={`w-8 h-8 flex items-center justify-center rounded-full text-base ${color}`}
                    >
                      {icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {a.name || label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeDate(a.start_time)}
                        {a.distance_meters ? ` · ${formatDistance(a.distance_meters)}` : ""}
                        {a.duration_seconds ? ` · ${formatDuration(a.duration_seconds)}` : ""}
                        {a.calories ? ` · ${a.calories.toLocaleString()} kcal` : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
