/**
 * ActivityOverviewCard — displays activity summaries, discipline breakdown, and fitness chart.
 *
 * Shows 6 metric tiles (steps, calories, sessions, time, TSS, form), a week-over-week
 * discipline breakdown table, and an embedded CTL/ATL/TSB fitness chart.
 * Optionally displays an AI-generated activity analysis from the briefing.
 *
 * @param activity - ActivityOverview data including discipline summaries and fitness metrics.
 * @param analysis - Optional AI activity analysis text (falls back to headline).
 * @param fitnessTimeline - Optional array of FitnessPoint for the embedded chart.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCalories, formatSteps, getActivityStatusColor, calculateDelta } from "@/lib/format";
import type { ActivityOverview, DisciplineSummary, FitnessPoint } from "@/lib/types";
import { FitnessChart } from "@/components/fitness-chart";
import { DashboardMetricTile } from "@/components/ui/metric-tile";

const SECTION_LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400";
const ANALYSIS_TEXT_CLASS = "text-sm leading-7 text-zinc-600";

interface DisciplineRowProps {
  label: string;
  icon: string;
  current: DisciplineSummary;
  previous: DisciplineSummary;
  showDistance: boolean;
}

function DisciplineRow({ label, icon, current, previous, showDistance }: DisciplineRowProps) {
  const mainValue = showDistance
    ? `${current.distance_km.toFixed(1)} km`
    : `${current.duration_hours.toFixed(1)} h`;

  const delta = showDistance
    ? calculateDelta(current.distance_km, previous.distance_km, " km")
    : calculateDelta(current.duration_hours, previous.duration_hours, " h");

  return (
    <div className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center rounded-xl border border-zinc-100 px-3 py-2.5 text-sm">
      <p className="font-medium text-zinc-700">
        {icon} {label}
      </p>
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-400">This wk</p>
        <p className="font-semibold text-zinc-900">{current.sessions > 0 ? mainValue : "—"}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-400">Sessions</p>
        <p className="font-semibold text-zinc-900">{current.sessions > 0 ? current.sessions : "—"}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-400">vs prev</p>
        {delta ? (
          <p className={`font-semibold ${delta.color}`}>{delta.text}</p>
        ) : (
          <p className="text-zinc-400">—</p>
        )}
      </div>
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
  const { last_7d, previous_7d } = activity;
  const analysisText = analysis ?? activity.headline;
  const tsb = activity.fitness.tsb;
  const tsbTone = (tsb ?? 0) >= 0 ? "text-emerald-600" : "text-rose-500";

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className={SECTION_LABEL_CLASS}>Activity</p>
            <CardTitle className="mt-1 text-base">Training Direction</CardTitle>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${getActivityStatusColor(activity.status)}`}>
            {activity.status}
          </span>
        </div>
        <p className={ANALYSIS_TEXT_CLASS}>{analysisText}</p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <DashboardMetricTile
            label="Steps"
            value={formatSteps(activity.movement.steps_avg_7d !== null ? Math.round(activity.movement.steps_avg_7d) : null)}
            subtitle="7d avg"
          />
          <DashboardMetricTile
            label="Calories"
            value={formatCalories(
              activity.movement.daily_calories_avg_7d !== null ? Math.round(activity.movement.daily_calories_avg_7d) : null,
            )}
            subtitle="7d avg"
          />
          <DashboardMetricTile
            label="Sessions 7d"
            value={`${last_7d.sessions}`}
            subtitle="Completed"
          />
          <DashboardMetricTile
            label="Time 7d"
            value={`${last_7d.duration_hours.toFixed(1)} h`}
            subtitle="Training time"
          />
          <DashboardMetricTile
            label="TSS 7d"
            value={`${Math.round(last_7d.tss)}`}
            subtitle="Load"
          />
          <DashboardMetricTile
            label="Form"
            value={tsb !== null ? `${tsb > 0 ? "+" : ""}${tsb.toFixed(0)}` : "—"}
            subtitle="TSB today"
            valueClassName={tsbTone}
          />
        </div>

        <div className="grid gap-2">
          <DisciplineRow
            label="Swim"
            icon="🏊"
            current={last_7d.by_discipline.swim}
            previous={previous_7d.by_discipline.swim}
            showDistance
          />
          <DisciplineRow
            label="Bike"
            icon="🚴"
            current={last_7d.by_discipline.bike}
            previous={previous_7d.by_discipline.bike}
            showDistance
          />
          <DisciplineRow
            label="Run"
            icon="🏃"
            current={last_7d.by_discipline.run}
            previous={previous_7d.by_discipline.run}
            showDistance
          />
          <DisciplineRow
            label="Strength"
            icon="🏋️"
            current={last_7d.by_discipline.strength}
            previous={previous_7d.by_discipline.strength}
            showDistance={false}
          />
          <DisciplineRow
            label="Mobility"
            icon="🤸"
            current={last_7d.by_discipline.mobility}
            previous={previous_7d.by_discipline.mobility}
            showDistance={false}
          />
        </div>

        <FitnessChart data={fitnessTimeline} embedded />
      </CardContent>
    </Card>
  );
}
