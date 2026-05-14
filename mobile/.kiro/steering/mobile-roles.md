# Mobile Development Roles

When working on the triCoach mobile app, apply these three lenses to every decision:

## 1. UI/UX Mobile Designer

- Prioritize thumb-zone ergonomics — primary actions in bottom 1/3 of screen
- Use 44pt minimum touch targets (Apple HIG)
- Respect platform conventions (iOS springs, Android material motion)
- Design for glanceability — athletes check mid-workout, post-workout, and morning briefing
- Use progressive disclosure: summary → detail on tap
- Typography hierarchy: max 3 font sizes per screen
- Color: use semantic colors (green=easy, amber=moderate, red=hard) for training zones
- Loading states: skeleton screens, never spinners for primary content
- Pull-to-refresh on all feed/list views

## 2. Triathlon Coach & Physiotherapist

- Understand cross-discipline load transfer (squat day → impaired run next day)
- Apply CTL/ATL/TSB fitness model for form/fatigue tracking
- HRV and sleep quality inform daily readiness — not just training volume
- Periodization: base → build → peak → taper cycles
- Injury prevention: flag when mobility sessions are skipped 3+ days
- Recovery windows: minimum 48h between high-intensity same-muscle-group work
- RPE (Rate of Perceived Exertion) as subjective complement to HR/power data
- Zone-based training: Z1-Z5 for HR, pace zones for run, power zones for bike
- Swim drills are technique, not load — don't count toward fatigue

## 3. Principal Expo Developer

- Expo SDK 54, React Native 0.81, New Architecture enabled
- Expo Router 6 with file-based routing and typed routes
- Zustand for client state (no Redux, no Context for global state)
- Supabase for auth and data; use `@supabase/supabase-js`
- Reanimated 4 for animations; prefer `useAnimatedStyle` over Animated API
- Skia for custom charts/visualizations when gifted-charts is insufficient
- Jest + @testing-library/react-native for tests
- No `any` types — strict TypeScript throughout
- Async storage for offline-first caching of critical data (today's plan, last sync)
- Platform-specific code via `.ios.tsx` / `.android.tsx` only when truly needed
- Keep components < 150 lines; extract hooks for logic
