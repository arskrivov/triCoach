# Implementation Plan: Mobile-Responsive UI

## Overview

This plan implements a comprehensive responsive design overhaul of the Personal Coach triathlon training app. All changes are CSS/Tailwind-only modifications to existing frontend components — no backend changes, no new dependencies, no new component files. The primary breakpoint boundary is `lg:` (1024px) separating mobile from desktop. Changes are ordered so each task builds on the previous, starting with the global foundation (CSS, app shell) and working outward to individual pages.

## Tasks

- [x] 1. Global CSS and typography foundation
  - [x] 1.1 Add `overflow-x: hidden` to html and body in `frontend/app/globals.css`
    - In the `@layer base` block, add `overflow-x: hidden` to the `html` selector (alongside the existing `@apply font-sans`)
    - Add `overflow-x: hidden` to the `body` selector (alongside the existing `@apply bg-background text-foreground`)
    - _Requirements: 12.1_

  - [x] 1.2 Apply responsive typography scale to page titles across all pages
    - In `frontend/app/(app)/activities/page.tsx`: change `text-2xl` on the h1 to `text-xl sm:text-2xl`
    - In `frontend/app/(app)/settings/page.tsx`: change `text-2xl` on the h1 to `text-xl sm:text-2xl`
    - In `frontend/app/(app)/workouts/page.tsx`: change `text-2xl` on the h1 to `text-xl sm:text-2xl`
    - In `frontend/app/(app)/routes/page.tsx`: change `text-2xl` on the h1 to `text-xl sm:text-2xl`
    - _Requirements: 9.2, 9.3_

- [x] 2. Responsive App Shell and navigation
  - [x] 2.1 Make sidebar persistent at desktop breakpoint in `frontend/app/(app)/layout.tsx`
    - On the `<aside>` element, add `lg:translate-x-0 lg:z-auto` so the sidebar is always visible at `lg:` and above, regardless of `navOpen` state
    - On the main content wrapper `<div className="min-h-screen">`, add `lg:ml-64` to shift content right when sidebar is persistent
    - On the backdrop overlay div, add `lg:hidden` to hide it on desktop since the sidebar is always visible
    - On the hamburger button, add `lg:hidden` to hide it on desktop
    - _Requirements: 1.2, 1.3_

  - [x] 2.2 Ensure touch targets and padding in the App Shell
    - On each nav link `<Link>` inside the sidebar, add `min-h-[44px]` to ensure 44px minimum tappable area
    - Verify the header uses `h-14` (56px) — already present
    - Verify main content uses `px-4` mobile and `sm:px-6` desktop — already present in the layout
    - _Requirements: 1.1, 1.4, 1.5, 1.6_

- [x] 3. Checkpoint — Verify app shell renders correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Responsive Metric Tile
  - [x] 4.1 Update `frontend/components/ui/metric-tile.tsx` for responsive sizing
    - Change `min-h-[120px]` to `min-h-[100px] sm:min-h-[120px]` for mobile-friendly height
    - Change `text-2xl` on the value `<p>` to `text-xl sm:text-2xl` for responsive font sizing
    - _Requirements: 2.5, 9.5_

- [x] 5. Responsive Dashboard layout
  - [x] 5.1 Update `frontend/app/(app)/dashboard/dashboard-content.tsx` for responsive grids and gaps
    - On the outer `<div className="flex flex-col gap-5">`, change `gap-5` to `gap-4 sm:gap-5` for tighter mobile spacing
    - On the bottom grid `<div className="grid grid-cols-1 gap-5 xl:grid-cols-[8fr_4fr]">`, change `xl:grid-cols-[8fr_4fr]` to `lg:grid-cols-[8fr_4fr]` to activate the two-column layout at the desktop breakpoint
    - _Requirements: 2.1, 2.2_

- [x] 6. Responsive Discipline Rows
  - [x] 6.1 Refactor `DisciplineRow` in `frontend/app/(app)/dashboard/activity-overview-card.tsx` for mobile stacking
    - Replace the fixed `grid grid-cols-[...]` layout with a responsive approach: use `flex flex-wrap gap-x-4 gap-y-1` on mobile, and `lg:grid lg:grid-cols-[1.8fr_0.7fr_0.9fr_0.8fr_0.9fr]` (or 6-col with VO₂max) on desktop
    - The discipline name (`{icon} {label}`) should span full width on mobile (`w-full`) and be part of the grid row on desktop
    - Each metric cell should use `w-auto` on mobile so they wrap naturally in the flex container
    - Maintain the existing `rounded-xl border border-zinc-100 px-3 py-2.5 text-sm` styling
    - _Requirements: 3.1, 3.3_

