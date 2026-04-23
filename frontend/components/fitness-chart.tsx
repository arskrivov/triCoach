/**
 * FitnessChart — CTL / ATL / TSB fitness timeline visualisation.
 *
 * Renders a 60-day line chart of the three core endurance training metrics:
 * - CTL (Chronic Training Load) — long-term fitness
 * - ATL (Acute Training Load) — short-term fatigue
 * - TSB (Training Stress Balance) — form (CTL − ATL)
 *
 * Suitable for use on any page that has access to a `FitnessPoint[]` array
 * from the `/fitness/timeline` or `/dashboard/overview` endpoints.
 *
 * @example
 * ```tsx
 * // Standalone card
 * <FitnessChart data={fitnessTimeline} />
 *
 * // Embedded inside another card (no extra shadow)
 * <FitnessChart data={fitnessTimeline} embedded />
 * ```
 */

"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Label,
} from "recharts";
import type { FitnessPoint } from "@/lib/types";

type TsbStatus = {
  label: string;
  tone: string;
  description: string;
};

function getTsbStatus(tsb: number): TsbStatus {
  if (tsb > 10) {
    return {
      label: "Fresh",
      tone: "bg-emerald-50 text-emerald-700",
      description: "Positive form. Good context for a race, taper, or key quality session.",
    };
  }
  if (tsb >= -10) {
    return {
      label: "Balanced",
      tone: "bg-sky-50 text-sky-700",
      description: "Reasonably adapted to recent load. Usually fine for normal training.",
    };
  }
  if (tsb >= -30) {
    return {
      label: "Productive load",
      tone: "bg-amber-50 text-amber-700",
      description: "Training strain is elevated but still within a common build-zone range.",
    };
  }
  return {
    label: "High fatigue",
    tone: "bg-rose-50 text-rose-700",
    description: "Recent load is far above fitness. Recovery should drive the next decision.",
  };
}

export interface FitnessChartProps {
  /** Array of fitness data points. Renders nothing if empty or undefined. */
  data?: FitnessPoint[];
  /**
   * When true, renders without a drop shadow (for embedding inside another card).
   * Defaults to false.
   */
  embedded?: boolean;
}

export function FitnessChart({ data: initialData, embedded = false }: FitnessChartProps) {
  const chartData = initialData ?? [];

  if (chartData.length === 0) return null;

  const visible = chartData.slice(-60);
  const latest = chartData[chartData.length - 1];
  const latestStatus = getTsbStatus(latest.tsb);

  const allY = visible.flatMap((d) => [d.ctl, d.atl, d.tsb]);
  const yMin = Math.floor(Math.min(...allY) - 5);
  const yMax = Math.ceil(Math.max(...allY) + 5);

  const content = (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Fitness &amp; Form</h2>
        <div className="flex gap-4 text-xs text-zinc-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-indigo-500" /> CTL
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-amber-400" /> ATL
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-emerald-500" /> TSB
          </span>
        </div>
      </div>
      <div className="mb-4 grid gap-3">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${latestStatus.tone}`}>
            {latestStatus.label}
          </span>
          <span className="text-zinc-600">
            TSB {latest.tsb > 0 ? "+" : ""}
            {latest.tsb.toFixed(1)}. {latestStatus.description}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={visible} margin={{ top: 4, right: 20, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            tickFormatter={(v: string) => v.slice(5)}
            interval={Math.floor(visible.length / 6)}
          />
          <YAxis tick={{ fontSize: 10 }} domain={[yMin, yMax]} />
          <ReferenceLine y={10} stroke="#10b981" strokeWidth={1.25} strokeDasharray="4 2">
            <Label value="Fresh" position="insideRight" offset={4} fill="#047857" fontSize={10} />
          </ReferenceLine>
          <ReferenceLine y={0} stroke="#64748b" strokeWidth={1} strokeDasharray="4 2" />
          <ReferenceLine y={-10} stroke="#0ea5e9" strokeWidth={1.25} strokeDasharray="4 2">
            <Label value="Balanced" position="insideRight" offset={4} fill="#0369a1" fontSize={10} />
          </ReferenceLine>
          <ReferenceLine y={-30} stroke="#f97316" strokeWidth={1.25} strokeDasharray="4 2">
            <Label value="Load / fatigue boundary" position="insideRight" offset={4} fill="#c2410c" fontSize={10} />
          </ReferenceLine>
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v, name) => [
              typeof v === "number" ? v.toFixed(1) : String(v),
              String(name).toUpperCase(),
            ]}
            labelFormatter={(l) => String(l)}
          />
          <Line type="monotone" dataKey="ctl" name="ctl" stroke="#6366f1" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="atl" name="atl" stroke="#f97316" dot={false} strokeWidth={2} />
          <Line
            type="monotone"
            dataKey="tsb"
            name="tsb"
            stroke="#10b981"
            dot={false}
            strokeWidth={2}
            strokeDasharray="5 3"
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  );

  if (embedded) {
    return <div className="rounded-2xl border border-zinc-100 bg-white p-4">{content}</div>;
  }

  return <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">{content}</div>;
}
