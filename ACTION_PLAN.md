# Dashboard Action Plan

## Phase 0 — SQL to run in Supabase SQL Editor FIRST

```sql
-- 1. Remove raw-blob columns (safe if already gone)
ALTER TABLE activities   DROP COLUMN IF EXISTS raw_summary;
ALTER TABLE daily_health DROP COLUMN IF EXISTS raw_data;

-- 2. Add new structured columns to daily_health
ALTER TABLE daily_health ADD COLUMN IF NOT EXISTS daily_calories          int;
ALTER TABLE daily_health ADD COLUMN IF NOT EXISTS respiration_avg         float;
ALTER TABLE daily_health ADD COLUMN IF NOT EXISTS spo2_avg                float;
ALTER TABLE daily_health ADD COLUMN IF NOT EXISTS morning_readiness_score int;

-- 3. Make hashed_password nullable (Supabase Auth manages auth now)
ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL;

-- 4. Trigger: auto-create public.users row on Supabase Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'name')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## Phase 1 — Backend: Schema alignment & new fields

- **B1** `garmin_sync.py` — Remove `row["raw_summary"] = {...}` block from `sync_activities`
- **B2** `garmin_sync.py` — Remove `raw_data` dict and `row["raw_data"] = raw_data` from `sync_daily_health`
- **B3** `garmin_sync.py` — Extract 4 new metrics in `sync_daily_health`:
  - `get_respiration_data()` → `data.get("avgSleepRespirationValue")` → `row["respiration_avg"]`
  - `get_spo2_data()` → `data.get("averageSpO2")` → `row["spo2_avg"]`
  - `get_morning_training_readiness()` → `(data[0] if list else data).get("score")` → `row["morning_readiness_score"]`
  - `get_stats()` → `stats.get("totalKilocalories")` → `row["daily_calories"]`
- **B4** `models.py` — Add 4 new fields to `DailyHealthRow`: `daily_calories`, `respiration_avg`, `spo2_avg`, `morning_readiness_score`
- **B5** `services/dashboard.py` — Update `_extract_health_value()` to read from direct columns instead of `raw_data`:
  - `respiration_sleep` → `row.respiration_avg`
  - `pulse_ox_avg` → `row.spo2_avg`
  - `morning_training_readiness_score` → `row.morning_readiness_score`

---

## Phase 2 — Backend: Smart sync (from last sync date)

- **B6** `routers/sync.py` — When `days_back` not provided, compute from `user.garmin_last_sync_at` → `max(1, days_since_last_sync + 1)`, cap 365
- Expose `last_sync_at` in dashboard overview response
- Update `/sync/quick` same way (fallback 7 days if no prior sync)

---

## Phase 3 — Backend: AI briefing with 3 agents

- **B7** `services/dashboard.py` — Restructure `_generate_ai_briefing()` into 3 sections via 1 structured OpenAI call:
  - Input: last 7 nights health metrics + last 14d activity summary (structured, no raw blobs) + CTL/ATL/TSB + goals
  - Output JSON: `sleep_analysis`, `activity_analysis`, `recommendations[]`, `caution?`
  - System prompt: "Professional triathlon coach + sleep scientist. Be specific. Reference actual numbers."
- **B8** `routers/sync.py` — After sync with new data, delete today's `daily_briefings` row to force regeneration on next dashboard load

---

## Phase 4 — Frontend: Dashboard UI overhaul

- **F1** `dashboard-content.tsx` — Sync button: show "Last synced: Xh ago", no explicit `days_back` (backend computes), persistent banner while syncing
- **F2** `recovery-overview-card.tsx` — Replace duplicate metric grid with 7-day sparkline chart (sleep score, HRV, resting HR)
- **F3** `activity-overview-card.tsx` — Add STRENGTH + MOBILITY rows; show `{distance} km · {sessions}` for endurance, `{duration} · {sessions}` for strength/mobility; week-over-week delta badge
- **F4** `fitness-chart.tsx` — Add TSB zone bands (Fresh/Form/Training/Fatigued), ReferenceLine at y=0, current values legend
- **F5** `coach-briefing-card.tsx` — 3-section layout (Sleep & Recovery / Training Load / Today's Plan) with distinct visual panels
- **F6** `lib/format.ts` — Add `formatSteps`, `formatCalories`, fix `formatDistance` thresholds, `formatHRV`, `formatSleepScore` with color coding
- **F7** Full visual redesign:
  - Color system: slate bg, white cards, emerald/amber/rose for status, indigo accent
  - Layout: briefing full-width → [recovery 5/12 | activity 7/12] → chart → [activities 8/12 | workouts 4/12]
  - Responsive: single-col mobile, 2-col tablet, full layout ≥ 1280px
  - Metric display: colored left-border pill, large value, trend badge, 7d avg muted below
  - Numbers: no unnecessary decimals, `text-2xl font-bold` values, `text-xs uppercase tracking-wide` labels

---

## Execution Order

1. ✅ Run Phase 0 SQL in Supabase  ← **user must do this in Supabase SQL Editor**
2. ✅ B1–B5 complete — garmin_sync removes raw blobs, stores 4 new columns; models + dashboard updated
3. ✅ B6 — smart sync: days_back auto-computed from garmin_last_sync_at (fallback 90d for /now, 7d for /quick)
4. ✅ B7 — AI briefing restructured: 3-section output (sleep_analysis, activity_analysis, recommendations, caution); richer prompt with 7-night health detail, 14d activity summary, CTL/ATL/TSB, goals; parallel DB fetches
5. ✅ B8 — today's daily_briefing deleted after sync with new data (forces AI regeneration on next load)
6. ✅ F1–F7 complete — full dashboard UI overhaul
