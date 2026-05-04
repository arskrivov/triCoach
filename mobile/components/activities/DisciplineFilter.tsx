/**
 * DisciplineFilter — Horizontal scrollable filter bar with discipline chips.
 *
 * Displays an "All" chip followed by one chip per discipline. Each chip shows
 * the discipline emoji + label from `getDisciplineMeta`. The selected chip is
 * highlighted with the discipline colour; unselected chips use muted styling.
 * Passing `null` to `onSelect` clears the filter (via the "All" chip).
 *
 * All chips meet the 44pt minimum touch target requirement.
 *
 * @see Requirements 6.3
 */

import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useThemeColors } from "@/lib/theme";
import { getDisciplineMeta } from "@/lib/format";
import type { Discipline } from "@/lib/types";

/** The ordered list of disciplines shown in the filter bar. */
const DISCIPLINES: Discipline[] = [
  "SWIM",
  "RUN",
  "RIDE_ROAD",
  "RIDE_GRAVEL",
  "STRENGTH",
  "YOGA",
  "MOBILITY",
];

export interface DisciplineFilterProps {
  /** Currently selected discipline, or `null` when "All" is active. */
  selected: Discipline | null;
  /** Called when the user taps a chip. Passes `null` for the "All" chip. */
  onSelect: (discipline: Discipline | null) => void;
}

export function DisciplineFilter({
  selected,
  onSelect,
}: DisciplineFilterProps) {
  const colors = useThemeColors();
  const isDark = colors.background === "#0a0a0a";

  const isAllSelected = selected === null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      {/* "All" chip */}
      <TouchableOpacity
        style={[
          styles.chip,
          isAllSelected
            ? { backgroundColor: colors.primary }
            : { backgroundColor: colors.muted },
        ]}
        onPress={() => onSelect(null)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="All disciplines"
        accessibilityState={{ selected: isAllSelected }}
      >
        <Text
          style={[
            styles.chipText,
            {
              color: isAllSelected
                ? colors.primaryForeground
                : colors.mutedForeground,
            },
          ]}
        >
          All
        </Text>
      </TouchableOpacity>

      {/* Discipline chips */}
      {DISCIPLINES.map((discipline) => {
        const meta = getDisciplineMeta(discipline, isDark);
        const isSelected = selected === discipline;

        return (
          <TouchableOpacity
            key={discipline}
            style={[
              styles.chip,
              isSelected
                ? { backgroundColor: meta.color }
                : { backgroundColor: colors.muted },
            ]}
            onPress={() => onSelect(discipline)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${meta.label}`}
            accessibilityState={{ selected: isSelected }}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color: isSelected ? "#ffffff" : colors.mutedForeground,
                },
              ]}
            >
              {meta.icon} {meta.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
