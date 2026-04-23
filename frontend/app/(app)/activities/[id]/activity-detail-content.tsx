"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ActivityDetail } from "@/lib/types";
import {
  getDisciplineMeta,
  formatDuration,
  formatDistance,
  formatDate,
  formatPace,
} from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EnduranceMap } from "./endurance-map";
import { StrengthView } from "./strength-view";

interface Props {
  id: string;
}

export function ActivityDetailContent({ id }: Props) {
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api
      .get<ActivityDetail>(`/activities/${id}`)
      .then((r) => setActivity(r.data))
      .catch((e) => {
        if (e.response?.status === 404) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-zinc-400 text-sm">Loading…</div>;
  if (notFound)
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500">Activity not found.</p>
        <Link href="/activities" className="text-sm underline mt-2 inline-block">
          Back to activities
        </Link>
      </div>
    );
  if (!activity) return null;

  const { label, icon, color } = getDisciplineMeta(activity.discipline);
  const isEndurance = ["RUN", "SWIM", "RIDE_ROAD", "RIDE_GRAVEL"].includes(activity.discipline);
  const isStrength = activity.discipline === "STRENGTH";

  return (
    <div className="flex flex-col gap-5">
      {/* Back link */}
      <Link href="/activities" className="text-sm text-zinc-400 hover:text-zinc-600">
        ← Activities
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <span
          className={`w-12 h-12 flex items-center justify-center rounded-full text-2xl shrink-0 ${color}`}
        >
          {icon}
        </span>
        <div>
          <h1 className="text-xl font-semibold">{activity.name || label}</h1>
          <p className="text-sm text-zinc-500">
            {formatDate(activity.start_time)} · {label}
          </p>
        </div>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Duration" value={formatDuration(activity.duration_seconds)} />
        {isEndurance && (
          <>
            <StatBox label="Distance" value={formatDistance(activity.distance_meters)} />
            {activity.avg_pace_sec_per_km && (
              <StatBox label="Avg Pace" value={formatPace(activity.avg_pace_sec_per_km)} />
            )}
            {activity.avg_power_watts && (
              <StatBox label="Avg Power" value={`${activity.avg_power_watts} W`} />
            )}
            {activity.avg_hr && (
              <StatBox label="Avg HR" value={`${activity.avg_hr} bpm`} />
            )}
            {activity.elevation_gain_meters && (
              <StatBox
                label="Elevation"
                value={`+${activity.elevation_gain_meters.toFixed(0)} m`}
              />
            )}
            {activity.tss && (
              <StatBox label="TSS" value={activity.tss.toFixed(0)} />
            )}
          </>
        )}
        {isStrength && (
          <>
            {activity.total_sets && (
              <StatBox label="Total Sets" value={activity.total_sets} />
            )}
            {activity.total_volume_kg && (
              <StatBox
                label="Volume"
                value={`${activity.total_volume_kg.toFixed(0)} kg`}
              />
            )}
          </>
        )}
        {activity.calories && (
          <StatBox label="Calories" value={`${activity.calories} kcal`} />
        )}
      </div>

      {/* Endurance: map */}
      {isEndurance && activity.polyline && (
        <EnduranceMap polyline={activity.polyline} />
      )}

      {/* Strength: exercise breakdown */}
      {isStrength && activity.exercises && activity.exercises.length > 0 && (
        <StrengthView exercises={activity.exercises} muscleGroups={activity.primary_muscle_groups} />
      )}

      {/* Yoga / Mobility: basic info */}
      {(activity.discipline === "YOGA" || activity.discipline === "MOBILITY") &&
        activity.session_type && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Session type</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">
                {activity.session_type.replace(/_/g, " ")}
              </Badge>
            </CardContent>
          </Card>
        )}

      {/* AI Analysis */}
      {activity.ai_analysis && (
        <Card className="border-blue-100 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-700">Coach analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-800 leading-relaxed">{activity.ai_analysis}</p>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {activity.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-600">{activity.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-zinc-50 rounded-lg p-3">
      <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
