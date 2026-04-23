/**
 * RecoveryOverviewCard — displays recovery metrics, trends, and sparklines.
 *
 * Shows 9 recovery metrics (sleep score, HRV, resting HR, etc.) with 7-day
 * and 30-day averages, trend directions, and 30-day sparkline charts.
 * Optionally displays an AI-generated sleep analysis from the briefing.
 *
 * @param recovery - RecoveryOverview data including sparkline points.
 * @param analysis - Optional AI sleep analysis text (falls back to headline).
 */
"use client";

import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";
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

/** Shorthand: format a nullable number with a unit for metric tiles. */
const fmt = (value: number | null, unit: string) => formatNumber(value, unit || undefined);

function TrendRow({
  label,
  data,
  dataKey,
  stroke,
  showXAxis = false,
}: {
  label: string;
  data: HealthSparklinePoint[];
  dataKey: keyof HealthSparklinePoint;
  stroke: string;
  showXAxis?: boolean;
}) {
  const hasValue = data.some((point) => typeof point[dataKey] === "number");
  if (!hasValue) return null;
  return (
    <div className="grid gap-2">
      <p className={SECTION_LABEL_CLASS}>{label}</p>
      <ResponsiveContainer width="100%" height={showXAxis ? 88 : 60}>
        <LineChart data={data} margin={{ top: 2, right: 8, left: 4, bottom: showXAxis ? 16 : 2 }}>
          {showXAxis && (
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#a1a1aa" }}
              tickFormatter={formatChartDate}
              axisLine={false}
              tickLine={false}
              interval={4}
            />
          )}
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, padding: "4px 8px" }}
            formatter={(v) => [typeof v === "number" ? v.toFixed(1) : "—"]}
            labelFormatter={(l) => formatChartDate(String(l))}
          />
          <Line
            type="linear"
            dataKey={dataKey as string}
            stroke={stroke}
            dot={{ r: 1.75, fill: stroke }}
            activeDot={{ r: 4 }}
            strokeWidth={1.9}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RecoveryOverviewCard({
  recovery,
  analysis,
}: {
  recovery: RecoveryOverview & { sparkline: HealthSparklinePoint[] };
  analysis: string | null;
}) {
  const featured = recovery.metrics.slice(0, 5);
  const sleepFmt = formatSleepScore(recovery.last_night.sleep_score);
  const analysisText = analysis ?? recovery.headline;

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
      <CardContent className="grid gap-4">
        <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <DashboardMetricTile
            label="Sleep score"
            value={sleepFmt.text}
            valueClassName={sleepFmt.color}
            subtitle={fmt(recovery.last_night.sleep_duration_hours, "h")}
          />
          <DashboardMetricTile
            label="Sleep time"
            value={fmt(recovery.last_night.sleep_duration_hours, "h")}
            subtitle={`Score ${sleepFmt.text}`}
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
            label="Readiness"
            value={fmt(recovery.last_night.morning_training_readiness_score, "")}
            subtitle="Morning score"
          />
          <DashboardMetricTile
            label="SpO2"
            value={fmt(recovery.last_night.pulse_ox_avg, "%")}
            subtitle={`Resp. ${fmt(recovery.last_night.respiration_sleep, "")}`}
          />
        </div>

        {recovery.sparkline.length > 0 && (
          <div className="rounded-2xl border border-zinc-100 p-3">
            <p className={`mb-2 ${SECTION_LABEL_CLASS}`}>30-day trends</p>
            <div className="grid gap-3">
              <TrendRow label="Sleep score" data={recovery.sparkline} dataKey="sleep_score" stroke="#6366f1" />
              <TrendRow label="HRV (ms)" data={recovery.sparkline} dataKey="hrv" stroke="#10b981" />
              <TrendRow
                label="Resting HR"
                data={recovery.sparkline}
                dataKey="resting_hr"
                stroke="#f97316"
                showXAxis
              />
            </div>
          </div>
        )}

        <div className="grid gap-2">
          {featured.map((metric) => (
            <div
              key={metric.key}
              className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr] items-center rounded-xl border border-zinc-100 px-3 py-2.5 text-sm"
            >
              <p className="font-medium text-zinc-700">{metric.label}</p>
              <div>
                <p className={SECTION_LABEL_CLASS}>Now</p>
                <p className="font-semibold text-zinc-900">{fmt(metric.current, metric.unit)}</p>
              </div>
              <div>
                <p className={SECTION_LABEL_CLASS}>7d / 30d</p>
                <p className="font-semibold text-zinc-900">
                  {fmt(metric.avg_7d, "")} / {fmt(metric.avg_30d, "")}
                </p>
              </div>
              <div className={getTrendColor(metric.direction_vs_7d)}>
                <p className={SECTION_LABEL_CLASS}>Trend</p>
                <p className="font-semibold">{getTrendLabel(metric.direction_vs_7d)}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
