"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Goal, TrainingPlan, Discipline, PlanPhase } from "@/lib/types";
import { RacesSection } from "./races-section";
import { ViewToggle } from "./view-toggle";
import { MonthlyCalendar } from "./monthly-calendar";

// ── API response types ───────────────────────────────────────────────────────

interface PlanWorkoutResponse {
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

interface PlanWithWorkouts {
  id: string;
  goal_id: string | null;
  name: string;
  status: string;
  race_date: string | null;
  start_date: string;
  end_date: string;
  weekly_hours: number;
  plan_structure: {
    total_weeks?: number;
    phases?: PlanPhase[];
    weekly_hours_distribution?: Record<string, number>;
    recovery_week_pattern?: number[];
  } | null;
  workouts: PlanWorkoutResponse[];
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

const PHASE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  Base: { bg: "bg-blue-500/15", text: "text-blue-500", bar: "bg-blue-500" },
  Build: { bg: "bg-amber-500/15", text: "text-amber-500", bar: "bg-amber-500" },
  Peak: { bg: "bg-red-500/15", text: "text-red-500", bar: "bg-red-500" },
  Taper: { bg: "bg-emerald-500/15", text: "text-emerald-500", bar: "bg-emerald-500" },
  Recovery: { bg: "bg-purple-500/15", text: "text-purple-500", bar: "bg-purple-500" },
};

/** Normalize AI phase names like "Build 2 Marathon" → "Build" */
function normalizePhaseLabel(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("recovery")) return "Recovery";
  if (lower.includes("taper")) return "Taper";
  if (lower.includes("peak")) return "Peak";
  if (lower.includes("build")) return "Build";
  if (lower.includes("base")) return "Base";
  return name;
}

