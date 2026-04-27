"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Goal, Discipline } from "@/lib/types";
import {
  getCalendarGrid,
  toDateKey,
  buildWorkoutMap,
  buildRaceMap,
  formatDurationCompact,
  isDatePast,
  isDateToday,
} from "./calendar-utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkoutContent {
  type?: string;
  warmup?: WorkoutSegment | string;
  main?: WorkoutSegment[] | WorkoutSegment | string[] | string;
  cooldown?: WorkoutSegment | string;
  target_tss?: number;
  target_hr_zone?: string;
  notes?: string;
}

interface WorkoutSegment {
  duration_min?: number;
  zone?: string;
  description?: string;
  repeats?: number;
  rest_min?: number;
}

export interface PlanWorkoutResponse {
  id: string;
  name: string;
  discipline: Discipline;
  builder_type: string;
  description: string | null;
  content: WorkoutContent | null;
  estimated_duration_seconds: number | null;
  estimated_tss: number | null;
  scheduled_date: string | null;
  plan_week: number | null;
  plan_day: number | null;
  garmin_workout_id: number | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DISCIPLINE_ICONS: Record<string, string> = {
  SWIM: "🏊",
  RUN: "🏃",
  RIDE_ROAD: "🚴",
  RIDE_GRAVEL: "🚴",
  STRENGTH: "🏋️",
  YOGA: "🧘",
  MOBILITY: "🧘",
  OTHER: "🏅",
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── MonthNavigator ───────────────────────────────────────────────────────────

interface MonthNavigatorProps {
  currentMonth: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

function MonthNavigator({
  currentMonth,
  onPrev,
  onNext,
  onToday,
}: MonthNavigatorProps) {
  const label = currentMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={onPrev} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onNext} aria-label="Next month">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={onToday}>
        Today
      </Button>
      <span className="ml-1 text-sm font-semibold">{label}</span>
    </div>
  );
}

// ── CalendarCell ─────────────────────────────────────────────────────────────

interface CalendarCellProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  workouts: PlanWorkoutResponse[];
  races: Goal[];
  onWorkoutClick: (workout: PlanWorkoutResponse) => void;
}

function CalendarCell({
  date,
  isCurrentMonth,
  isToday,
  workouts,
  races,
  onWorkoutClick,
}: CalendarCellProps) {
  const dateKey = toDateKey(date);
  const past = isDatePast(dateKey);

  return (
    <div
      className={cn(
        "min-h-[5.5rem] border-b border-r p-1 overflow-y-auto",
        !isCurrentMonth && "text-muted-foreground opacity-40",
        isToday && "border-l-2 border-primary"
      )}
    >
      <span className="text-xs font-medium leading-none">{date.getDate()}</span>

      {/* Race markers */}
      {races.map((race) => (
        <div
          key={race.id}
          className="mt-0.5 truncate rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-600"
        >
          🏁 {race.description}
        </div>
      ))}

      {/* Workout cards */}
      {workouts.map((workout) => {
        const icon = DISCIPLINE_ICONS[workout.discipline] ?? "🏅";
        const duration = formatDurationCompact(workout.estimated_duration_seconds);
        const tss =
          workout.estimated_tss != null
            ? `${Math.round(workout.estimated_tss)} TSS`
            : null;
        const parts = [duration, tss].filter(Boolean).join(" · ");

        return (
          <button
            key={workout.id}
            type="button"
            onClick={() => onWorkoutClick(workout)}
            className={cn(
              "mt-0.5 flex w-full items-center gap-0.5 truncate rounded px-1 text-left text-[10px] leading-tight hover:bg-muted",
              past && "opacity-60"
            )}
          >
            <span>{icon}</span>
            {parts && <span>{parts}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── MonthlyCalendar ──────────────────────────────────────────────────────────

interface MonthlyCalendarProps {
  workouts: PlanWorkoutResponse[];
  races: Goal[];
  currentMonth: Date;
  onMonthChange: (month: Date) => void;
  onWorkoutClick: (workout: PlanWorkoutResponse) => void;
}

export function MonthlyCalendar({
  workouts,
  races,
  currentMonth,
  onMonthChange,
  onWorkoutClick,
}: MonthlyCalendarProps) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const grid = useMemo(() => getCalendarGrid(year, month), [year, month]);

  const workoutMap = useMemo(() => buildWorkoutMap(workouts), [workouts]);
  const raceMap = useMemo(() => buildRaceMap(races), [races]);

  const handlePrev = () => {
    onMonthChange(new Date(year, month - 1, 1));
  };

  const handleNext = () => {
    onMonthChange(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    const now = new Date();
    onMonthChange(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  return (
    <div>
      <MonthNavigator
        currentMonth={currentMonth}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
      />

      {/* Day-of-week headers */}
      <div className="mt-3 grid grid-cols-7 border-t border-l">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="border-b border-r px-1 py-1 text-center text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-l">
        {grid.flat().map((date) => {
          const key = toDateKey(date);
          return (
            <CalendarCell
              key={key}
              date={date}
              isCurrentMonth={date.getMonth() === month}
              isToday={isDateToday(key)}
              workouts={workoutMap[key] ?? []}
              races={raceMap[key] ?? []}
              onWorkoutClick={onWorkoutClick}
            />
          );
        })}
      </div>
    </div>
  );
}
