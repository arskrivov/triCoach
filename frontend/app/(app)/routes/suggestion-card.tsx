"use client";

import { CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RouteSuggestion } from "@/lib/types";

/** Tailwind colour for common cycling surface types. */
const SURFACE_COLORS: Record<string, string> = {
  asphalt: "bg-violet-500",
  paved: "bg-violet-400",
  concrete: "bg-violet-300",
  gravel: "bg-amber-500",
  dirt: "bg-amber-700",
  grass: "bg-green-500",
  sand: "bg-yellow-500",
  cobblestone: "bg-stone-500",
  unknown: "bg-zinc-400",
};

interface SuggestionCardProps {
  suggestion: RouteSuggestion;
  onSelect: () => void;
  isSelecting: boolean;
  disabled: boolean;
}

export function SuggestionCard({
  suggestion,
  onSelect,
  isSelecting,
  disabled,
}: SuggestionCardProps) {
  const dist =
    suggestion.distance_meters >= 500
      ? `${(suggestion.distance_meters / 1000).toFixed(1)} km`
      : `${Math.round(suggestion.distance_meters)} m`;

  const elev = suggestion.elevation_gain_meters
    ? `+${suggestion.elevation_gain_meters.toFixed(0)} m`
    : null;

  // Surface breakdown bar (for cycling routes)
  const surfaces = suggestion.surface_breakdown
    ? Object.entries(suggestion.surface_breakdown).sort(([, a], [, b]) => b - a)
    : [];
  const hasSurfaces = surfaces.length > 0;

  return (
    <div className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-primary/30 transition-all">
      <div className="flex-1 min-w-0">
        {/* Top row: name + popularity label */}
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-medium truncate">{suggestion.name}</p>
          {suggestion.popularity_label && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {suggestion.popularity_label}
            </Badge>
          )}
        </div>

        {/* Stats row */}
        <p className="text-xs text-muted-foreground">
          {dist}
          {elev ? ` · ${elev}` : ""}
        </p>

        {/* Usage count */}
        {suggestion.usage_count_90d > 0 && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Used by {suggestion.usage_count_90d}{" "}
            {suggestion.usage_count_90d === 1 ? "athlete" : "athletes"}
          </p>
        )}

        {/* Surface breakdown bar */}
        {hasSurfaces && (
          <div className="mt-1.5 flex flex-col gap-0.5">
            <div className="flex h-1.5 w-full overflow-hidden rounded-full">
              {surfaces.map(([surface, pct]) => (
                <div
                  key={surface}
                  className={`${SURFACE_COLORS[surface] ?? SURFACE_COLORS.unknown}`}
                  style={{ width: `${pct}%` }}
                  title={`${surface}: ${pct.toFixed(0)}%`}
                />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {surfaces
                .slice(0, 3)
                .map(([s, p]) => `${s} ${p.toFixed(0)}%`)
                .join(" · ")}
            </p>
          </div>
        )}
      </div>

      {/* Select button */}
      <Button
        size="sm"
        onClick={onSelect}
        disabled={disabled}
        className="shrink-0"
      >
        {isSelecting ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <CheckCircle className="size-3.5" />
        )}
        {isSelecting ? "Linking…" : "Select"}
      </Button>
    </div>
  );
}
