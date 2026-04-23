export type Discipline =
  | "SWIM"
  | "RUN"
  | "RIDE_ROAD"
  | "RIDE_GRAVEL"
  | "STRENGTH"
  | "YOGA"
  | "MOBILITY"
  | "OTHER";

export interface ActivitySummary {
  id: string;
  garmin_activity_id: number | null;
  discipline: Discipline;
  name: string | null;
  start_time: string;
  duration_seconds: number | null;
  calories: number | null;
  distance_meters: number | null;
  elevation_gain_meters: number | null;
  avg_hr: number | null;
  avg_pace_sec_per_km: number | null;
  avg_power_watts: number | null;
  tss: number | null;
  total_sets: number | null;
  session_type: string | null;
}

export interface ActivityDetail extends ActivitySummary {
  polyline: string | null;
  laps: unknown;
  hr_zones: unknown;
  exercises: ExerciseRecord[] | null;
  ai_analysis: string | null;
}

export interface ExerciseRecord {
  name: string;
  muscle_groups: string[];
  sets: ExerciseSet[];
}

export interface ExerciseSet {
  reps?: number;
  weight_kg?: number;
  duration_sec?: number;
  rpe?: number;
}

export interface DailyHealth {
  id: string;
  date: string;
  resting_hr: number | null;
  hrv_status: "POOR" | "BALANCED" | "GOOD" | "NO_DATA" | null;
  hrv_last_night: number | null;
  body_battery_high: number | null;
  body_battery_low: number | null;
  stress_avg: number | null;
  sleep_score: number | null;
  sleep_duration_seconds: number | null;
  deep_sleep_seconds: number | null;
  rem_sleep_seconds: number | null;
  light_sleep_seconds: number | null;
  steps: number | null;
}

export interface RecoveryMetricTrend {
  key: string;
  label: string;
  unit: string;
  current: number | null;
  avg_7d: number | null;
  avg_30d: number | null;
  direction_vs_7d: "up" | "down" | "stable" | "unknown";
  direction_vs_30d: "up" | "down" | "stable" | "unknown";
}

export interface RecoveryLastNight {
  date: string | null;
  sleep_score: number | null;
  sleep_duration_hours: number | null;
  hrv_last_night: number | null;
  resting_hr: number | null;
  respiration_sleep: number | null;
  stress_avg: number | null;
  pulse_ox_avg: number | null;
  morning_training_readiness_score: number | null;
}

export interface RecoveryOverview {
  status: "strong" | "strained" | "steady";
  headline: string;
  last_night: RecoveryLastNight;
  metrics: RecoveryMetricTrend[];
}

export interface DisciplineSummary {
  sessions: number;
  distance_km: number;
  duration_hours: number;
}

export interface ActivityWindowSummary {
  sessions: number;
  distance_km: number;
  duration_hours: number;
  tss: number;
  by_discipline: {
    swim: DisciplineSummary;
    bike: DisciplineSummary;
    run: DisciplineSummary;
    strength: DisciplineSummary;
    mobility: DisciplineSummary;
  };
}

export interface PlannedWorkout {
  id: string;
  name: string;
  discipline: Discipline;
  scheduled_date: string;
  estimated_duration_seconds: number | null;
  estimated_tss: number | null;
  description: string | null;
}

export interface PlannedSummary {
  upcoming_count: number;
  next_workout: PlannedWorkout | null;
  completion_rate_this_week: number | null;
}

export interface FitnessPoint {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  daily_tss: number;
}

export interface ActivityOverview {
  status: "idle" | "overreaching" | "building" | "lighter" | "steady";
  headline: string;
  movement: {
    steps_avg_7d: number | null;
    daily_calories_avg_7d: number | null;
  };
  last_7d: ActivityWindowSummary;
  previous_7d: ActivityWindowSummary;
  last_30d: {
    sessions: number;
    distance_km: number;
    duration_hours: number;
    discipline_breakdown: Record<string, number>;
  };
  fitness: {
    ctl: number | null;
    atl: number | null;
    tsb: number | null;
    direction: "unknown" | "fatigued" | "training" | "fresh" | "balanced";
  };
  planned: PlannedSummary;
}

export interface HealthSparklinePoint {
  date: string;
  sleep_score: number | null;
  hrv: number | null;
  resting_hr: number | null;
}

export interface DashboardBriefing {
  source: "ai" | "heuristic";
  generated_for_date: string;
  generated_at: string;
  ai_enabled: boolean;
  sleep_analysis: string;
  activity_analysis: string;
  recommendations: string[];
  caution: string | null;
}

export interface DashboardOverview {
  generated_at: string;
  timezone: string;
  last_sync_at: string | null;
  recovery: RecoveryOverview & { sparkline: HealthSparklinePoint[] };
  activity: ActivityOverview;
  briefing: DashboardBriefing | null;
  recent_activities: ActivitySummary[];
  upcoming_workouts: PlannedWorkout[];
  fitness_timeline: FitnessPoint[];
}

export interface AthleteProfile {
  ftp_watts: number | null;
  threshold_pace_sec_per_km: number | null;
  swim_css_sec_per_100m: number | null;
  max_hr: number | null;
  resting_hr: number | null;
  weight_kg: number | null;
  squat_1rm_kg: number | null;
  deadlift_1rm_kg: number | null;
  bench_1rm_kg: number | null;
  overhead_press_1rm_kg: number | null;
  mobility_sessions_per_week_target: number;
}
