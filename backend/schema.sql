-- Personal Coach App — Supabase Schema
-- Last synced from live DB: 2026-06-26
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query → Run

create extension if not exists "pgcrypto";

-- ── Users ─────────────────────────────────────────────────────────────────────
create table if not exists users (
  id                      uuid primary key default gen_random_uuid(),
  email                   text unique not null,
  hashed_password         text,
  name                    text,
  garmin_email            text,
  garmin_session_data     text,   -- Fernet-encrypted JSON, stored as base64 text
  garmin_connected_at     timestamptz,
  garmin_last_sync_at     timestamptz,
  created_at              timestamptz default now()
);

-- ── Activities ────────────────────────────────────────────────────────────────
create table if not exists activities (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references users(id) on delete cascade not null,
  garmin_activity_id      bigint unique,
  garmin_type_key         text,
  garmin_event_type       text,
  discipline              text not null,
  name                    text,
  start_time              timestamptz not null,
  duration_seconds        int,
  calories                int,
  ai_analysis             text,
  ai_analyzed_at          timestamptz,

  -- Endurance
  distance_meters         float,
  elevation_gain_meters   float,
  avg_hr                  int,
  max_hr                  int,
  avg_power_watts         int,
  normalized_power_watts  int,
  avg_pace_sec_per_km     float,
  avg_cadence             int,
  tss                     float,
  intensity_factor        float,
  polyline                text,
  laps                    jsonb,
  hr_zones                jsonb,

  -- Strength
  exercises               jsonb,
  total_sets              int,
  total_volume_kg         float,
  primary_muscle_groups   text[],

  -- Yoga / Mobility
  session_type            text,

  -- Training effect (aerobic/anaerobic, 0–5 scale)
  aerobic_training_effect   float,
  anaerobic_training_effect float,
  training_effect_label     text,

  notes                   text,
  synced_at               timestamptz default now()
);

create index if not exists idx_activities_user_id    on activities(user_id);
create index if not exists idx_activities_start_time on activities(start_time desc);
create index if not exists idx_activities_discipline on activities(discipline);

-- ── Activity Files (Garmin exports: GPX / TCX / ORIGINAL zip) ───────────────
create table if not exists activity_files (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id) on delete cascade not null,
  activity_id       uuid references activities(id) on delete cascade,
  garmin_activity_id bigint not null,
  file_format       text not null,
  content_type      text not null,
  content_encoding  text not null,
  file_data         text not null,
  file_size_bytes   int,
  source_filename   text,
  created_at        timestamptz default now(),
  synced_at         timestamptz default now(),
  unique(user_id, garmin_activity_id, file_format)
);

create index if not exists idx_activity_files_user_id    on activity_files(user_id);
create index if not exists idx_activity_files_activity_id on activity_files(activity_id);
create index if not exists idx_activity_files_garmin_id  on activity_files(garmin_activity_id);

-- ── Daily Health ──────────────────────────────────────────────────────────────
create table if not exists daily_health (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references users(id) on delete cascade not null,
  date                    date not null,
  resting_hr              int,
  hrv_status              text,
  hrv_last_night          float,
  stress_avg              int,
  sleep_score             int,
  sleep_duration_seconds  int,
  deep_sleep_seconds      int,
  rem_sleep_seconds       int,
  light_sleep_seconds     int,
  steps                   int,
  daily_calories          int,
  respiration_avg         float,
  spo2_avg                float,
  morning_readiness_score int,
  body_battery_high       int,
  body_battery_low        int,
  synced_at               timestamptz default now(),
  unique(user_id, date)
);

create index if not exists idx_daily_health_user_date on daily_health(user_id, date desc);

-- ── Daily Briefings ───────────────────────────────────────────────────────────
create table if not exists daily_briefings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users(id) on delete cascade not null,
  briefing_date   date not null,
  data_signature  text not null,
  timezone        text,
  briefing        jsonb not null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique(user_id, briefing_date)
);

create index if not exists idx_daily_briefings_user_date on daily_briefings(user_id, briefing_date desc);

-- ── Athlete Profile ───────────────────────────────────────────────────────────
create table if not exists athlete_profile (
  id                                  uuid primary key default gen_random_uuid(),
  user_id                             uuid references users(id) on delete cascade unique not null,
  ftp_watts                           int,
  threshold_pace_sec_per_km           float,
  swim_css_sec_per_100m               float,
  max_hr                              int,
  resting_hr                          int,
  weight_kg                           float,
  squat_1rm_kg                        float,
  deadlift_1rm_kg                     float,
  bench_1rm_kg                        float,
  overhead_press_1rm_kg               float,
  mobility_sessions_per_week_target   int default 2,
  weekly_training_hours               float default 8,
  notes                               text,
  updated_at                          timestamptz default now()
);

-- ── Goals ─────────────────────────────────────────────────────────────────────
create table if not exists goals (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references users(id) on delete cascade not null,
  description         text not null,
  target_date         date,
  sport               text,
  weekly_volume_km    float,
  is_active           boolean default true,
  race_type           text,              -- marathon, ironman_70_3, ironman, olympic_tri, half_marathon, 10k, century_ride, custom
  weekly_hours_budget float,             -- max training hours per week
  priority            int default 1,     -- 1=primary, 2=secondary
  created_at          timestamptz default now()
);

create index if not exists idx_goals_user_id on goals(user_id);

-- ── Coach Conversations ───────────────────────────────────────────────────────
create table if not exists coach_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade unique not null,
  messages    jsonb not null default '[]',
  updated_at  timestamptz default now()
);

-- ── Training Plans ────────────────────────────────────────────────────────────
create table if not exists training_plans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users(id) on delete cascade not null,
  goal_id         uuid references goals(id) on delete set null,
  name            text not null,
  status          text not null default 'active',  -- active, completed, archived
  race_date       date,
  start_date      date not null,
  end_date        date not null,
  weekly_hours    float not null,
  plan_structure  jsonb not null default '{}',      -- periodization phases, weekly TSS targets
  adjustments     jsonb not null default '[]',      -- history of AI adjustments
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_training_plans_user_id on training_plans(user_id);

-- ── Plan Week Briefings (cached AI coach weekly previews) ─────────────────────
create table if not exists plan_week_briefings (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid references training_plans(id) on delete cascade not null,
  user_id         uuid references users(id) on delete cascade not null,
  week_number     int not null,
  data_signature  text not null,
  briefing        text not null,
  created_at      timestamptz default now(),
  unique(plan_id, week_number)
);

create index if not exists idx_plan_week_briefings_plan_week on plan_week_briefings(plan_id, week_number);

-- ── Workouts ──────────────────────────────────────────────────────────────────
create table if not exists workouts (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid references users(id) on delete cascade not null,
  name                        text not null,
  discipline                  text not null,
  builder_type                text not null,
  description                 text,
  content                     jsonb not null default '{}',
  estimated_duration_seconds  int,
  estimated_tss               float,
  estimated_volume_kg         float,
  garmin_workout_id           bigint,
  is_template                 boolean default false,
  scheduled_date              date,
  plan_id                     uuid references training_plans(id) on delete set null,
  plan_week                   int,           -- week number within the plan
  plan_day                    int,           -- 0=Monday through 6=Sunday
  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now()
);

create index if not exists idx_workouts_user_id on workouts(user_id);
create index if not exists idx_workouts_plan_id on workouts(plan_id);

-- ── Row Level Security (disable for service_role key — backend uses it) ───────
-- RLS is bypassed automatically when connecting with the service_role key.
-- Enable RLS on tables if you later add client-side access via anon key.
