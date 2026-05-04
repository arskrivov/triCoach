/**
 * PhaseIndicator — Horizontal bar showing all training phases with the current phase highlighted.
 *
 * Displays a segmented bar where each segment represents a training phase,
 * proportionally sized by the number of weeks in that phase. The phase
 * containing `currentWeek` is rendered at full opacity; other phases are dimmed.
 * Phase name labels appear below each segment.
 *
 * Phase colours:
 * - Base     → blue    (#3b82f6)
 * - Build    → amber   (#f59e0b)
 * - Peak     → red     (#ef4444)
 * - Taper    → emerald (#10b981)
 * - Recovery → purple  (#8b5cf6)
 *
 * @see Requirements 8.2
 */

import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";

import { useThemeColors } from "@/lib/theme";
import type { PlanPhase } from "@/lib/types";

// ---------------------------------------------------------------------------
// Phase colour mapping
// ---------------------------------------------------------------------------

const PHASE_COLORS: Record<string, string> = {
  base: "#3b82f6",
  build: "#f59e0b",
  peak: "#ef4444",
  taper: "#10b981",
  recovery: "#8b5cf6",
};

/** Default colour when the phase name doesn't match a known key. */
const DEFAULT_PHASE_COLOR = "#6b7280";

/**
 * Resolve the colour for a phase by matching its name (case-insensitive)
 * against the known phase colour map.
 */
export function getPhaseColor(phaseName: string): string {
  const key = phaseName.toLowerCase().trim();
  return PHASE_COLORS[key] ?? DEFAULT_PHASE_COLOR;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface PhaseIndicatorProps {
  /** Ordered list of training plan phases. */
  phases: PlanPhase[];
  /** The current week number (1-based). Used to determine which phase is active. */
  currentWeek: number;
  /** Optional style overrides for the outer container. */
  style?: ViewStyle;
}

/**
 * Determine whether a phase is the "current" phase — i.e. its `weeks` array
 * contains `currentWeek`.
 */
function isCurrentPhase(phase: PlanPhase, currentWeek: number): boolean {
  return phase.weeks.includes(currentWeek);
}

export function PhaseIndicator({ phases, currentWeek, style }: PhaseIndicatorProps) {
  const colors = useThemeColors();

  // Total weeks across all phases — used to compute proportional widths.
  const totalWeeks = phases.reduce((sum, phase) => sum + phase.weeks.length, 0);

  if (phases.length === 0 || totalWeeks === 0) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      {/* Segmented bar */}
      <View style={styles.barRow}>
        {phases.map((phase, index) => {
          const phaseColor = getPhaseColor(phase.name);
          const isCurrent = isCurrentPhase(phase, currentWeek);
          const widthPercent = (phase.weeks.length / totalWeeks) * 100;

          return (
            <View
              key={`${phase.name}-${index}`}
              style={[
                styles.segment,
                {
                  backgroundColor: phaseColor,
                  opacity: isCurrent ? 1 : 0.35,
                  width: `${widthPercent}%` as unknown as number,
                },
                index === 0 && styles.segmentFirst,
                index === phases.length - 1 && styles.segmentLast,
              ]}
            />
          );
        })}
      </View>

      {/* Phase labels */}
      <View style={styles.labelRow}>
        {phases.map((phase, index) => {
          const phaseColor = getPhaseColor(phase.name);
          const isCurrent = isCurrentPhase(phase, currentWeek);
          const widthPercent = (phase.weeks.length / totalWeeks) * 100;

          return (
            <View
              key={`label-${phase.name}-${index}`}
              style={{ width: `${widthPercent}%` as unknown as number }}
            >
              <Text
                style={[
                  styles.label,
                  {
                    color: isCurrent ? phaseColor : colors.mutedForeground,
                    fontWeight: isCurrent ? "700" : "500",
                  },
                ]}
                numberOfLines={1}
              >
                {phase.name}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  barRow: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  segment: {
    height: "100%",
  },
  segmentFirst: {
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  segmentLast: {
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  labelRow: {
    flexDirection: "row",
    marginTop: 6,
  },
  label: {
    fontSize: 11,
    textAlign: "center",
    textTransform: "capitalize",
  },
});
