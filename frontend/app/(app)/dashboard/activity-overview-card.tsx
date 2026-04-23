/**
 * ActivityOverviewCard — training load, discipline breakdown, and fitness chart.
 *
 * Shows key training metrics, week-over-week discipline breakdown with
 * per-discipline intensity (pace / speed / avg duration), and an embedded
 * Fitness/Fatigue/Form chart.
 * Optionally displays an AI-generated activity analysis from the briefing.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActivityStatusColor, calculateDelta } from "@/lib/format";
import type { ActivityOverview, DisciplineSummary, FitnessPoint } from "@/lib/types";
import { FitnessChart } from "@/components/fitness-chart";
import { DashboardMetricTile } from "@/components/ui/metric-tile";

type Discipline = "swim" | "bike" | "run" | "strength" | "mobility";

/** Derive a per-discipline intensity metric from distance + duration. */
function formatIntensity(d: DisciplineSummary, discipline: Discipline): { label: string; value: string } {
  if (d.sessions === 0 || d.duration_hours === 0) {
    const label =
      discipline === "swim" ? "Avg pace" :
      discipline === "bike" ? "Avg speed" :
      discipline === "run" ? "Avg pace" :
      "Avg dur";
    return { label, value: "—" };
  }

  switch (discipline) {
    case "run": {
      // min/km
      const paceMin = (d.duration_hours * 60) / d.distance_km;
      const mins = Math.floor(paceMin);
      const secs = Math.round((paceMin - mins) * 60);
      return { label: "Avg pace", value: `${mins}:${secs.toString().padStart(2, "0")} /km` };
    }
    case "swim": {
      // min/100m
      const pace100 = (d.duration_hours * 60) / (d.distance_km * 10);
      const mins = Math.floor(pace100);
      const secs = Math.round((pace100 - mins) * 60);
      return { label: "Avg pace", value: `${mins}:${secs.toString().padStart(2, "0")} /100m` };
    }
    case "bike": {
      // km/h
      const speed = d.distance_km / d.duration_hours;
      return { label: "Avg speed", value: `${speed.toFixed(1)} km/h` };
    }
    default: {
      // strength / mobility — avg duration per session
      const avgMin = (d.duration_hours * 60) / d.sessions;
      return { label: "Avg dur", value: `${Math.round(avgMin)} min` };
    }
  }
}

const SECTION_LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400";
const ANALYSIS_TEXT_CLASS = "text-sm leading-7 text-zinc-600";

// Human-readable status labels
const STATUS_LABELS: Record<string, string> = {
  building: "Building fitness",
  overreaching: "Pushing limits",
  lighter: "Lighter week",
  steady: "Steady load",
  idle: "Low activity",
};

interface DisciplineRowProps {
  label: string;
  icon: string;
  discipline: Discipline;
  current: DisciplineSummary;
  previous: DisciplineSummary;
  showDistance: boolean;
  vo2max?: number | null;
}

function DisciplineRow({ label, icon, discipline, current, previous, showDistance, vo2max }: DisciplineRowProps) {
  if (current.sessions === 0 && previous.sessions === 0) return null;

  const distanceOrDuration = showDistance
    ? `${current.distance_km.toFixed(1)} km`
    : `${current.duration_hours.toFixed(1)} h`;

  const delta = showDistance
    ? calculateDelta(current.distance_km, previous.distance_km, " km")
    : calculateDelta(current.duration_hours, previous.duration_hours, " h");

  const hasVo2 = vo2max !== undefined;
  const intensity = formatIntensity(current, discipline);

  return (
    <div className={`grid ${hasVo2 ? "grid-cols-[1.8fr_0.7fr_0.9fr_0.8fr_0.9fr_0.8fr]" : "grid-cols-[1.8fr_0.7fr_0.9fr_0.8fr_0.9fr]"} items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2.5 text-sm`}>
      <p className="font-medium text-zinc-700">
        {icon} {label}
      </p>
      <div>
        <p className={SECTION_LABEL_CLASS}>CW Sessions</p>
        <p className="font-semibold text-zinc-900">{current.sessions > 0 ? current.sessions : "—"}</p>
      </div>
      <div>
        <p className={SECTION_LABEL_CLASS}>{showDistance ? "CW Distance" : "CW Duration"}</p>
        <p className="font-semibold text-zinc-900">{current.sessions > 0 ? distanceOrDuration : "—"}</p>
      </div>
      <div>
        <p className={SECTION_LABEL_CLASS}>vs Prev Wk</p>
        {delta ? (
          <p className={`font-semibold ${delta.color}`}>{delta.text}</p>
        ) : (
          <p className="text-zinc-400">—</p>
        )}
      </div>
      <div>
        <p className={SECTION_LABEL_CLASS}>CW {intensity.label}</p>
        <p className="font-semibold text-zinc-900">{intensity.value}</p>
      </div>
      {hasVo2 && (
        <div>
          <p className={SECTION_LABEL_CLASS}>VO₂max</p>
          <p className="font-semibold text-zinc-900">
            {vo2max != null ? vo2max.toFixed(0) : "—"}
          </p>
        </div>
      )}
    </div>
  );
}

