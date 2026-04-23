/**
 * RecoveryOverviewCard — displays recovery metrics, trends, and sparklines.
 *
 * Shows 6 key metric tiles, a combined 30-day chart (Sleep Score / HRV /
 * Resting HR), and a metric trend table with inline sparklines.
 * Optionally displays an AI-generated sleep analysis from the briefing.
 *
 * @param recovery - RecoveryOverview data including sparkline points.
 * @param analysis - Optional AI sleep analysis text (falls back to headline).
 */
"use client";

import {
  ComposedChart,
  Line,
  YAxis,
  XAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LineChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatSleepScore,
  formatHRV,
  formatNumber,
  formatChartDate,
  getTrendColor,
  getTrendLabel,
  getRecoveryStatusColor,
} from "@/lib/format";
import type { HealthSparklinePoint, RecoveryOverview } from "@/lib/types";
import { DashboardMetricTile } from "@/components/ui/metric-tile";

const SECTION_LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400";
const ANALYSIS_TEXT_CLASS = "text-sm leading-7 text-zinc-600";

const fmt = (value: number | null, unit: string) => formatNumber(value, unit || undefined);

// ---------------------------------------------------------------------------
// Combined 30-day chart: Sleep Score + HRV + Resting HR on dual axes
// ---------------------------------------------------------------------------

