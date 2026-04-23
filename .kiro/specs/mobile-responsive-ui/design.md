# Design Document: Mobile-Responsive UI

## Overview

This design covers a comprehensive responsive overhaul of the Personal Coach triathlon training app. The app is built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4, and shadcn/ui. The two reference devices are MacBook Air 13" (1440×900 CSS pixels) and iPhone 12 Pro (390×844 CSS pixels).

The current codebase has a desktop-oriented layout with several responsive gaps:
- The sidebar navigation is always a slide-out overlay — no persistent desktop sidebar
- Dashboard cards stack in a single column at all sizes with no side-by-side grid at desktop
- Discipline rows and trend rows use fixed multi-column grids that overflow on 390px screens
- The Coach page always shows the goals sidebar, consuming space on mobile
- Filter pills wrap instead of scrolling horizontally on narrow screens
- Charts have no minimum height constraints for mobile
- Forms use a fixed 2-column grid (athlete profile) regardless of screen width
- No `overflow-x: hidden` at the root level

All changes are CSS/layout-only using Tailwind utility classes and the existing `cn()` helper. No new dependencies are introduced. The primary Tailwind breakpoints used are `sm` (640px), `md` (768px), `lg` (1024px), and `xl` (1280px).

## Architecture

The responsive overhaul is a pure frontend concern. No backend changes are needed. The architecture follows the existing patterns:

```mermaid
graph TD
    A[Root Layout - app/layout.tsx] --> B[App Layout - app/(app)/layout.tsx]
    A --> C[Auth Layout - app/(auth)/]
    B --> D[Dashboard]
    B --> E[Activities]
    B --> F[Coach]
    B --> G[Settings]
    B --> H[Workouts]
    B --> I[Routes]
```

### Breakpoint Strategy

| Tailwind Token | Width | Target |
|---|---|---|
| Default (no prefix) | 0–639px | iPhone 12 Pro (390px) |
| `sm:` | ≥640px | Small tablets |
| `md:` | ≥768px | Tablets |
| `lg:` | ≥1024px | Desktop threshold |
| `xl:` | ≥1280px | MacBook Air 13" (1440px) |

The primary breakpoint boundary is `lg:` (1024px) — below this is "mobile", at or above is "desktop". The `sm:` breakpoint handles intermediate states.

### Change Scope

Changes are confined to Tailwind class modifications in existing components. No new components are created. No component file moves. The changes fall into these categories:

1. **App Shell** (`layout.tsx`): Persistent sidebar at `lg:`, hamburger on mobile
2. **Dashboard** (`dashboard-content.tsx`, card components): Responsive grids
3. **Data Rows** (`activity-overview-card.tsx`, `recovery-overview-card.tsx`): Stacked mobile layout
4. **Coach Page** (`coach/page.tsx`): Hidden sidebar on mobile with toggle
5. **Activity Feed/Detail** (`activity-feed.tsx`, `activity-detail-content.tsx`): Scrollable filters, responsive stat grids
6. **Charts** (`fitness-chart.tsx`, `recovery-overview-card.tsx`): Min heights, wrapping legends
7. **Settings** (`settings/page.tsx`, `athlete-profile-card.tsx`, `garmin-connect-card.tsx`): Single-column forms
8. **Auth Pages** (`login/page.tsx`, `register/page.tsx`, form components): Centered responsive cards
9. **Workouts/Routes** (`workouts/page.tsx`, `routes/page.tsx`): Stacked headers
10. **Global** (`globals.css`, `app/layout.tsx`): `overflow-x: hidden`, typography scale

## Components and Interfaces

### 1. App Shell — `frontend/app/(app)/layout.tsx`

**Current state**: Sidebar is always a slide-out overlay triggered by a hamburger button. Header is always visible.

**Changes**:
- At `lg:` breakpoint, render the sidebar as a persistent visible panel (`translate-x-0`) and shift the main content area right with `lg:ml-64`
- Hide the hamburger button at `lg:` with `lg:hidden`
- Hide the backdrop overlay at `lg:` since the sidebar is always visible
- Set header height to `h-14` (56px) consistently; use `px-4` on mobile, `sm:px-6` on desktop (already present)
- Set main content padding to `px-4` on mobile, `sm:px-6` on desktop (already present)
- Ensure all nav link items have `min-h-[44px]` for touch targets

