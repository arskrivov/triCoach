# Implementation Plan: Premium Dark UI Redesign

## Overview

Transform the TriCoach web app from a light-mode zinc/white aesthetic into a dark-mode-first premium design. The approach is layered: redefine CSS custom properties first, then update the app shell, then update all page components, charts, and maps. All changes are purely visual — no functionality, data model, or backend changes.

## Tasks

- [x] 1. Dark Theme Foundation — globals.css Token System
  - [x] 1.1 Update `.dark` base surface tokens in `frontend/app/globals.css`: set `--background` to `oklch(0.13 0.008 270)`, `--card` to `oklch(0.18 0.01 270)`, `--popover` to `oklch(0.20 0.012 270)`, `--muted` to `oklch(0.22 0.01 270)`, `--secondary` to `oklch(0.24 0.012 270)` to create cool-tinted near-black surfaces with progressive elevation
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Update `.dark` accent and interactive tokens: set `--primary` to `oklch(0.55 0.2 270)`, `--primary-foreground` to `oklch(0.98 0 0)`, `--accent` to `oklch(0.25 0.03 270)`, `--accent-foreground` to `oklch(0.95 0 0)`, `--ring` to `oklch(0.55 0.2 270)` for cool violet accent
    - _Requirements: 1.3, 10.7_

  - [x] 1.3 Update `.dark` foreground text tier tokens: set `--foreground` to `oklch(0.95 0.005 270)`, `--muted-foreground` to `oklch(0.60 0.01 270)`, `--card-foreground` to `oklch(0.95 0.005 270)`, `--popover-foreground` to `oklch(0.95 0.005 270)`, `--secondary-foreground` to `oklch(0.95 0.005 270)`
    - _Requirements: 1.4_

  - [x] 1.4 Update `.dark` border and input tokens: set `--border` to `oklch(1 0 0 / 8%)`, `--input` to `oklch(1 0 0 / 10%)` for subtle white borders
    - _Requirements: 1.1, 3.1_

  - [x] 1.5 Add new semantic status tokens to `.dark` selector and register them in `@theme inline`: `--status-positive` as `oklch(0.75 0.15 180)` (cyan/teal), `--status-caution` as `oklch(0.78 0.15 85)` (amber/gold), `--status-negative` as `oklch(0.72 0.18 335)` (magenta/rose)
    - _Requirements: 2.1, 2.2_

  - [x] 1.6 Update `.dark` chart color tokens: `--chart-1` to `oklch(0.70 0.15 265)` (indigo/blue), `--chart-2` to `oklch(0.75 0.15 180)` (cyan/teal), `--chart-3` to `oklch(0.78 0.15 85)` (amber), `--chart-4` to `oklch(0.72 0.18 335)` (magenta), `--chart-5` to `oklch(0.65 0.12 300)` (purple)
    - _Requirements: 2.7_

  - [x] 1.7 Add `.dark` gradient accent token: `--gradient-accent: linear-gradient(135deg, oklch(0.55 0.2 270), oklch(0.60 0.18 250))` and register in `@theme inline`
    - _Requirements: 10.1_

  - [x] 1.8 Update `.dark` sidebar tokens: `--sidebar` to `oklch(0.15 0.008 270)`, `--sidebar-foreground` to `oklch(0.95 0.005 270)`, `--sidebar-primary` to `oklch(0.55 0.2 270)`, `--sidebar-primary-foreground` to `oklch(0.98 0 0)`, `--sidebar-accent` to `oklch(0.22 0.01 270)`, `--sidebar-border` to `oklch(1 0 0 / 8%)`
    - _Requirements: 3.1, 3.2_

  - [x] 1.9 Verify that the `:root` light-mode tokens are preserved unchanged — no deletions or modifications to the light-mode block
    - _Requirements: 1.5_

- [x] 2. Root Layout — Dark Mode Default
  - [x] 2.1 Add `dark` class to the `<html>` element in `frontend/app/layout.tsx` so the app launches in dark mode by default without user action
    - _Requirements: 1.6, 1.7_

- [x] 3. Checkpoint — Verify token foundation
  - Ensure `npm run build` passes with zero errors after token and layout changes. Ask the user if questions arise.