function RecoveryTrendChart({ data }: { data: HealthSparklinePoint[] }) {
  if (data.length === 0) return null;

  // Only show last 30 days
  const visible = data.slice(-30);

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className={SECTION_LABEL_CLASS}>30-day trends</p>
        <div className="flex gap-4 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded bg-indigo-500" />
            Sleep score
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded bg-emerald-500" />
            HRV
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded bg-rose-400" />
            Resting HR
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={visible} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#a1a1aa" }}
            tickFormatter={(v: string) => formatChartDate(v)}
            interval={Math.floor(visible.length / 5)}
            axisLine={false}
            tickLine={false}
          />
          {/* Left axis: Sleep Score (0–100) */}
          <YAxis
            yAxisId="score"
            domain={[30, 100]}
            tick={{ fontSize: 10, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          {/* Right axis: HRV + Resting HR (shared 20–80 range works for both) */}
          <YAxis
            yAxisId="bio"
            orientation="right"
            domain={[20, 80]}
            tick={{ fontSize: 10, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          {/* Good zone bands */}
          <ReferenceLine yAxisId="score" y={85} stroke="#6366f1" strokeDasharray="4 2" strokeWidth={0.75} opacity={0.4} />
          <ReferenceLine yAxisId="score" y={70} stroke="#6366f1" strokeDasharray="4 2" strokeWidth={0.75} opacity={0.4} />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, padding: "6px 10px" }}
            labelFormatter={(l) => formatChartDate(String(l))}
            formatter={(value, name) => {
              const v = typeof value === "number" ? value.toFixed(0) : "—";
              if (name === "sleep_score") return [`${v}`, "Sleep score"];
              if (name === "hrv") return [`${v} ms`, "HRV"];
              if (name === "resting_hr") return [`${v} bpm`, "Resting HR"];
              return [v, String(name)];
            }}
          />
          <Line
            yAxisId="score"
            type="monotone"
            dataKey="sleep_score"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
          <Line
            yAxisId="bio"
            type="monotone"
            dataKey="hrv"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
          <Line
            yAxisId="bio"
            type="monotone"
            dataKey="resting_hr"
            stroke="#f43f5e"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline mini sparkline for trend table rows
// ---------------------------------------------------------------------------

function MiniSparkline({
  data,
  dataKey,
  stroke,
  higherIsBetter,
}: {
  data: HealthSparklinePoint[];
  dataKey: keyof HealthSparklinePoint;
  stroke: string;
  higherIsBetter: boolean;
}) {
  const visible = data.slice(-14); // last 14 days
  const hasData = visible.some((p) => typeof p[dataKey] === "number");
  if (!hasData) return <div className="h-8 w-16" />;

  return (
    <ResponsiveContainer width={64} height={32}>
      <LineChart data={visible} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey={dataKey as string}
          stroke={stroke}
          strokeWidth={1.5}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RecoveryOverviewCard({
  recovery,
  analysis,
}: {
  recovery: RecoveryOverview & { sparkline: HealthSparklinePoint[] };
  analysis: string | null;
}) {
  const sleepFmt = formatSleepScore(recovery.last_night.sleep_score);
  const analysisText = analysis ?? recovery.headline;
  const sleepHours = recovery.last_night.sleep_duration_hours;

  // Metrics to show in trend table (skip sleep_score and sleep_duration — shown in tiles)
  const trendMetrics = recovery.metrics.filter(
    (m) => !["sleep_score", "sleep_duration_hours"].includes(m.key)
  );

  // Sparkline colour + axis mapping per metric key
  const sparklineConfig: Record<string, { stroke: string; dataKey: keyof HealthSparklinePoint; higherIsBetter: boolean }> = {
    hrv_last_night:                    { stroke: "#10b981", dataKey: "hrv",          higherIsBetter: true  },
    resting_hr:                        { stroke: "#f43f5e", dataKey: "resting_hr",   higherIsBetter: false },
    sleep_score:                       { stroke: "#6366f1", dataKey: "sleep_score",  higherIsBetter: true  },
    stress_avg:                        { stroke: "#f97316", dataKey: "stress",       higherIsBetter: false },
    pulse_ox_avg:                      { stroke: "#0ea5e9", dataKey: "spo2",         higherIsBetter: true  },
    respiration_sleep:                 { stroke: "#8b5cf6", dataKey: "respiration",  higherIsBetter: false },
    morning_training_readiness_score:  { stroke: "#06b6d4", dataKey: "readiness",    higherIsBetter: true  },
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className={SECTION_LABEL_CLASS}>Recovery</p>
            <CardTitle className="mt-1 text-base">Body Response</CardTitle>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${getRecoveryStatusColor(recovery.status)}`}>
            {recovery.status}
          </span>
        </div>
        <p className={ANALYSIS_TEXT_CLASS}>{analysisText}</p>
      </CardHeader>

      <CardContent className="grid gap-5">
        {/* 6 key metric tiles — one per metric, no merging */}
        <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <DashboardMetricTile
            label="Sleep Score"
            value={sleepFmt.text}
            valueClassName={sleepFmt.color}
            subtitle="Last night"
          />
          <DashboardMetricTile
            label="Sleep Duration"
            value={sleepHours != null ? `${sleepHours.toFixed(1)} h` : "—"}
            subtitle="Last night"
          />
          <DashboardMetricTile
            label="HRV"
            value={formatHRV(recovery.last_night.hrv_last_night)}
            subtitle="Last night"
          />
          <DashboardMetricTile
            label="Resting HR"
            value={fmt(recovery.last_night.resting_hr, "bpm")}
            subtitle="Last night"
          />
          <DashboardMetricTile
            label="SpO2"
            value={fmt(recovery.last_night.pulse_ox_avg, "%")}
            subtitle="Last night"
          />
          <DashboardMetricTile
            label="Readiness"
            value={fmt(recovery.last_night.morning_training_readiness_score, "")}
            subtitle="Morning score"
          />
        </div>

        {/* Combined 30-day trend chart */}
        {recovery.sparkline.length > 0 && (
          <RecoveryTrendChart data={recovery.sparkline} />
        )}

        {/* Metric trend table with inline sparklines */}
        <div className="grid gap-1.5">
          {trendMetrics.map((metric) => {
            const spark = sparklineConfig[metric.key];
            return (
              <div
                key={metric.key}
                className="grid grid-cols-[1.6fr_0.7fr_0.7fr_64px_0.8fr] items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-sm"
              >
                <p className="font-medium text-zinc-700">{metric.label}</p>
                <div>
                  <p className={SECTION_LABEL_CLASS}>Now</p>
                  <p className="font-semibold text-zinc-900">{fmt(metric.current, metric.unit)}</p>
                </div>
                <div>
                  <p className={SECTION_LABEL_CLASS}>7d avg</p>
                  <p className="font-semibold text-zinc-900">{fmt(metric.avg_7d, "")}</p>
                </div>
                {/* Mini sparkline */}
                {spark ? (
                  <MiniSparkline
                    data={recovery.sparkline}
                    dataKey={spark.dataKey}
                    stroke={spark.stroke}
                    higherIsBetter={spark.higherIsBetter}
                  />
                ) : (
                  <div className="h-8 w-16" />
                )}
                <div className={getTrendColor(metric.direction_vs_7d)}>
                  <p className={SECTION_LABEL_CLASS}>Trend</p>
                  <p className="font-semibold">{getTrendLabel(metric.direction_vs_7d)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
