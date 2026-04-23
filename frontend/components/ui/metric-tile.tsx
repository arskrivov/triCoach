/**
 * MetricTile — a generic single-metric display component.
 *
 * Renders a labelled metric value with an optional subtitle in a
 * consistent card style. Suitable for any page that needs to display
 * a key number (e.g. recovery metrics, activity stats, athlete profile).
 *
 * @example
 * ```tsx
 * <MetricTile label="HRV" value="65 ms" subtitle="7-day avg: 62 ms" />
 * ```
 */

import { cn } from "@/lib/utils";

export interface MetricTileProps {
  /** Short uppercase label displayed above the value. */
  label: string;
  /** Primary metric value to display (pre-formatted string). */
  value: string;
  /** Optional secondary line shown below the value. */
  subtitle?: string;
  /** Additional Tailwind classes applied to the value element. */
  valueClassName?: string;
  /** Additional Tailwind classes applied to the outer container. */
  className?: string;
}

export function MetricTile({
  label,
  value,
  subtitle,
  valueClassName,
  className,
}: MetricTileProps) {
  return (
    <div
      className={cn(
        "flex min-h-[120px] flex-col justify-between rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-4",
        className,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">{label}</p>
      <div className="grid gap-1">
        <p className={cn("text-2xl font-bold text-zinc-900", valueClassName)}>{value}</p>
        {subtitle ? <p className="text-xs text-zinc-400">{subtitle}</p> : null}
      </div>
    </div>
  );
}

/** @deprecated Use {@link MetricTile} instead. */
export { MetricTile as DashboardMetricTile };