- [x] 4. App Shell — Sidebar and Header Redesign
  - [x] 4.1 Update sidebar container in `frontend/app/(app)/layout.tsx`: change `bg-white` to `bg-card`, add `border-border` to border-r, update brand text so "Tri" uses foreground and "Coach" uses accent color
    - _Requirements: 3.1, 3.6_

  - [x] 4.2 Update sidebar nav items: active state from `bg-indigo-600 text-white` to `bg-primary text-primary-foreground`, inactive from `text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900` to `text-muted-foreground hover:bg-muted hover:text-foreground`
    - _Requirements: 3.2, 3.3_

  - [x] 4.3 Update sidebar sync button: change `text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800` to `text-muted-foreground hover:bg-muted`
    - _Requirements: 3.5_

  - [x] 4.4 Update header bar: change `bg-white/90 backdrop-blur` to `bg-card/80 backdrop-blur-xl border-border` for frosted-glass effect; update hamburger button border and colors to dark theme tokens
    - _Requirements: 3.4_

  - [x] 4.5 Update outer container from `bg-zinc-50` to `bg-background`, mobile overlay from `bg-zinc-950/20` to `bg-black/40`, and main content area to use `bg-background`
    - _Requirements: 3.7_

  - [x] 4.6 Update header brand text (`text-zinc-900` → `text-foreground`), subtitle (`text-zinc-400` → `text-muted-foreground`), and close button to dark theme tokens
    - _Requirements: 3.6, 12.2_

- [x] 5. Status Color Functions Update
  - [x] 5.1 Update `RECOVERY_STATUS_COLORS` in `frontend/lib/format.ts`: strong → `bg-[--status-positive]/15 text-[--status-positive]`, strained → `bg-[--status-negative]/15 text-[--status-negative]`, steady → `bg-[--status-caution]/15 text-[--status-caution]`, fallback → `bg-muted text-muted-foreground`
    - _Requirements: 2.3, 2.4, 2.5, 10.5_

  - [x] 5.2 Update `ACTIVITY_STATUS_COLORS` in `frontend/lib/format.ts`: building → `--status-positive`, overreaching → `--status-negative`, idle → muted, lighter/steady → `--status-caution`
    - _Requirements: 2.3, 2.4, 2.5, 10.5_

  - [x] 5.3 Update `formatSleepScore` color returns: replace `text-emerald-600` with `text-[--status-positive]`, `text-amber-600` with `text-[--status-caution]`, `text-rose-600` with `text-[--status-negative]`, neutral with `text-muted-foreground`
    - _Requirements: 2.1, 2.2_

  - [x] 5.4 Update `getTrendColor` and `calculateDelta` functions: replace `text-emerald-600` with `text-[--status-positive]`, `text-rose-500` with `text-[--status-negative]`, neutral with `text-muted-foreground`
    - _Requirements: 2.1, 2.2_

  - [x] 5.5 Update `DISCIPLINE_META` colors to dark-friendly tinted backgrounds: e.g. RUN → `bg-orange-500/15 text-orange-400`, SWIM → `bg-blue-500/15 text-blue-400`, etc.
    - _Requirements: 6.3_

- [x] 6. MetricTile Component Dark Theme
  - [x] 6.1 Update `frontend/components/ui/metric-tile.tsx`: container from `border-zinc-100 bg-zinc-50` to `border-border bg-muted`, value from `text-zinc-900` to `text-foreground`, label from `text-zinc-400` to `text-muted-foreground`, subtitle from `text-zinc-400` to `text-muted-foreground`
    - _Requirements: 4.3, 4.4, 4.5, 12.3, 12.5_

- [x] 7. Checkpoint — Verify shell and utility updates
  - Ensure `npm run build` passes and existing tests still pass. Ask the user if questions arise.

- [x] 8. Dashboard Cards Dark Theme
  - [x] 8.1 Update `frontend/app/(app)/dashboard/coach-briefing-card.tsx`: status badge to `bg-primary/15 text-primary`, recommendation sub-cards to `border-border bg-muted/80`, number badges to `bg-[--status-positive]/15 text-[--status-positive]`, caution block to `border-[--status-caution]/30 bg-[--status-caution]/10`, accent bars to status-positive color, empty state dashed border to `border-border bg-muted`, and all hardcoded zinc/white classes to semantic tokens
    - _Requirements: 4.6, 4.7, 10.5_

  - [x] 8.2 Update `frontend/app/(app)/dashboard/recovery-overview-card.tsx`: section labels, chart container from `border-zinc-100 bg-white` to `border-border bg-card`, metric trend rows from `border-zinc-100` to `border-border`, and all hardcoded zinc/white classes to semantic tokens
    - _Requirements: 4.1, 4.2_

  - [x] 8.3 Update `frontend/app/(app)/dashboard/activity-overview-card.tsx`: section labels, discipline rows from `border-zinc-100` to `border-border`, fitness chart wrapper from `border-zinc-100 bg-white` to `border-border bg-card`, and all hardcoded zinc/white classes
    - _Requirements: 4.1, 10.4_

  - [x] 8.4 Update `frontend/app/(app)/dashboard/dashboard-content.tsx`: sync status bar from `border-zinc-200 bg-white` to `border-border bg-card`, syncing notice to `border-primary/20 bg-primary/10 text-primary`, error notice to `border-[--status-negative]/30 bg-[--status-negative]/10 text-[--status-negative]`, success notice to `border-[--status-positive]/30 bg-[--status-positive]/10 text-[--status-positive]`
    - _Requirements: 4.8_

  - [x] 8.5 Update `frontend/app/(app)/dashboard/recent-activities-card.tsx`: card title, activity list items, dividers from `divide-zinc-100` to `divide-border`, hover states, and empty state to dark theme tokens
    - _Requirements: 4.1, 4.2_

  - [x] 8.6 Update `frontend/app/(app)/dashboard/upcoming-workouts-card.tsx`: card title, workout items, empty state dashed border, and discipline badges to dark theme tokens
    - _Requirements: 4.1, 4.2_

  - [x] 8.7 Update `frontend/app/(app)/dashboard/dashboard-metric-tile.tsx` (if it has hardcoded light classes): ensure it delegates to MetricTile or uses semantic tokens
    - _Requirements: 4.3, 4.4, 4.5_

