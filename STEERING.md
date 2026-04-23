# Personal Coach App — Steering Document

## Vision

A web application that serves as a unified training hub for endurance athletes. It connects to Garmin for device sync, provides intelligent route planning for running and cycling, and includes an AI coaching layer that interprets health and training data to guide what you do next.

**Design philosophy:** Build the features natively — inspired by what Strava and Training Peaks do well, but without requiring the user to have accounts on those platforms. We own the data and the UX. Use third-party APIs only where they provide free, additive value (e.g. Strava's public heatmap tiles for route popularity) and where we're not dependent on them for core functionality.

---

## Athlete Target

**Triathletes** training across swim / bike / run, who also incorporate **strength training** and **yoga/mobility** into their schedule. The app must understand that a hard leg-day affects the next day's run, that poor mobility work correlates with injury risk, and that recovery weeks should be planned across all disciplines together — not just endurance load.

---

## Core Pillars

1. **Device Integration** — Garmin as the primary data source and target for workout delivery
2. **Workout Builder** — Create structured workouts across all 6 disciplines; push to Garmin
3. **Route Planning** — Map-based route discovery for run, road cycling, and gravel
4. **AI Coach** — Proactive and conversational training guidance with full cross-discipline awareness

---

## Tech Stack

### Frontend
| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14+ (App Router) | SSR/SSG flexibility, great ecosystem |
| Language | TypeScript | Type safety across API contracts and UI |
| Styling | Tailwind CSS + shadcn/ui | Fast UI iteration, consistent design system |
| Maps | Mapbox GL JS | Route rendering, custom layers, surface-aware routing |
| Auth | NextAuth.js (credentials) | Simple session management; no OAuth needed |

### Backend
| Layer | Choice | Rationale |
|---|---|---|
| Framework | FastAPI (Python) | Async, fast, great for data-heavy endpoints; excellent typing |
| Language | Python 3.11+ | Best ecosystem for Garmin scraping, data processing, AI |
| Garmin | `garminconnect` library | Unofficial Python client; handles MFA, session reuse, all endpoints |
| Database | PostgreSQL | Relational, good for time-series workout data |
| ORM | SQLAlchemy + Alembic | Mature Python ORM with migration support |
| AI | OpenAI Python SDK (`openai`) | ChatGPT/OpenAI models for conversational coaching |
| Background jobs | Celery + Redis (or ARQ) | Async Garmin sync, post-workout AI analysis |
| Sync scheduler | APScheduler or Celery Beat | Periodic Garmin data pulls |

### Communication
- Next.js calls Python backend via REST (JSON)
- Backend exposes versioned API: `/api/v1/...`
- Auth session token issued by FastAPI, stored as httpOnly cookie, validated by Next.js middleware

---

## Integrations

### Garmin
- **`garminconnect` Python library** (unofficial, username/password) — no developer account required, suitable for personal use
- Login flow: user provides Garmin credentials once; backend stores an encrypted session token and refreshes it automatically
- **Reads:** activity history, health metrics (HRV, sleep, stress, body battery, resting HR), device list, personal records
- **Writes:** structured workouts (via Garmin Connect workout format), GPX/course upload to device
- **Caveats:** unofficial API — Garmin could change it; no SLA; suitable for pet project, not production at scale

### Strava — Free Public APIs Only (no user OAuth required)
- **Global Heatmap tiles** — publicly accessible tile layer showing route popularity; overlay on Mapbox as a visual aid for route discovery. No user account or auth needed.
- **Segment data** — Strava's public segment API is free but requires app registration (not user login). Can be used to surface popular segments along a route as contextual info.
- We do **not** sync user data from Strava, push activities to it, or require users to connect a Strava account.

### Training Peaks — No integration
- We build equivalent functionality natively: structured workouts, ATL/CTL/TSB, workout formats
- Support `.fit` file import/export for interoperability if user wants to move data manually

### Route Data Sources
- **GraphHopper Routing API** — primary route generation engine; free tier, no user OAuth; native `round_trip` algorithm generates loops given only a start point + target distance; sport profiles: `foot` (running), `bike` (road cycling), `mtb` (gravel); returns GeoJSON with elevation baked in
- **Mapbox GL JS** — map rendering only (display GraphHopper routes, activity polylines, pins); Mapbox is the visual layer, GraphHopper is the routing brain
- **Strava Global Heatmap** (public tile layer, no auth) — optional popularity overlay; TOS ambiguous, treat as nice-to-have not core

**Why not Komoot:** No public API — partner agreement required.  
**Why not Strava Routes:** Requires user OAuth + paid Strava subscription to generate routes. Not viable.

---

## Feature Breakdown

### 1. Dashboard
- Today's training status (Garmin Body Battery, HRV, sleep score)
- Upcoming planned workouts
- Recent activity feed
- Weekly load summary (TSS or zone time)
- AI coach daily message / suggestion

### 2. Activity Feed
- Full history of all Garmin activities
- Filter by sport, date range, distance, duration
- Activity detail view: map, laps, HR zones, power (cycling), pace zones (running)
- Compare activities over time

### 3. Workout Builder
Two distinct builder modes depending on discipline:

**Endurance builder** (swim / run / road cycling / gravel cycling):
- Step types: warm-up, interval, recovery, cool-down, repeat block
- Targets: HR zone, pace zone, power zone, RPE
- Sport profiles:
  - **Swimming**: distance/time intervals, stroke type (freestyle/back/breast/fly), rest intervals
  - **Running**: pace targets, HR zones, distance/time steps
  - **Cycling (Road)**: power zones (if power meter), HR zones, cadence targets
  - **Cycling (Gravel)**: same as road but separate profile; surface/terrain notes
- Push directly to Garmin device via Garmin Workout API
- Export to `.fit` / `.zwo` for interoperability

**Strength builder**:
- Exercise library (curated list + custom exercises): name, muscle group(s), equipment
- Step types: sets × reps, sets × time (for planks etc.), superset, circuit, AMRAP, EMOM
- Targets: weight (kg/lb), RPE, rest duration between sets
- No GPS, no pace — load-based metrics only
- Push to Garmin as strength workout (Garmin supports this via workout API)

**Yoga / Mobility builder**:
- Sequence of poses/exercises with hold duration (time-based only)
- Categories: yoga flow, static stretching, dynamic warm-up, foam rolling, cool-down
- No intensity targets — duration and sequence only
- Logged as completed manually or synced from Garmin yoga activity

All builder types:
- Save as reusable template
- AI coach can generate and pre-fill any workout type

### 4. Route Planner
Map-based route creation:
- Set start point (or use current location)
- Set end point or use loop/out-and-back mode
- Set target distance
- Sport mode selection:
  - **Running**: prefers parks, paths, low-traffic streets; avoids highways
  - **Road Cycling**: prefers smooth roads, bike lanes, avoids unpaved
  - **Gravel Cycling**: prefers gravel paths, fire roads, mixed surfaces
- API returns 2–3 route options ranked by: elevation profile, surface type, popularity
- Route details: distance, elevation gain/loss, estimated time, surface breakdown
- Export route as `.gpx` and push to Garmin device
- Save routes to library

### 5. AI Coach

The central intelligence layer. Uses OpenAI models to maintain context across sessions.

**Context the coach has access to:**
- Last 90 days of activity history across **all 6 disciplines**: swim, run, road cycling, gravel cycling, strength, yoga/mobility — with discipline-appropriate metrics
- Daily health snapshots (HRV, sleep score, resting HR, body battery, stress)
- Strength training load: weekly sets volume per muscle group, intensity (weight × reps)
- Mobility frequency: days/week with yoga or stretching, session duration
- User-defined goals (target event, date, weekly volume target per discipline)
- Athlete profile (FTP, threshold pace, swim CSS, max HR, 1RMs for key lifts)

**Cross-discipline awareness — examples of what the coach understands:**
- A heavy squat session the day before a long run increases injury risk → suggest easy run or swap order
- Two weeks of skipped mobility work + high run mileage → flag tightness/injury risk
- Low HRV + high stress this week → reduce intensity across all disciplines, not just cardio
- Race week for a triathlon → taper swim/bike/run, skip strength, keep one short yoga session

**Proactive suggestions:**
- Post-workout analysis for any discipline
- Weekly load balance across all 6 disciplines
- Mobility deficit alerts ("You've had 0 yoga/stretching sessions in 10 days with high run volume")
- Pre-race taper planning across the full training week
- Readiness scores based on Garmin health data

**Conversational interface:**
- "What should I do tomorrow?" — considers all training from the past week
- "I want to do a threshold run Thursday and a long ride Sunday — what about the rest of the week?"
- "I'm targeting a 70.3 in September — build me a plan"
- "My legs are really sore — what can I do today?" — might suggest yoga or upper-body strength
- Coach responds with structured suggestions; can generate and pre-fill any workout type

**Implementation notes:**
- System instructions include athlete profile + rolling 90-day data
- Each message includes last 7 days of data as fresh context
- Coach can generate structured workouts and push them to the Workout Builder
- Conversation history persisted in DB per user

---

## Data Models (High Level)

```
User
  - id, email, name
  - garminUserId, garminAccessToken
  - athleteProfile (FTP, threshold pace, CSS, maxHR, weight, key 1RMs)
  - goals[]

Activity
  - id, userId
  - garminActivityId
  - discipline: SWIM | RUN | RIDE_ROAD | RIDE_GRAVEL | STRENGTH | YOGA | MOBILITY | OTHER
  - startTime, duration

  -- Endurance fields (null for strength/yoga) --
  - distance, elevationGain
  - avgHR, maxHR, avgPower, normalizedPower, avgPace, avgCadence
  - tss, intensityFactor
  - polyline, laps, hrZones

  -- Strength fields (null for endurance/yoga) --
  - exercises (JSON): [{ name, muscleGroups[], sets: [{ reps, weight_kg, duration_sec, rpe }] }]
  - totalSets, totalReps, totalVolume_kg  ← computed and stored for coach queries
  - primaryMuscleGroups[]

  -- Yoga/Mobility fields (null for others) --
  - sessionType: YOGA_FLOW | STATIC_STRETCH | DYNAMIC_WARMUP | FOAM_ROLLING | COOLDOWN | MIXED
  - avgHR  ← optional, some yoga has HR data

  - calories
  - notes
  - rawSummary (JSON)

DailyHealth
  - userId, date
  - hrvStatus, restingHR, sleepScore, bodyBattery, stressScore
  - sleepDuration, deepSleepDuration, remSleep, lightSleep
  - steps

AthleteProfile
  - userId
  - ftp_watts, threshold_pace_sec_per_km, swim_css_sec_per_100m, max_hr, resting_hr, weight_kg
  - squat_1rm_kg, deadlift_1rm_kg, bench_1rm_kg  ← for strength load calculation

Workout (planned/template)
  - id, userId
  - name, discipline, description
  - builderType: ENDURANCE | STRENGTH | YOGA
  - steps (JSON — endurance steps OR strength exercises OR yoga sequence)
  - estimatedDuration, estimatedTSS (endurance) / estimatedVolume (strength)
  - garminWorkoutId (after push)

Route
  - id, userId
  - name, sport: RUN | RIDE_ROAD | RIDE_GRAVEL
  - startLat, startLng, endLat, endLng, isLoop
  - distance, elevationGain, geojson, gpxData

CoachConversation
  - id, userId
  - messages (JSON array)
  - createdAt, updatedAt
```

---

## Phases

### Phase 1 — Foundation (MVP)
- [ ] Repo structure: Next.js frontend + FastAPI backend as a monorepo
- [ ] App auth: simple username/password login (NextAuth credentials → FastAPI session)
- [ ] Garmin connection: user enters Garmin credentials → backend stores encrypted session via `garminconnect`
- [ ] Garmin sync: pull activities and daily health data into PostgreSQL
- [ ] Dashboard with activity feed and daily health summary
- [ ] Basic workout builder (running + cycling) with Garmin push
- [ ] Route planner: running routes with Mapbox

### Phase 2 — Full Feature Set
- [ ] Swimming workout builder
- [ ] Gravel cycling route mode
- [ ] AI Coach: conversational interface + proactive suggestions
- [ ] GPX export and Garmin device push for routes
- [ ] Workout templates library

### Phase 3 — Intelligence & Polish
- [ ] ATL/CTL/TSB fitness tracking (built natively, Training Peaks-style)
- [ ] AI-generated training plans (multi-week)
- [ ] `.fit` / `.zwo` import for data migration
- [ ] Mobile-responsive PWA

---

## Open Questions

1. **Garmin session handling** — `garminconnect` handles MFA. If the user has 2FA enabled on Garmin, the library prompts for a one-time code on first login. After that, sessions are reused via token. Need to handle token expiry gracefully.
2. **Workout write support** — `garminconnect` has read coverage for everything; write support (pushing workouts to Connect) is more limited and may require direct HTTP calls mirroring the Connect web app. Needs a spike to confirm what's achievable.
3. **GraphHopper free tier limits** — free tier is generous for personal use but worth monitoring. If rate limits become an issue, self-hosting GraphHopper on a cheap VPS is an option (it's open source).
4. **AI coach data volume** — 90 days of daily health + activities is ~180 records. OpenAI model context is sufficient for this, but prompts still need to stay compact to control latency and cost.
5. **Strava heatmap tiles TOS** — nice-to-have visual overlay; TOS is ambiguous for non-Strava apps. Confirm before shipping, or skip entirely since it's not core routing functionality.
