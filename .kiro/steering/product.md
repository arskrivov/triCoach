# Product

Personal Coach is a training hub for triathletes. It connects to Garmin for device sync, provides intelligent route planning for running and cycling, and includes an AI coaching layer that interprets health and training data to guide daily training decisions.

## Core pillars

- **Garmin integration** — primary data source for activities, health metrics (HRV, sleep, body battery, stress), and workout delivery
- **Dashboard** — daily coach briefing at the top, followed by recovery and activity overview panels, then a timeline of recent and upcoming workouts
- **Activity feed** — full Garmin activity history with detail views (map, laps, HR zones, power/pace)
- **Workout builder** — structured workouts across 6 disciplines (swim, run, road cycling, gravel cycling, strength, yoga/mobility); push to Garmin
- **Route planner** — map-based route generation via GraphHopper; Mapbox for rendering
- **AI coach** — conversational and proactive guidance using OpenAI; cross-discipline awareness (e.g. heavy leg day affects next run)

## Target user

Triathletes training across swim / bike / run who also do strength and mobility work. The app must understand cross-discipline load — a hard squat session affects the next day's run; skipped mobility correlates with injury risk.

## Design philosophy

Build features natively rather than depending on Strava or Training Peaks. Own the data and UX. Use third-party APIs only where they add free, additive value and are not required for core functionality.

## AI briefing rules

- Generated at most once per user per calendar day, only after 06:00 local time
- Three-section output: `sleep_analysis`, `activity_analysis`, `recommendations[]`, optional `caution`
- Tone: expert performance coach — specific, evidence-based, no generic wellness filler
- Falls back to a heuristic briefing when OpenAI is unavailable
