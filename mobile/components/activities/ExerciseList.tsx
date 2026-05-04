/**
 * ExerciseList — Displays exercise details for strength activities.
 *
 * Shows exercise name, sets × reps, and weight (when non-null) in a
 * table-like layout inside a Card. Returns null when the exercises
 * array is empty.
 *
 * @see Requirements 6.11
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { useThemeColors } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Exercise {
  name: string;
  sets: number;
  reps: number;
  weight_kg: number | null;
}

export interface ExerciseListProps {
  /** Array of exercises to display. */
  exercises: Exercise[];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format sets and reps as "sets × reps".
 */
function formatSetsReps(sets: number, reps: number): string {
  return `${sets} × ${reps}`;
}

/**
 * Format weight in kg. Returns "—" when the value is null.
 */
function formatWeight(weightKg: number | null): string {
  if (weightKg === null) return "—";
  return `${weightKg} kg`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExerciseList({ exercises }: ExerciseListProps) {
  const colors = useThemeColors();

  if (exercises.length === 0) {
    return null;
  }

  return (
    <Card>
      <Text style={[styles.header, { color: colors.foreground }]}>
        Exercises
      </Text>

      {/* Column headers */}
      <View
        style={[
          styles.row,
          styles.headerRow,
          { borderBottomColor: colors.cardBorder },
        ]}
      >
        <Text
          style={[
            styles.cell,
            styles.cellName,
            styles.headerText,
            { color: colors.mutedForeground },
          ]}
        >
          Exercise
        </Text>
        <Text
          style={[
            styles.cell,
            styles.cellSetsReps,
            styles.headerText,
            { color: colors.mutedForeground },
          ]}
        >
          Sets × Reps
        </Text>
        <Text
          style={[
            styles.cell,
            styles.cellWeight,
            styles.headerText,
            { color: colors.mutedForeground },
          ]}
        >
          Weight
        </Text>
      </View>

      {/* Data rows */}
      {exercises.map((exercise, index) => (
        <View
          key={`${exercise.name}-${index}`}
          style={[
            styles.row,
            index < exercises.length - 1 && {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.cardBorder,
            },
            index % 2 === 1 && { backgroundColor: colors.muted },
          ]}
          accessibilityLabel={`${exercise.name}, ${formatSetsReps(exercise.sets, exercise.reps)}${exercise.weight_kg !== null ? `, ${formatWeight(exercise.weight_kg)}` : ""}`}
        >
          <Text
            style={[styles.cell, styles.cellName, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {exercise.name}
          </Text>
          <Text
            style={[
              styles.cell,
              styles.cellSetsReps,
              { color: colors.foreground },
            ]}
          >
            {formatSetsReps(exercise.sets, exercise.reps)}
          </Text>
          <Text
            style={[
              styles.cell,
              styles.cellWeight,
              { color: colors.foreground },
            ]}
          >
            {formatWeight(exercise.weight_kg)}
          </Text>
        </View>
      ))}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  header: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  headerRow: {
    borderBottomWidth: 1,
    paddingBottom: 6,
    marginBottom: 2,
  },
  headerText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cell: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  cellName: {
    flex: 2,
    paddingRight: 8,
    fontWeight: "500",
  },
  cellSetsReps: {
    flex: 1,
    textAlign: "center",
  },
  cellWeight: {
    flex: 1,
    textAlign: "right",
  },
});