- [x] 9. Chart Theming for Dark Backgrounds
  - [x] 9.1 Update `frontend/components/fitness-chart.tsx`: CartesianGrid stroke to `oklch(1 0 0 / 6%)`, XAxis/YAxis tick fill to `oklch(0.6 0.01 270)`, CTL line stroke to `oklch(0.70 0.15 265)`, ATL line stroke to `oklch(0.78 0.15 85)`, TSB line stroke to `oklch(0.75 0.15 180)`, daily TSS bar fill to `oklch(1 0 0 / 10%)`, reference area fills to low-opacity status colors, tooltip with dark background/light text/dark border, form zone badge classes to dark-friendly variants, chart container from `border-zinc-100 bg-white` to `border-border bg-card`, legend swatches to match new line colors, header text to `text-foreground`/`text-muted-foreground`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 9.2 Update recovery trend chart in `frontend/app/(app)/dashboard/recovery-overview-card.tsx`: grid stroke, axis tick fill, sleep score line to luminous blue, HRV line to cyan/teal, resting HR line to magenta, reference line colors, tooltip styling with dark surface, legend swatches to match new colors
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 10. Checkpoint — Verify dashboard and chart updates
  - Ensure `npm run build` passes and existing dashboard tests still pass (`npm run test` or `npx vitest --run`). Ask the user if questions arise.

- [x] 11. Activity Feed and Detail Dark Theme
  - [x] 11.1 Update `frontend/app/(app)/activities/activity-feed.tsx`: activity cards from `bg-white border-zinc-100 hover:border-zinc-300` to `bg-card border-border hover:border-primary/30`, filter pills active from `bg-zinc-900 text-white` to `bg-primary text-primary-foreground`, filter pills inactive from `bg-zinc-100 text-zinc-600 hover:bg-zinc-200` to `bg-muted text-muted-foreground hover:bg-muted/80`, discipline icon badges to dark-tinted backgrounds, empty state to `text-muted-foreground`
    - _Requirements: 6.1, 6.2, 6.3, 6.6_

  - [x] 11.2 Update `frontend/app/(app)/activities/[id]/activity-detail-content.tsx`: StatBox from `bg-zinc-50` to `bg-muted`, AI analysis card from `border-blue-100 bg-blue-50` to `border-primary/20 bg-primary/10` with text from `text-blue-700`/`text-blue-800` to `text-primary`/`text-foreground`, discipline icon badge to dark-tinted background, all hardcoded zinc classes to semantic tokens
    - _Requirements: 6.4, 6.5_

  - [x] 11.3 Update `frontend/app/(app)/activities/[id]/strength-view.tsx` (if present): ensure any hardcoded light classes use semantic tokens
    - _Requirements: 6.4_

- [x] 12. AI Coach Chat Dark Theme
  - [x] 12.1 Update `frontend/app/(app)/coach/page.tsx` user message bubbles: from `bg-zinc-900 text-white` to `bg-primary text-primary-foreground`
    - _Requirements: 7.1_

  - [x] 12.2 Update coach assistant message bubbles: from `bg-white border-zinc-100 text-zinc-800` to `bg-card border-border text-foreground`
    - _Requirements: 7.2_

  - [x] 12.3 Update coach chat input area: from `bg-white border-t` to `bg-card border-t border-border`, input field to dark input token background
    - _Requirements: 7.3_

  - [x] 12.4 Update goals sidebar: from `bg-white border-r` to `bg-card border-r border-border`, goal items borders to `border-border`
    - _Requirements: 7.4_

  - [x] 12.5 Update empty state suggestions: from `bg-zinc-100 hover:bg-zinc-200` to `bg-muted hover:bg-muted/80`, typing dots from `bg-zinc-400` to `bg-muted-foreground`, chat header from `bg-white` to `bg-card`
    - _Requirements: 7.5, 7.6_

  - [x] 12.6 Add `dark:prose-invert` to markdown-rendered assistant responses for proper dark-mode prose styling
    - _Requirements: 7.7_

