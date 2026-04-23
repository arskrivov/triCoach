/**
 * ActivityOverviewCard — training load, discipline breakdown, and fitness chart.
 *
 * Shows key training metrics, week-over-week discipline breakdown with calories,
 * and an embedded Fitness/Fatigue/Form chart.
 * Optionally displays an AI-generated activity analysis from the briefing.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCalories, formatSteps, getActivityStatusColor, calculateDelta } from "@/lib/format";
import type { ActivityOverview, DisciplineSummary, FitnessPoint } from "@/lib/types";
import { FitnessChart } from "@/components/fitness-chart";
import { DashboardMetricTile } from "@/components/ui/metric-tile";

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
  current: DisciplineSummary;
  previous: DisciplineSummary;
  showDistance: boolean;
}

function DisciplineRow({ label, icon, current, previous, showDistance }: DisciplineRowProps) {
  if (current.sessions === 0 && previous.sessions === 0) return null;

  const mainValue = showDistance
    ? `${current.distance_km.toFixed(1)} km`
    : `${current.duration_hours.toFixed(1)} h`;

  const delta = showDistance
    ? calculateDelta(current.distance_km, previous.distance_km, " km")
    : calculateDelta(current.duration_hours, previous.duration_hours, " h");

  return (
    <div className="grid grid-cols-[1.8fr_0.9fr_0.7fr_0.9fr_0.8fr] items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2.5 text-sm">
      <p className="font-medium text-zinc-700">
        {icon} {label}
      </p>
      <div>
        <p className={SECTION_LABEL_CLASS}>This wk</p>
        <p className="font-semibold text-zinc-900">{current.sessions > 0 ? mainValue : "—"}</p>
      </div>
      <div>
        <p className={SECTION_LABEL_CLASS}>Sessions</p>
        <p className="font-semibold text-zinc-900">{current.sessions > 0 ? current.sessions : "—"}</p>
      </div>
      <div>
        <p className={SECTION_LABEL_CLASS}>Avg kcal</p>
        <p className="font-semibold text-zinc-900">
          {current.avg_calories != null ? `${current.avg_calories}` : "—"}
        </p>
      </div>
      <div>
        <p className={SECTION_LABEL_CLASS}>vs prev</p>
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
  const { last_7d, fitness } = activity;
  const analysisText = analysis ?? activity.headline;
  const tsb = fitness.tsb;
  const tsbTone = tsb == null ? "text-zinc-400" : tsb >= 0 ? "text-emerald-600" : tsb >= -10 ? "text-sky-600" : tsb >= -30 ? "text-amber-600" : "text-rose-500";
  const statusLabel = STATUS_LABELS[activity.status] ?? activity.status;

  // VO2max display — prefer running, fall back to cycling
  const vo2max = fitness.vo2max_running ?? fitness.vo2max_cycling;
  const vo2maxLabel = fitness.vo2max_running != null ? "Running VO₂max" : "Cycling VO₂max";

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
            subtitle={`${last_7d.duration_hours.toFixed(1)} h total`}
          />
          {vo2max != null ? (
            <DashboardMetricTile
              label={vo2maxLabel}
              value={`${vo2max.toFixed(1)}`}
              subtitle="mL/kg/min"
            />
          ) : (
            <DashboardMetricTile
              label="Daily steps"
              value={formatSteps(activity.movement.steps_avg_7d !== null ? Math.round(activity.movement.steps_avg_7d) : null)}
              subtitle="7d avg"
            />
          )}
        </div>

        {/* Secondary row: steps + calories when VO2max is shown */}
        {vo2max != null && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DashboardMetricTile
              label="Daily steps"
              value={formatSteps(activity.movement.steps_avg_7d !== null ? Math.round(activity.movement.steps_avg_7d) : null)}
              subtitle="7d avg"
            />
            <DashboardMetricTile
              label="Daily calories"
              value={formatCalories(activity.movement.daily_calories_avg_7d !== null ? Math.round(activity.movement.daily_calories_avg_7d) : null)}
              subtitle="7d avg"
            />
          </div>
        )}

        {/* Discipline breakdown */}
        <div className="grid gap-1.5">
          <DisciplineRow
            label="Swim"
            icon="🏊"
            current={last_7d.by_discipline.swim}
            previous={activity.previous_7d.by_discipline.swim}
            showDistance
          />
          <DisciplineRow
            label="Bike"
            icon="🚴"
            current={last_7d.by_discipline.bike}
            previous={activity.previous_7d.by_discipline.bike}
            showDistance
          />
          <DisciplineRow
            label="Run"
            icon="🏃"
            current={last_7d.by_discipline.run}
            previous={activity.previous_7d.by_discipline.run}
            showDistance
          />
          <DisciplineRow
            label="Strength"
            icon="🏋️"
            current={last_7d.by_discipline.strength}
            previous={activity.previous_7d.by_discipline.strength}
            showDistance={false}
          />
          <DisciplineRow
            label="Mobility"
            icon="🤸"
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
