/**
 * TrainingCalendar — Calendar with context-aware workout agenda.
 *
 * Uses react-native-calendars Calendar (NOT ExpandableCalendar) to avoid
 * the auto-scroll-on-day-press bug. Tapping a day highlights it and filters
 * workouts — the calendar never scrolls on tap. Only the ← → arrows navigate.
 */

import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Calendar } from "react-native-calendars";

import { useThemeColors, useColorSchemeName } from "@/lib/theme";
import { getDisciplineMeta, formatDuration } from "@/lib/format";
import type { PlanWorkout, WorkoutStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TrainingCalendarProps {
  workouts: PlanWorkout[];
  getWorkoutStatus: (workout: PlanWorkout) => WorkoutStatus;
  onWorkoutPress: (workout: PlanWorkout) => void;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateKey(s: string): string { return s.slice(0, 10); }

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonthRange(dateStr: string): [string, string] {
  const d = new Date(dateStr + "T00:00:00");
  return [fmtDate(new Date(d.getFullYear(), d.getMonth(), 1)),
          fmtDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
}

function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function getStatusAccent(status: WorkoutStatus, colors: any): string {
  switch (status) {
    case "completed": return colors.statusPositive;
    case "today": return colors.primary;
    case "skipped": return colors.statusCaution;
    default: return colors.cardBorder;
  }
}

function getStatusLabel(status: WorkoutStatus): string | null {
  switch (status) {
    case "completed": return "✓ Done";
    case "today": return "Today";
    case "skipped": return "Skipped";
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Marked dates
// ---------------------------------------------------------------------------

function buildMarkedDates(
  workouts: PlanWorkout[],
  selectedDate: string | null,
  today: string
) {
  const marks: Record<string, any> = {};

  for (const w of workouts) {
    if (!w.scheduled_date) continue;
    const key = dateKey(w.scheduled_date);
    if (!marks[key]) marks[key] = { dots: [], marked: true };
    const meta = getDisciplineMeta(w.discipline, false);
    if (!marks[key].dots.some((d: any) => d.key === w.discipline)) {
      marks[key].dots.push({ key: w.discipline, color: meta.color });
    }
  }

  // Highlight selected date (or today if nothing selected)
  const highlightDate = selectedDate ?? today;
  if (marks[highlightDate]) {
    marks[highlightDate] = { ...marks[highlightDate], selected: true };
  } else {
    marks[highlightDate] = { selected: true, dots: [] };
  }

  return marks;
}

// ---------------------------------------------------------------------------
// Filter workouts
// ---------------------------------------------------------------------------

function filterWorkouts(
  workouts: PlanWorkout[],
  selectedDate: string | null,
  visibleMonth: string
): PlanWorkout[] {
  if (selectedDate) {
    return workouts.filter(
      (w) => w.scheduled_date && dateKey(w.scheduled_date) === selectedDate
    );
  }
  // No day selected → show entire visible month
  const [start, end] = getMonthRange(visibleMonth);
  return workouts.filter((w) => {
    if (!w.scheduled_date) return false;
    const key = dateKey(w.scheduled_date);
    return key >= start && key <= end;
  });
}

function groupByDate(workouts: PlanWorkout[]) {
  const map = new Map<string, PlanWorkout[]>();
  for (const w of workouts) {
    if (!w.scheduled_date) continue;
    const key = dateKey(w.scheduled_date);
    const arr = map.get(key);
    if (arr) arr.push(w); else map.set(key, [w]);
  }
  return [...map.entries()].sort(([a],[b]) => a.localeCompare(b))
    .map(([date, ws]) => ({ date, workouts: ws }));
}

// ---------------------------------------------------------------------------
// Workout Row
// ---------------------------------------------------------------------------

function WorkoutRow({ workout, status, onPress }: {
  workout: PlanWorkout; status: WorkoutStatus; onPress: () => void;
}) {
  const colors = useThemeColors();
  const isDark = useColorSchemeName() === "dark";
  const meta = getDisciplineMeta(workout.discipline, isDark);
  const accent = getStatusAccent(status, colors);
  const statusLabel = getStatusLabel(status);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.workoutRow,
        { backgroundColor: colors.card, borderLeftColor: accent,
          opacity: pressed ? 0.7 : status === "upcoming" ? 0.85 : 1 },
      ]}
      accessibilityRole="button"
    >
      <Text style={styles.workoutIcon}>{meta.icon}</Text>
      <View style={styles.workoutInfo}>
        <Text style={[styles.workoutName, { color: colors.foreground }]} numberOfLines={1}>
          {workout.name || "Untitled Workout"}
        </Text>
        <View style={styles.workoutMeta}>
          <Text style={[styles.workoutStat, { color: colors.mutedForeground }]}>
            {formatDuration(workout.estimated_duration_seconds)}
          </Text>
          {workout.estimated_tss != null && (
            <Text style={[styles.workoutStat, { color: colors.mutedForeground }]}>
              {workout.estimated_tss} TSS
            </Text>
          )}
          {statusLabel && (
            <Text style={[styles.workoutStatus, { color: accent }]}>{statusLabel}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TrainingCalendar({
  workouts, getWorkoutStatus, onWorkoutPress,
}: TrainingCalendarProps) {
  const colors = useThemeColors();
  const today = todayStr();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(today);

  const markedDates = useMemo(
    () => buildMarkedDates(workouts, selectedDate, today),
    [workouts, selectedDate, today]
  );

  const filteredWorkouts = useMemo(
    () => filterWorkouts(workouts, selectedDate, visibleMonth),
    [workouts, selectedDate, visibleMonth]
  );

  const groupedWorkouts = useMemo(() => groupByDate(filteredWorkouts), [filteredWorkouts]);

  const calendarTheme = useMemo(() => ({
    backgroundColor: colors.background,
    calendarBackground: colors.card,
    textSectionTitleColor: colors.mutedForeground,
    selectedDayBackgroundColor: colors.primary,
    selectedDayTextColor: colors.primaryForeground,
    todayTextColor: colors.primary,
    dayTextColor: colors.foreground,
    textDisabledColor: colors.mutedForeground,
    arrowColor: colors.primary,
    monthTextColor: colors.foreground,
    textDayFontWeight: "500" as const,
    textMonthFontWeight: "700" as const,
    textDayHeaderFontWeight: "600" as const,
    textDayFontSize: 15,
    textMonthFontSize: 16,
    textDayHeaderFontSize: 12,
  }), [colors]);

  // Tap a day → toggle selection. Calendar does NOT scroll.
  const handleDayPress = useCallback((day: { dateString: string }) => {
    setSelectedDate((prev) => prev === day.dateString ? null : day.dateString);
  }, []);

  // ← → arrows change the visible month
  const handleMonthChange = useCallback((month: { dateString: string }) => {
    setVisibleMonth(month.dateString);
    setSelectedDate(null);
  }, []);

  const filterLabel = selectedDate
    ? `Selected: ${formatDayHeader(selectedDate)}`
    : "All workouts this month";

  // Build flat list data
  const listData = useMemo(() => {
    const items: Array<
      | { type: "header"; date: string; key: string }
      | { type: "workout"; workout: PlanWorkout; key: string }
    > = [];
    for (const group of groupedWorkouts) {
      items.push({ type: "header", date: group.date, key: `h-${group.date}` });
      for (const w of group.workouts) {
        items.push({ type: "workout", workout: w, key: `w-${w.id}` });
      }
    }
    return items;
  }, [groupedWorkouts]);

  return (
    <View style={styles.container}>
      {/* Calendar — plain Calendar, no auto-scroll on day press */}
      <Calendar
        current={visibleMonth}
        firstDay={1}
        markingType="multi-dot"
        markedDates={markedDates}
        theme={calendarTheme}
        onDayPress={handleDayPress}
        onMonthChange={handleMonthChange}
        enableSwipeMonths
        style={styles.calendar}
      />

      {/* Filter bar */}
      <View style={styles.filterBar}>
        <Text style={[styles.filterLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
          {filterLabel}
        </Text>
        {selectedDate && (
          <Pressable
            onPress={() => setSelectedDate(null)}
            style={[styles.clearButton, { backgroundColor: colors.muted }]}
          >
            <Text style={[styles.clearText, { color: colors.primary }]}>Show all</Text>
          </Pressable>
        )}
      </View>

      {/* Workout list */}
      <FlatList
        data={listData}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <Text style={[styles.dayHeader, { color: colors.primary }]}>
                {formatDayHeader(item.date)}
              </Text>
            );
          }
          const status = getWorkoutStatus(item.workout);
          return (
            <WorkoutRow
              workout={item.workout}
              status={status}
              onPress={() => onWorkoutPress(item.workout)}
            />
          );
        }}
        ListEmptyComponent={
          <View style={[styles.emptyDay, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyDayText, { color: colors.mutedForeground }]}>
              {selectedDate ? "Rest day 🌿" : "No workouts this month"}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        scrollEnabled={false}
        nestedScrollEnabled
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { width: "100%" },
  calendar: { borderRadius: 12, overflow: "hidden" },
  filterBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  filterLabel: { fontSize: 13, fontWeight: "600", flex: 1 },
  clearButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  clearText: { fontSize: 13, fontWeight: "600" },
  dayHeader: {
    fontSize: 13, fontWeight: "700", textTransform: "uppercase",
    letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  workoutRow: {
    flexDirection: "row", alignItems: "center", borderLeftWidth: 4,
    borderRadius: 10, marginHorizontal: 12, marginVertical: 4, padding: 12, minHeight: 56,
  },
  workoutIcon: { fontSize: 20, marginRight: 12 },
  workoutInfo: { flex: 1 },
  workoutName: { fontSize: 15, fontWeight: "600" },
  workoutMeta: { flexDirection: "row", gap: 10, marginTop: 3 },
  workoutStat: { fontSize: 12, fontWeight: "500" },
  workoutStatus: { fontSize: 12, fontWeight: "700" },
  emptyDay: {
    marginHorizontal: 12, marginVertical: 4, padding: 16,
    borderRadius: 10, alignItems: "center",
  },
  emptyDayText: { fontSize: 14 },
  listContent: { paddingBottom: 8 },
});