- [x] 13. Auth Pages Dark Theme
  - [x] 13.1 Update `frontend/app/(auth)/login/login-form.tsx`: add glassmorphism to card (`backdrop-blur-xl bg-card/80 border-border`), brand title with accent on "Coach", error text from `text-red-500` to `text-[--status-negative]`, secondary links to accent color, subtitle to `text-muted-foreground`
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 8.7, 10.6_

  - [x] 13.2 Update `frontend/app/(auth)/register/register-form.tsx`: same glassmorphism card, brand accent, error color, link colors, and subtitle color changes as login form
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 10.6_

- [x] 14. Checkpoint — Verify activity, coach, and auth page updates
  - Ensure `npm run build` passes. Ask the user if questions arise.

- [x] 15. Settings, Workouts, and Routes Dark Theme
  - [x] 15.1 Update `frontend/app/(app)/settings/page.tsx`: heading to `text-foreground` with semibold weight, labels to `text-muted-foreground`
    - _Requirements: 9.1, 12.2_

  - [x] 15.2 Update `frontend/app/(app)/settings/athlete-profile-card.tsx`: replace any hardcoded light classes (`bg-white`, `border-zinc-*`, `text-zinc-*`) with dark theme tokens (`bg-card`, `border-border`, `text-foreground`/`text-muted-foreground`)
    - _Requirements: 9.2, 9.3_

  - [x] 15.3 Update `frontend/app/(app)/settings/garmin-connect-card.tsx`: same hardcoded light class replacements as athlete profile card
    - _Requirements: 9.2, 9.3_

  - [x] 15.4 Update `frontend/app/(app)/workouts/page.tsx` and any sub-components: heading to `text-foreground`, list items to dark surfaces, "New workout" button to use primary accent
    - _Requirements: 9.4, 12.2_

  - [x] 15.5 Update `frontend/app/(app)/routes/page.tsx` and `saved-routes.tsx`: heading to `text-foreground`, list items to dark surfaces, "Plan route" button to use primary accent
    - _Requirements: 9.5, 12.2_

- [x] 16. Mapbox Dark Map Integration
  - [x] 16.1 Update `frontend/app/(app)/activities/[id]/endurance-map.tsx`: map style from `outdoors-v12` to `dark-v11`, route line color to primary accent or high-visibility cyan, container border to `border-border` with rounded corners, fallback from `bg-zinc-100 text-zinc-400` to `bg-muted text-muted-foreground`
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 16.2 Update route planner map components in `frontend/app/(app)/routes/new/page.tsx`: map style to `dark-v11`, container border to `border-border`, route overlay line to accent/luminous color
    - _Requirements: 11.1, 11.3, 11.4, 9.6_

- [x] 17. Typography and Spacing Consistency Pass
  - [x] 17.1 Audit all page headings (settings, workouts, routes, activities) to ensure they use `text-foreground` with `font-semibold` or `font-bold` weight
    - _Requirements: 12.2_

  - [x] 17.2 Audit all section labels within cards (uppercase tracking labels like "Recovery", "Activity", "Coach Briefing") to ensure consistent style: `text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground`
    - _Requirements: 12.3, 10.4_

  - [x] 17.3 Verify body text within cards uses `text-sm` with appropriate leading and secondary foreground color; verify tabular numeric values use `tabular-nums` font feature where applicable
    - _Requirements: 12.4, 12.5_

- [x] 18. Premium Visual Polish
  - [x] 18.1 Add optional subtle gradient background to sidebar active nav item using `--gradient-accent`
    - _Requirements: 10.2_

  - [x] 18.2 Add optional subtle gradient border or glow effect to highlighted MetricTile instances (e.g. current form score, sleep score) via an additional className prop
    - _Requirements: 10.3_

  - [x] 18.3 Verify all interactive elements (buttons, links, nav items) have visible focus rings using the primary accent color (`ring-ring`) for keyboard navigation accessibility
    - _Requirements: 10.7_

- [x] 19. Final Checkpoint — Build Verification and Regression Testing
  - [x] 19.1 Run `npm run build` in `frontend/` to verify zero TypeScript/build errors
  - [x] 19.2 Run existing frontend test suite to confirm no functional regressions
  - [x] 19.3 Run `npm run lint` in `frontend/` to verify no lint errors
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- No property-based tests are included — this is a purely visual redesign with no business logic changes
- Each task references specific requirements for traceability
- Checkpoints are placed after each major phase to catch issues early
- The `:root` light-mode tokens must remain untouched throughout all changes
- All TypeScript types, API contracts, and backend schemas remain unchanged
- Status color tokens use cyan/amber/magenta instead of red/green for colorblind accessibility