export function ActivityOverviewCard({
  activity,
  analysis,
  fitnessTimeline,
}: {
  activity: ActivityOverview;
  analysis: string | null;
  fitnessTimeline?: FitnessPoint[];
}) {
  const { last_7d, fitness } = activity;
  const analysisText = analysis ?? activity.headline;
  const tsb = fitness.tsb;
  const tsbTone = tsb == null ? "text-zinc-400" : tsb >= 0 ? "text-emerald-600" : tsb >= -10 ? "text-sky-600" : tsb >= -30 ? "text-amber-600" : "text-rose-500";
  const statusLabel = STATUS_LABELS[activity.status] ?? activity.status;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className={SECTION_LABEL_CLASS}>Activity</p>
            <CardTitle className="mt-1 text-base">Training Load</CardTitle>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${getActivityStatusColor(activity.status)}`}>
            {statusLabel}
          </span>
        </div>
        <p className={ANALYSIS_TEXT_CLASS}>{analysisText}</p>
      </CardHeader>

      <CardContent className="grid gap-5">
        {/* Key training metric tiles */}
        <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <DashboardMetricTile
            label="Load 7d (TSS)"
            value={`${Math.round(last_7d.tss)}`}
            subtitle="Training stress"
          />
          <DashboardMetricTile
            label="Fitness (CTL)"
            value={fitness.ctl != null ? fitness.ctl.toFixed(0) : "—"}
            subtitle="42-day avg load"
          />
          <DashboardMetricTile
            label="Fatigue (ATL)"
            value={fitness.atl != null ? fitness.atl.toFixed(0) : "—"}
            subtitle="7-day avg load"
          />
          <DashboardMetricTile
            label="Form (TSB)"
            value={tsb != null ? `${tsb > 0 ? "+" : ""}${tsb.toFixed(0)}` : "—"}
            subtitle="Fitness − Fatigue"
            valueClassName={tsbTone}
          />
          <DashboardMetricTile
            label="Sessions 7d"
            value={`${last_7d.sessions}`}
            subtitle="This week"
          />
          <DashboardMetricTile
            label="Duration 7d"
            value={`${last_7d.duration_hours.toFixed(1)}h`}
            subtitle="This week"
          />
        </div>

        {/* Discipline breakdown */}
        <div className="grid gap-1.5">
          <DisciplineRow
            label="Swim"
            icon="🏊"
            discipline="swim"
            current={last_7d.by_discipline.swim}
            previous={activity.previous_7d.by_discipline.swim}
            showDistance
            vo2max={null}
          />
          <DisciplineRow
            label="Bike"
            icon="🚴"
            discipline="bike"
            current={last_7d.by_discipline.bike}
            previous={activity.previous_7d.by_discipline.bike}
            showDistance
            vo2max={fitness.vo2max_cycling}
          />
          <DisciplineRow
            label="Run"
            icon="🏃"
            discipline="run"
            current={last_7d.by_discipline.run}
            previous={activity.previous_7d.by_discipline.run}
            showDistance
            vo2max={fitness.vo2max_running}
          />
          <DisciplineRow
            label="Strength"
            icon="🏋️"
            discipline="strength"
            current={last_7d.by_discipline.strength}
            previous={activity.previous_7d.by_discipline.strength}
            showDistance={false}
          />
          <DisciplineRow
            label="Mobility"
            icon="🤸"
            discipline="mobility"
            current={last_7d.by_discipline.mobility}
            previous={activity.previous_7d.by_discipline.mobility}
            showDistance={false}
          />
        </div>

        {/* Fitness & Form chart */}
        <FitnessChart data={fitnessTimeline} embedded />
      </CardContent>
    </Card>
  );
}