**Key class changes on `<aside>`**:
```
Current: "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-white transition-transform duration-200 {navOpen ? 'translate-x-0' : '-translate-x-full'}"
New:     "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-white transition-transform duration-200 lg:translate-x-0 lg:z-auto {navOpen ? 'translate-x-0' : '-translate-x-full'}"
```

**Key class changes on main wrapper `<div>`**:
```
Current: "min-h-screen"
New:     "min-h-screen lg:ml-64"
```

**Key class changes on hamburger button**:
```
Add: "lg:hidden"
```

**Key class changes on backdrop overlay**:
```
Add: "lg:hidden"
```

### 2. Dashboard Content — `frontend/app/(app)/dashboard/dashboard-content.tsx`

**Current state**: All cards stack in a single column. The bottom row uses `xl:grid-cols-[8fr_4fr]` for recent activities + upcoming workouts.

**Changes**:
- Keep single-column stacking on mobile (already correct)
- The bottom grid already uses `xl:grid-cols-[8fr_4fr]` — change to `lg:grid-cols-[8fr_4fr]` to activate at the desktop breakpoint
- Add `gap-4` on mobile (reduce from `gap-5`) for tighter spacing: `gap-4 sm:gap-5`

### 3. Metric Tile — `frontend/components/ui/metric-tile.tsx`

**Current state**: Fixed `min-h-[120px]`, `text-2xl` value.

**Changes**:
- Keep `min-h-[100px]` on mobile, `sm:min-h-[120px]` on desktop: change `min-h-[120px]` to `min-h-[100px] sm:min-h-[120px]`
- Responsive value font size: `text-xl sm:text-2xl` (20px mobile, 24px desktop)

### 4. Discipline Row — `frontend/app/(app)/dashboard/activity-overview-card.tsx`

**Current state**: Uses a 5- or 6-column grid (`grid-cols-[1.8fr_0.7fr_0.9fr_0.8fr_0.9fr]` or with VO₂max column). This overflows at 390px.

**Changes**:
- On mobile: switch to a wrapped layout. The discipline name spans full width as a header, then metrics display in a 2×2 or 3-column sub-grid below
- At `lg:` breakpoint: restore the current single-row grid
- Implementation: replace the fixed `grid` with a responsive approach:
  - Mobile: `flex flex-wrap gap-x-4 gap-y-1` with the name row at full width and metric cells at `w-auto`
  - Desktop: `lg:grid lg:grid-cols-[1.8fr_0.7fr_0.9fr_0.8fr_0.9fr]` (or 6-col with VO₂max)

### 5. Trend Row — `frontend/app/(app)/dashboard/recovery-overview-card.tsx`

**Current state**: Uses `grid-cols-[1.6fr_0.7fr_0.7fr_64px_0.8fr]`. Overflows at 390px.

**Changes**:
- On mobile: switch to a wrapped/stacked layout similar to discipline rows. Label spans full width, metrics wrap below in a compact grid
- At `lg:` breakpoint: restore the current single-row grid
- Hide the sparkline column on mobile (`hidden lg:block`) since 64px sparklines add clutter on small screens

### 6. Coach Page — `frontend/app/(app)/coach/page.tsx`

**Current state**: Goals sidebar (`w-64`) is always visible alongside the chat. Chat input is in the normal document flow.

**Changes**:
- Hide goals sidebar on mobile: `hidden lg:flex` on the `<aside>`
- Add a mobile toggle button (e.g., a "Goals" button in the chat header) that opens the sidebar as a slide-out overlay on mobile
- Chat container takes full width on mobile: remove the `flex` parent constraint
- Fix chat input to bottom of viewport on mobile: `fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto` on the input container
- Add bottom padding to the message list on mobile to account for the fixed input bar
- Constrain message bubble max-width: `max-w-[85%]` on mobile (currently `max-w-[80%]`, adjust to 85%)

### 7. Activity Feed — `frontend/app/(app)/activities/activity-feed.tsx`

**Current state**: Filter pills use `flex flex-wrap gap-2`. Activity cards use a horizontal flex layout.

**Changes**:
- Filter pills: change to `flex gap-2 overflow-x-auto pb-2 scrollbar-hide` on mobile, `sm:flex-wrap sm:overflow-x-visible` on desktop. Add `shrink-0` to each pill button
- Activity cards: already fit within 390px (icon + text + stat), no structural change needed. Verify `truncate` on name prevents overflow

