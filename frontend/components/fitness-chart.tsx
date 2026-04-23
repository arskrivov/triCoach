/**
 * FitnessChart — Fitness / Fatigue / Form performance management chart.
 *
 * Renders a 60-day chart showing:
 * - Fitness (CTL) — 42-day training load average, left axis
 * - Fatigue (ATL) — 7-day training load average, left axis
 * - Form (TSB) — Fitness minus Fatigue, right axis with coloured zones
 * - Daily Load (TSS) — bar chart on right axis
 *
 * Terminology follows TrainingPeaks PMC conventions but uses plain English labels.
 */

"use client";

import {
  ComposedChart,
  Line,
  Bar,
  YAxis,
  XAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import type { FitnessPoint } from "@/lib/types";

type FormZone = {
  label: string;
  tone: string;
  description: string;
};

function getFormZone(tsb: number): FormZone {
  if (tsb > 10) {
    return {
      label: "Fresh",
      tone: "bg-emerald-50 text-emerald-700",
      description: "Form is positive — good window for a race, key session, or taper.",
    };
  }
  if (tsb >= -10) {
    return {
      label: "Balanced",
      tone: "bg-sky-50 text-sky-700",
      description: "Fitness and fatigue are in balance. Normal training is appropriate.",
    };
  }
  if (tsb >= -30) {
    return {
      label: "Productive load",
      tone: "bg-amber-50 text-amber-700",
      description: "Fatigue is elevated but within a healthy build range.",
    };
  }
  return {
    label: "High fatigue",
    tone: "bg-rose-50 text-rose-700",
    description: "Fatigue is far above fitness. Prioritise recovery before the next hard session.",
  };
}

export interface FitnessChartProps {
  data?: FitnessPoint[];
  embedded?: boolean;
}

export function FitnessChart({ data: initialData, embedded = false }: FitnessChartProps) {
  const chartData = initialData ?? [];
  if (chartData.length === 0) return null;

  const visible = chartData.slice(-60);
  const latest = chartData[chartData.length - 1];
  const formZone = getFormZone(latest.tsb);

  // Left axis: CTL + ATL range
  const ctlAtlValues = visible.flatMap((d) => [d.ctl, d.atl]);
  const leftMin = Math.max(0, Math.floor(Math.min(...ctlAtlValues) - 5));
  const leftMax = Math.ceil(Math.max(...ctlAtlValues) + 10);

  // Right axis: TSB + daily TSS — keep TSB visible around zero
  const tsbValues = visible.map((d) => d.tsb);
  const tssValues = visible.map((d) => d.daily_tss).filter((v) => v > 0);
  const rightMin = Math.min(-40, Math.floor(Math.min(...tsbValues) - 5));
  const rightMax = Math.max(20, Math.ceil(Math.max(...tssValues, ...tsbValues) + 10));

  const content = (
    <>
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Fitness &amp; Form</h2>
        <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded bg-indigo-500" />
            Fitness (CTL)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded bg-amber-400" />
            Fatigue (ATL)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded bg-emerald-500" />
            Form (TSB)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-zinc-200" />
            Daily load
          </span>
        </div>
      </div>

      {/* Current form badge */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${formZone.tone}`}>
          {formZone.label}
        </span>
        <span className="text-zinc-600">
          Form (TSB) {latest.tsb > 0 ? "+" : ""}
          {latest.tsb.toFixed(1)} · Fitness {latest.ctl.toFixed(0)} · Fatigue {latest.atl.toFixed(0)}.{" "}
          {formZone.description}
        </span>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={visible} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#a1a1aa" }}
            tickFormatter={(v: string) => v.slice(5)}
            interval={Math.floor(visible.length / 6)}
            axisLine={false}
            tickLine={false}
          />
          {/* Left axis: Fitness (CTL) + Fatigue (ATL) */}
          <YAxis
            yAxisId="load"
            domain={[leftMin, leftMax]}
            tick={{ fontSize: 10, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          {/* Right axis: Form (TSB) + Daily load (TSS) */}
          <YAxis
            yAxisId="form"
            orientation="right"
            domain={[rightMin, rightMax]}
            tick={{ fontSize: 10, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
            width={28}
          />

          {/* TSB zone backgrounds on right axis */}
          <ReferenceArea yAxisId="form" y1={10} y2={rightMax} fill="#d1fae5" fillOpacity={0.25} />
          <ReferenceArea yAxisId="form" y1={-10} y2={10} fill="#e0f2fe" fillOpacity={0.25} />
          <ReferenceArea yAxisId="form" y1={-30} y2={-10} fill="#fef3c7" fillOpacity={0.3} />
          <ReferenceArea yAxisId="form" y1={rightMin} y2={-30} fill="#fee2e2" fillOpacity={0.3} />

          {/* Zero line for TSB */}
          <ReferenceLine yAxisId="form" y={0} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 2" />

          {/* Daily load bars (background) */}
          <Bar
            yAxisId="form"
            dataKey="daily_tss"
            fill="#e4e4e7"
            radius={[2, 2, 0, 0]}
            maxBarSize={8}
            name="Daily load"
          />

          {/* Fitness (CTL) */}
          <Line
            yAxisId="load"
            type="monotone"
            dataKey="ctl"
            stroke="#6366f1"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
            name="Fitness (CTL)"
          />
          {/* Fatigue (ATL) */}
          <Line
            yAxisId="load"
            type="monotone"
            dataKey="atl"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            name="Fatigue (ATL)"
          />
          {/* Form (TSB) */}
          <Line
            yAxisId="form"
            type="monotone"
            dataKey="tsb"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            strokeDasharray="5 3"
            name="Form (TSB)"
          />

          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, padding: "6px 10px" }}
            labelFormatter={(l) => String(l)}
            formatter={(value, name) => {
              const v = typeof value === "number" ? value.toFixed(1) : "—";
              return [v, String(name)];
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );

  if (embedded) {
    return <div className="rounded-2xl border border-zinc-100 bg-white p-4">{content}</div>;
  }
  return <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">{content}</div>;
}