- [x] 7. Responsive Trend Rows
  - [x] 7.1 Refactor trend metric rows in `frontend/app/(app)/dashboard/recovery-overview-card.tsx` for mobile stacking
    - Replace the fixed `grid grid-cols-[1.6fr_0.7fr_0.7fr_64px_0.8fr]` layout with a responsive approach: use `flex flex-wrap gap-x-4 gap-y-1` on mobile, and `lg:grid lg:grid-cols-[1.6fr_0.7fr_0.7fr_64px_0.8fr]` on desktop
    - The metric label should span full width on mobile (`w-full`)
    - Hide the sparkline column on mobile with `hidden lg:block` on the sparkline wrapper — sparklines add clutter on small screens
    - Each metric cell should wrap naturally on mobile
    - _Requirements: 3.2, 3.4_

- [x] 8. Checkpoint — Verify dashboard renders correctly on mobile and desktop
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Responsive Coach Page
  - [x] 9.1 Hide goals sidebar on mobile and add toggle in `frontend/app/(app)/coach/page.tsx`
    - On the goals `<aside>`, change from always-visible to `hidden lg:flex` so it's hidden on mobile
    - Add a new `goalsOpen` boolean state variable to control mobile goals drawer visibility
    - Add a "Goals" toggle button in the chat header area (visible only on mobile via `lg:hidden`) that sets `goalsOpen` to true
    - When `goalsOpen` is true on mobile, show the sidebar as a slide-out overlay (similar to the app shell nav pattern): `fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-white border-r` with a backdrop
    - Add a close button inside the mobile goals overlay
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 9.2 Fix chat input to bottom of viewport on mobile
    - On the chat input container `<div className="px-6 py-4 border-t bg-white">`, add `fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto` for mobile fixed positioning
    - Add `pb-24 lg:pb-0` to the messages scroll area to account for the fixed input bar height on mobile
    - Change message bubble `max-w-[80%]` to `max-w-[85%]` for slightly wider bubbles on mobile
    - _Requirements: 4.4, 4.5_

- [x] 10. Responsive Activity Feed
  - [x] 10.1 Make filter pills horizontally scrollable on mobile in `frontend/app/(app)/activities/activity-feed.tsx`
    - Change the filter pills container from `flex flex-wrap gap-2 mb-5` to `flex gap-2 mb-5 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-x-visible`
    - Add `shrink-0` to each filter pill `<button>` so they don't compress on mobile
    - Add `scrollbar-hide` class (or equivalent `-webkit-overflow-scrolling: touch` and hidden scrollbar styles) for a clean mobile scroll experience
    - _Requirements: 5.1, 5.2_

  - [x] 10.2 Update Activities page padding for mobile in `frontend/app/(app)/activities/page.tsx`
    - Change `p-6` to `px-4 py-5 sm:p-6` for responsive padding
    - _Requirements: 1.5, 12.2_

- [x] 11. Responsive Activity Detail
  - [x] 11.1 Update map container for responsive aspect ratio in `frontend/app/(app)/activities/[id]/endurance-map.tsx`
    - Change the map container from `h-72` to `aspect-video w-full min-h-[200px]` to maintain 16:9 ratio and fill width
    - Also update the fallback no-token div from `h-64` to `aspect-video w-full min-h-[200px]` for consistency
    - _Requirements: 5.5_

  - [x] 11.2 Verify stat grid is already responsive in `frontend/app/(app)/activities/[id]/activity-detail-content.tsx`
    - The stat grid already uses `grid-cols-2 sm:grid-cols-4` — confirm this meets requirements 5.3 and 5.4
    - No changes needed if already correct
    - _Requirements: 5.3, 5.4_

- [x] 12. Responsive Charts
  - [x] 12.1 Add minimum heights and wrapping legends to `frontend/components/fitness-chart.tsx`
    - Wrap the `<ResponsiveContainer>` in a `<div className="min-h-[180px]">` to ensure minimum chart height on mobile
    - On the legend container `<div className="flex flex-wrap gap-3 ...">`, verify `flex-wrap` is present (it uses `flex-wrap` already — confirm)
    - Add `wrapperStyle={{ zIndex: 50 }}` to the `<Tooltip>` component to ensure it renders above other content on mobile
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

  - [x] 12.2 Add minimum height and wrapping legends to recovery trend chart in `frontend/app/(app)/dashboard/recovery-overview-card.tsx`
    - Wrap the `RecoveryTrendChart` `<ResponsiveContainer>` in a `<div className="min-h-[160px]">` for minimum chart height on mobile
    - On the legend container, add `flex-wrap` if not already present
    - Add `wrapperStyle={{ zIndex: 50 }}` to the chart `<Tooltip>` component
    - _Requirements: 6.1, 6.3, 6.5_