/** Get phase colors using normalized name lookup */
function getPhaseColors(name: string) {
  return PHASE_COLORS[name] ?? PHASE_COLORS[normalizePhaseLabel(name)] ?? PHASE_COLORS.Base;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isDatePast(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

function isDateToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return dateStr.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WorkoutsPage() {
  // Active plan state
  const [activePlan, setActivePlan] = useState<PlanWithWorkouts | null>(null);
  const [allPlans, setAllPlans] = useState<TrainingPlan[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [selectedWorkout, setSelectedWorkout] = useState<PlanWorkoutResponse | null>(null);
  const [generatingGoalId, setGeneratingGoalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weekBriefing, setWeekBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Load data
  useEffect(() => {
    async function load() {
      try {
        // Fetch all plans
        const plansRes = await api.get<TrainingPlan[]>("/plans");
        setAllPlans(plansRes.data);

        // Find the active plan and load it with workouts
        const active = plansRes.data.find((p) => p.status === "active");
        if (active) {
          const planRes = await api.get<PlanWithWorkouts>(`/plans/${active.id}`);
          setActivePlan(planRes.data);

          // Jump to current week
          const today = new Date().toISOString().slice(0, 10);
          const todayWorkout = planRes.data.workouts.find(
            (w) => w.scheduled_date?.slice(0, 10) === today
          );
          if (todayWorkout?.plan_week) {
            setCurrentWeek(todayWorkout.plan_week);
          } else {
            const futureWorkout = planRes.data.workouts.find(
              (w) => w.scheduled_date && w.scheduled_date >= today
            );
            if (futureWorkout?.plan_week) {
              setCurrentWeek(futureWorkout.plan_week);
            }
          }
        }

        // Fetch goals for plan generation
        const goalsRes = await api.get<Goal[]>("/coach/goals");
        setGoals(goalsRes.data.filter((g) => g.is_active));
      } catch {
        // partial load is fine
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // Derived data for active plan
  const totalWeeks = activePlan?.plan_structure?.total_weeks ?? 1;
  const phases = activePlan?.plan_structure?.phases;

  const currentPhase = useMemo(() => {
    if (!phases) return null;
    return phases.find((p) => p.weeks.includes(currentWeek)) ?? null;
  }, [currentWeek, phases]);

  const weekWorkouts = useMemo(() => {
    if (!activePlan) return [];
    return activePlan.workouts.filter((w) => w.plan_week === currentWeek);
  }, [activePlan, currentWeek]);

  const dayWorkoutsMap = useMemo(() => {
    const map: Record<number, PlanWorkoutResponse[]> = {};
    for (let i = 0; i < 7; i++) map[i] = [];
    for (const w of weekWorkouts) {
      const day = w.plan_day ?? 0;
      if (day >= 0 && day <= 6) map[day].push(w);
    }
    return map;
  }, [weekWorkouts]);

  // Fetch weekly coach briefing when week changes
  useEffect(() => {
    if (!activePlan) return;
    let cancelled = false;
    setBriefingLoading(true);
    setWeekBriefing(null);
    api
      .get<{ briefing: string }>(`/plans/${activePlan.id}/week-briefing/${currentWeek}`)
      .then((res) => {
        if (!cancelled) setWeekBriefing(res.data.briefing);
      })
      .catch(() => {
        // briefing is non-critical — just skip it
      })
      .finally(() => {
        if (!cancelled) setBriefingLoading(false);
      });
    return () => { cancelled = true; };
  }, [activePlan?.id, currentWeek]);

  const jumpToToday = useCallback(() => {
    if (!activePlan) return;
    const today = new Date().toISOString().slice(0, 10);
    const todayW = activePlan.workouts.find((w) => w.scheduled_date?.slice(0, 10) === today);
    if (todayW?.plan_week) {
      setCurrentWeek(todayW.plan_week);
    } else {
      const futureW = activePlan.workouts.find((w) => w.scheduled_date && w.scheduled_date >= today);
      if (futureW?.plan_week) setCurrentWeek(futureW.plan_week);
    }
  }, [activePlan]);

  async function generatePlan() {
    setGeneratingGoalId("all");
    setError(null);
    try {
      await api.post<PlanWithWorkouts>("/plans/generate", {}, { timeout: 120_000 });
      window.location.reload();
    } catch (err: unknown) {
      try {
        const checkRes = await api.get<TrainingPlan[]>("/plans");
        const newActive = checkRes.data.find((p) => p.status === "active");
        if (newActive) {
          window.location.reload();
          return;
        }
      } catch {
        // ignore
      }
      const axiosDetail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(axiosDetail ?? "Failed to generate plan. Please try again.");
      setGeneratingGoalId(null);
    }
  }

  async function enrichCurrentWeek() {
    if (!activePlan) return;
    setEnriching(true);
    try {
      // Step 1: Generate detailed programs for the week's workouts
      await api.post(`/plans/${activePlan.id}/enrich-week/${currentWeek}`, {}, { timeout: 120_000 });

      // Step 2: Sync enriched workouts to Garmin
      try {
        await api.post(`/plans/${activePlan.id}/sync-garmin`, {}, { timeout: 60_000 });
      } catch {
        // Garmin sync is best-effort — might not be connected
      }

      // Refresh the plan to show updated workout content + Garmin sync status
      const planRes = await api.get<PlanWithWorkouts>(`/plans/${activePlan.id}`);
      setActivePlan(planRes.data);
    } catch {
      // non-critical — user can retry
    } finally {
      setEnriching(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="h-10 w-48 rounded-lg bg-muted/50 animate-pulse" />
        <div className="h-8 w-full rounded-lg bg-muted/50 animate-pulse" />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── No active plan — show races + generation prompt ──────────────────────

  if (!activePlan) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
            Workouts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add a race and generate an AI training plan
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-medium underline underline-offset-2 hover:no-underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Empty state — no plan yet */}
        <Card className="mb-8">
          <CardContent className="py-12 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-medium text-foreground">No active training plan</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Add a race (e.g. Ironman 70.3 on Sep 15), then generate
              a periodized plan tailored to your fitness and thresholds.
            </p>
          </CardContent>
        </Card>

        {/* Races with generate plan buttons */}
        <RacesSection
          races={goals}
          onRacesChange={setGoals}
          onGeneratePlan={generatePlan}
          generatingPlan={generatingGoalId !== null}
        />
        {generatingGoalId && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            Plan generation takes 10–30 seconds. Your fitness data and thresholds from Settings are used to tailor the plan.
          </p>
        )}

        {/* Past plans */}
        {allPlans.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">Past Plans</h2>
            <div className="space-y-2">
              {allPlans.map((plan) => (
                <Card key={plan.id}>
                  <CardContent className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-foreground truncate">{plan.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(plan.start_date)} – {formatDate(plan.end_date)}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{plan.status}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // ── Active plan — show weekly workout cards ────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground truncate">
            {activePlan.name}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDate(activePlan.start_date)} – {formatDate(activePlan.end_date)}
            {activePlan.weekly_hours > 0 && <span> · {activePlan.weekly_hours}h / week</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Link href="/coach">
            <Button variant="outline" size="sm">Adjust with Coach</Button>
          </Link>
        </div>
      </div>

      {/* Phase Indicator */}
      {phases && phases.length > 0 && (
        <Card className="mb-4" size="sm">
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Training Phases</p>
              {currentPhase && (
                <Badge
                  variant="secondary"
                  className={`text-[10px] ${getPhaseColors(currentPhase.name).bg} ${getPhaseColors(currentPhase.name).text} border-0`}
                >
                  {normalizePhaseLabel(currentPhase.name)} — Week {currentWeek}/{totalWeeks}
                </Badge>
              )}
            </div>
            <div className="flex h-6 w-full rounded-full overflow-hidden bg-muted gap-px">
              {phases.map((phase) => {
                const widthPct = (phase.weeks.length / totalWeeks) * 100;
                const colors = getPhaseColors(phase.name);
                const isActive = phase.weeks.includes(currentWeek);
                const label = normalizePhaseLabel(phase.name);
                const weekRange = phase.weeks.length > 1
                  ? `W${phase.weeks[0]}–${phase.weeks[phase.weeks.length - 1]}`
                  : `W${phase.weeks[0]}`;
                return (
                  <div
                    key={`${phase.name}-${phase.weeks[0]}`}
                    className={`${colors.bar} transition-opacity flex items-center justify-center overflow-hidden ${isActive ? "opacity-100" : "opacity-60"}`}
                    style={{ width: `${widthPct}%` }}
                    title={`${phase.name}: Weeks ${phase.weeks[0]}–${phase.weeks[phase.weeks.length - 1]}`}
                  >
                    <span className="text-[9px] font-medium text-white truncate px-1 drop-shadow-sm">
                      {label} {weekRange}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Coach Briefing */}
      {(weekBriefing || briefingLoading) && (
        <Card className="mb-4" size="sm">
          <CardContent>
            <div className="flex items-start gap-3">
              <span className="text-lg leading-none mt-0.5">🤖</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground mb-1">Coach's Week Preview</p>
                {briefingLoading ? (
                  <div className="space-y-1.5">
                    <div className="h-3 w-full rounded bg-muted/50 animate-pulse" />
                    <div className="h-3 w-4/5 rounded bg-muted/50 animate-pulse" />
                    <div className="h-3 w-3/5 rounded bg-muted/50 animate-pulse" />
                  </div>
                ) : (
                  <p className="text-sm text-foreground leading-relaxed">{weekBriefing}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Week / Month conditional view */}
      {viewMode === "week" ? (
        <>
          {/* Week Navigation */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="xs" onClick={() => setCurrentWeek((w) => Math.max(1, w - 1))} disabled={currentWeek <= 1}>
                ← Prev
              </Button>
              <Button variant="outline" size="xs" onClick={() => setCurrentWeek((w) => Math.min(totalWeeks, w + 1))} disabled={currentWeek >= totalWeeks}>
                Next →
              </Button>
              <Button variant="ghost" size="xs" onClick={jumpToToday}>Today</Button>
              <Button variant="outline" size="xs" onClick={enrichCurrentWeek} disabled={enriching}>
                {enriching ? "Generating & Syncing…" : "✨ Generate & Sync"}
              </Button>
            </div>
            <p className="text-sm font-medium text-foreground">Week {currentWeek} of {totalWeeks}</p>
          </div>

          {/* Weekly Calendar Grid */}
          <div className="grid grid-cols-7 gap-2 mb-6">
            {DAY_LABELS.map((label, dayIndex) => {
              const dayWorkouts = dayWorkoutsMap[dayIndex] ?? [];
              const isRestDay = dayWorkouts.length === 0;

              // Compute the actual calendar date for this column
              const weekStartDate = new Date(activePlan.start_date);
              weekStartDate.setDate(weekStartDate.getDate() + (currentWeek - 1) * 7 + dayIndex);
              const dayDate = weekStartDate.toLocaleDateString(undefined, { day: "numeric", month: "short" });
              const isColumnToday = weekStartDate.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);

              return (
                <div key={dayIndex} className="min-w-0">
                  <p className={`text-[10px] font-medium text-center mb-1.5 uppercase tracking-wider ${isColumnToday ? "text-primary" : "text-muted-foreground"}`}>
                    {label}
                  </p>
                  <p className={`text-[10px] text-center mb-1.5 ${isColumnToday ? "text-primary font-medium" : "text-muted-foreground"}`}>
                    {dayDate}
                  </p>
                  {isRestDay ? (
                    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 min-h-[120px] flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">Rest</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {dayWorkouts.map((workout) => {
                        const past = isDatePast(workout.scheduled_date);
                        const today = isDateToday(workout.scheduled_date);
                        const icon = DISCIPLINE_ICONS[workout.discipline] ?? "🏅";

                        return (
                          <button
                            key={workout.id}
                            onClick={() => setSelectedWorkout(workout)}
                            className={`w-full rounded-xl border p-2.5 text-left transition-colors min-h-[120px] flex flex-col gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              today
                                ? "border-primary/50 bg-primary/5"
                                : past
                                  ? "border-border bg-muted/30"
                                  : "border-border bg-card hover:bg-muted/30"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-lg leading-none">{icon}</span>
                              {past && <span className="text-xs text-emerald-500">✓</span>}
                              {today && <span className="text-[10px] font-medium text-primary">TODAY</span>}
                              {!past && !today && <span className="text-[10px] text-muted-foreground">○</span>}
                            </div>
                            <p className="text-[11px] font-medium text-foreground leading-tight line-clamp-2">
                              {workout.name}
                            </p>
                            <div className="flex items-center justify-between mt-auto">
                              <p className="text-[10px] text-muted-foreground">
                                {formatDuration(workout.estimated_duration_seconds)}
                                {workout.estimated_tss != null && (
                                  <span className="ml-1">· {Math.round(workout.estimated_tss)} TSS</span>
                                )}
                              </p>
                              {workout.garmin_workout_id && (
                                <span className="text-[10px] text-muted-foreground" title="Synced to Garmin">⌚</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mb-6">
          <MonthlyCalendar
            workouts={activePlan.workouts}
            races={goals}
            currentMonth={currentMonth}
            onMonthChange={setCurrentMonth}
            onWorkoutClick={setSelectedWorkout}
          />
        </div>
      )}

      {/* Races */}
      <RacesSection
        races={goals}
        onRacesChange={setGoals}
        onGeneratePlan={generatePlan}
        generatingPlan={generatingGoalId !== null}
        hasActivePlan={true}
      />

      {/* Workout Detail Modal */}
      <Dialog open={selectedWorkout !== null} onOpenChange={(open) => { if (!open) setSelectedWorkout(null); }}>
        {selectedWorkout && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                <span className="mr-2">{DISCIPLINE_ICONS[selectedWorkout.discipline] ?? "🏅"}</span>
                {selectedWorkout.name}
              </DialogTitle>
              <DialogDescription>
                {selectedWorkout.discipline.replace(/_/g, " ")}
                {selectedWorkout.content?.type && <span> · {selectedWorkout.content.type}</span>}
                {selectedWorkout.scheduled_date && (
                  <span> · {new Date(selectedWorkout.scheduled_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Duration</span>{" "}
                  <span className="font-medium">{formatDuration(selectedWorkout.estimated_duration_seconds)}</span>
                </div>
                {selectedWorkout.estimated_tss != null && (
                  <div>
                    <span className="text-muted-foreground">Est. TSS</span>{" "}
                    <span className="font-medium">{Math.round(selectedWorkout.estimated_tss)}</span>
                  </div>
                )}
                {selectedWorkout.content?.target_hr_zone && (
                  <div>
                    <span className="text-muted-foreground">Zone</span>{" "}
                    <span className="font-medium">{selectedWorkout.content.target_hr_zone}</span>
                  </div>
                )}
              </div>

              {selectedWorkout.content?.warmup && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Warmup</p>
                  <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    {typeof selectedWorkout.content.warmup === "string" ? (
                      <p>{selectedWorkout.content.warmup}</p>
                    ) : (
                      <>
                        {selectedWorkout.content.warmup.description && <p>{selectedWorkout.content.warmup.description}</p>}
                        {(selectedWorkout.content.warmup.duration_min || selectedWorkout.content.warmup.zone) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {selectedWorkout.content.warmup.duration_min && <span>{selectedWorkout.content.warmup.duration_min}min</span>}
                            {selectedWorkout.content.warmup.zone && <span> · {selectedWorkout.content.warmup.zone}</span>}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {(() => {
                const rawMain = selectedWorkout.content?.main;
                // Normalize: string → [{description: string}], object → [object], array of strings → [{description}], array of objects → as-is
                let mainSets: WorkoutSegment[] = [];
                if (Array.isArray(rawMain)) {
                  mainSets = rawMain.map((item) =>
                    typeof item === "string" ? { description: item } as WorkoutSegment : item as WorkoutSegment
                  );
                } else if (typeof rawMain === "string") {
                  mainSets = [{ description: rawMain } as WorkoutSegment];
                } else if (rawMain && typeof rawMain === "object") {
                  mainSets = [rawMain as WorkoutSegment];
                }
                return mainSets.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Main Set</p>
                  <div className="space-y-1.5">
                    {mainSets.map((seg, i) => (
                      <div key={i} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                        {seg.description && <p>{seg.description}</p>}
                        {(seg.duration_min || seg.zone || seg.repeats || seg.rest_min) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {seg.duration_min && <span>{seg.duration_min}min</span>}
                            {seg.zone && <span> · {seg.zone}</span>}
                            {seg.repeats && seg.repeats > 1 && <span> · {seg.repeats}× reps</span>}
                            {seg.rest_min && <span> · {seg.rest_min}min rest</span>}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                ) : null;
              })()}

              {selectedWorkout.content?.cooldown && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Cooldown</p>
                  <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    {typeof selectedWorkout.content.cooldown === "string" ? (
                      <p>{selectedWorkout.content.cooldown}</p>
                    ) : (
                      <>
                        {selectedWorkout.content.cooldown.description && <p>{selectedWorkout.content.cooldown.description}</p>}
                        {(selectedWorkout.content.cooldown.duration_min || selectedWorkout.content.cooldown.zone) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {selectedWorkout.content.cooldown.duration_min && <span>{selectedWorkout.content.cooldown.duration_min}min</span>}
                            {selectedWorkout.content.cooldown.zone && <span> · {selectedWorkout.content.cooldown.zone}</span>}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {(selectedWorkout.content?.notes || selectedWorkout.description) && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Coaching Notes</p>
                  <p className="text-sm text-foreground">{selectedWorkout.content?.notes ?? selectedWorkout.description}</p>
                </div>
              )}

            </div>

            <DialogFooter showCloseButton />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