### 8. Activity Detail — `frontend/app/(app)/activities/[id]/activity-detail-content.tsx`

**Current state**: Stat boxes use `grid-cols-2 sm:grid-cols-4`. Map uses fixed `h-72`.

**Changes**:
- Stat grid is already responsive (`grid-cols-2 sm:grid-cols-4`) — meets requirements
- Map container: change from `h-72` to `aspect-video w-full` to maintain 16:9 ratio and fill width. Add `min-h-[200px]` as a floor

### 9. Charts — `frontend/components/fitness-chart.tsx` and `recovery-overview-card.tsx`

**Current state**: Fitness chart uses `height={220}`. Recovery trend chart uses `height={180}`. Legends use `flex gap-3/4`.

**Changes**:
- Fitness chart: wrap `ResponsiveContainer` height in a responsive container div with `min-h-[180px]`; keep 220px as the rendered height (ResponsiveContainer fills parent)
- Recovery trend chart: wrap with `min-h-[160px]`
- Legend items: add `flex-wrap` to legend containers so they wrap on narrow screens
- Chart axis labels already use `fontSize: 10` — meets the 10px minimum requirement
- Tooltip positioning: Recharts tooltips are viewport-aware by default; add `wrapperStyle={{ zIndex: 50 }}` to ensure they render above other content

### 10. Settings Page — `frontend/app/(app)/settings/page.tsx` and cards

**Current state**: Settings page uses `p-8 max-w-2xl`. Athlete profile form uses `grid-cols-2`. Garmin status row uses horizontal flex.

**Changes**:
- Settings page: change `p-8` to `px-4 py-6 sm:p-8`, change `max-w-2xl` to `max-w-2xl mx-auto`
- Athlete profile form grid: change `grid-cols-2` to `grid-cols-1 sm:grid-cols-2`
- All form inputs: add `min-h-[44px]` via the Input component or inline class
- Garmin status row: change from `flex items-center justify-between` to `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between` so buttons stack below text on mobile

### 11. Auth Pages — `frontend/app/(auth)/login/page.tsx` and `register/page.tsx`

**Current state**: Cards use `w-full max-w-sm`. Pages center with `flex min-h-screen items-center justify-center`.

**Changes**:
- Card wrapper: add `mx-4 sm:mx-0` for 16px horizontal margin on mobile
- Form inputs: add `min-h-[44px]` for touch targets
- Max width is already `max-w-sm` (384px) which is close to the 400px requirement — change to `max-w-[400px]`

### 12. Workouts and Routes Pages

**Current state**: Both use `flex items-center justify-between` for header rows. Cards fill available width.

**Changes**:
- Header rows: change to `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`
- On mobile, the action button should be `w-full sm:w-auto`
- Page padding: change `p-6` to `px-4 py-5 sm:p-6`
- Route cards and workout cards already use full-width flex layout — add `px-4 sm:px-0` wrapper if needed

### 13. Global — `frontend/app/globals.css` and `frontend/app/layout.tsx`

**Changes to `globals.css`**:
- Add `overflow-x: hidden` to `html` and `body` in the `@layer base` block

**Changes to root `layout.tsx`**:
- Already uses Geist Sans as primary font — no change needed

### 14. Typography Scale

Applied via Tailwind classes across components:

| Element | Mobile | Desktop | Implementation |
|---|---|---|---|
| Page titles (h1) | 20px (`text-xl`) | 24px (`text-2xl`) | `text-xl sm:text-2xl` |
| Body text | 14px (`text-sm`) min | 14px | Already met |
| Caption/secondary | 12px (`text-xs`) min | 12px | Already met |
| Metric tile value | 20px (`text-xl`) | 24px (`text-2xl`) | `text-xl sm:text-2xl` |

## Data Models

No data model changes are required. This is a pure CSS/layout refactor. All existing TypeScript types, API contracts, and component props remain unchanged.

The responsive behavior is driven entirely by Tailwind CSS breakpoint prefixes applied to existing component class strings. No new props, state variables, or context providers are needed except:

- **Coach page**: One new `boolean` state variable (`goalsOpen`) to control the mobile goals drawer visibility
- **Coach page**: One new button element to toggle the goals drawer on mobile