- [x] 13. Checkpoint — Verify charts and activity pages render correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Responsive Settings Page
  - [x] 14.1 Update Settings page layout in `frontend/app/(app)/settings/page.tsx`
    - Change `p-8 max-w-2xl` to `px-4 py-6 sm:p-8 max-w-2xl mx-auto` for responsive padding and centering
    - Change the h1 `text-2xl` to `text-xl sm:text-2xl` (if not already done in task 1.2)
    - _Requirements: 7.4_

  - [x] 14.2 Update Athlete Profile form for single-column mobile in `frontend/app/(app)/settings/athlete-profile-card.tsx`
    - Change the form grid from `grid-cols-2` to `grid-cols-1 sm:grid-cols-2` so fields stack on mobile
    - Add `min-h-[44px]` to each `<Input>` element for comfortable touch targets
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 14.3 Update Garmin Connect card for stacked mobile layout in `frontend/app/(app)/settings/garmin-connect-card.tsx`
    - On the connected status row `<div className="flex items-center justify-between ...">`, change to `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between` so buttons stack below status text on mobile
    - Add `min-h-[44px]` to form `<Input>` elements for touch targets
    - _Requirements: 7.3, 7.5_

- [x] 15. Responsive Auth Pages
  - [x] 15.1 Update login page layout in `frontend/app/(auth)/login/page.tsx`
    - Add `px-4 sm:px-0` to the centering container for 16px horizontal margin on mobile
    - _Requirements: 8.1, 8.2_

  - [x] 15.2 Update login form card in `frontend/app/(auth)/login/login-form.tsx`
    - Change `max-w-sm` to `max-w-[400px]` on the Card for the required max width
    - Add `min-h-[44px]` to each `<Input>` element for touch targets
    - _Requirements: 8.3, 8.4_

  - [x] 15.3 Update register page layout in `frontend/app/(auth)/register/page.tsx`
    - Add `px-4 sm:px-0` to the centering container for 16px horizontal margin on mobile
    - _Requirements: 8.1, 8.2_

  - [x] 15.4 Update register form card in `frontend/app/(auth)/register/register-form.tsx`
    - Change `max-w-sm` to `max-w-[400px]` on the Card for the required max width
    - Add `min-h-[44px]` to each `<Input>` element for touch targets
    - _Requirements: 8.3, 8.4_

- [x] 16. Responsive Workouts and Routes Pages
  - [x] 16.1 Update Workouts page for responsive header and padding in `frontend/app/(app)/workouts/page.tsx`
    - Change page padding from `p-6` to `px-4 py-5 sm:p-6`
    - Change header row from `flex items-center justify-between` to `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`
    - On the action button `<Link>` / `<Button>`, add `w-full sm:w-auto` so it goes full-width on mobile
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 16.2 Update Routes page for responsive header and padding in `frontend/app/(app)/routes/page.tsx`
    - Change page padding from `p-6` to `px-4 py-5 sm:p-6`
    - Change header row from `flex items-center justify-between` to `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`
    - On the action button `<Link>` / `<Button>`, add `w-full sm:w-auto` so it goes full-width on mobile
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 17. Colour palette and visual polish verification
  - [x] 17.1 Verify consistent colour usage and focus rings across components
    - Confirm status badges use semantic colours (emerald/amber/rose) — already implemented in `getActivityStatusColor`, `getRecoveryStatusColor` in `lib/format.ts`
    - Confirm the app uses `--background` and `--card` CSS custom properties — already set in `globals.css`
    - Add `focus-visible:ring-2 focus-visible:ring-ring` to interactive elements (filter pills in activity-feed, nav links in layout) that don't already have focus ring styles
    - Confirm discipline icons use consistent colours from `getDisciplineMeta` — already implemented
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 18. Final checkpoint — Full responsive verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All changes are CSS/Tailwind class modifications only — no new components, no new dependencies, no backend changes
- The primary breakpoint boundary is `lg:` (1024px) for mobile vs desktop
- Tasks are ordered foundation-first: global CSS → app shell → shared components → individual pages
- Each task references specific requirements for traceability
- Checkpoints are placed after major sections to catch issues early
- The design has no Correctness Properties section, so no property-based tests are included
- Existing tests in `frontend/app/(app)/dashboard/__tests__/` should continue to pass since changes are CSS-only
