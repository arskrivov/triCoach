# Requirements Document

## Introduction

Premium visual redesign of the TriCoach triathlon training web app, transforming it from a light-mode zinc/white aesthetic into a dark-mode-first, premium design inspired by Oura and Whoop. The redesign targets desktop web only (no responsive/mobile design changes) and replaces the current red-green color semantics with a sophisticated black/white base palette accented by premium gradients. The goal is a "sellable" look — modern, visually compelling, and state-of-the-art — while preserving all existing functionality.

Research into current premium fitness app design trends (Oura, Whoop, and broader 2025 UI patterns) informs the following design direction:

- **Dark-mode-first surfaces**: Near-black backgrounds (oklch ~0.13–0.16) with layered card surfaces at slightly elevated lightness, creating depth without harsh contrast.
- **Glassmorphism accents**: Semi-transparent frosted-glass panels with `backdrop-blur` for cards and overlays, adding premium layered depth.
- **Gradient-driven status indicators**: Replace red/green with cool-to-warm gradient scales (cyan → amber → magenta) for recovery/strain/status, avoiding colorblind-hostile red-green pairs.
- **Monochromatic base with accent pops**: Black/white/zinc foundation with a single premium accent color (electric blue or cool violet) for interactive elements and highlights.
- **Data visualization on dark**: Chart lines and areas use luminous, high-contrast colors against dark backgrounds — inspired by Oura's approach of using color to signal body states against dark surfaces.
- **Typography hierarchy**: Clean sans-serif (Geist) with generous tracking on labels, bold weights on key metrics, and muted secondary text for information hierarchy.
- **Subtle motion and glow**: Soft glow effects on active states, smooth transitions on hover/focus, and understated animations that convey premium quality.

## Glossary

- **Theme_System**: The CSS custom property (design token) layer in `globals.css` that defines all color, spacing, and radius values consumed by Tailwind and shadcn/ui components.
- **App_Shell**: The authenticated layout (`(app)/layout.tsx`) containing the sidebar navigation, top header bar, and main content area.
- **Dashboard**: The main landing page showing coach briefing, recovery overview, activity overview, fitness chart, recent activities, and upcoming workouts.
- **Card_Component**: The shadcn/ui `Card` primitive and its variants (`CardHeader`, `CardContent`, etc.) used as the primary content container across all pages.
- **Metric_Tile**: The `MetricTile` component used to display individual key metrics (HRV, sleep score, TSS, etc.) in a compact tile format.
- **Chart_System**: The Recharts-based data visualization components (recovery trend chart, fitness/form chart) that render time-series health and training data.
- **Activity_Feed**: The paginated, filterable list of training activities on the Activities page.
- **Coach_Chat**: The AI coach conversational interface with streaming message display.
- **Auth_Pages**: The login and register pages rendered in the `(auth)` route group.
- **Route_Planner**: The Mapbox GL JS-based map interface for planning running and cycling routes.
- **Status_Indicator**: Visual badges and color cues that communicate recovery status (strong/strained/steady), activity status (building/overreaching/idle/lighter/steady), and metric trends (improving/softening/stable).
- **Gradient_Scale**: A continuous color ramp used for status communication that avoids red-green pairs, using instead cyan-to-amber-to-magenta or similar accessible progressions.
- **Glassmorphism_Surface**: A UI surface style using semi-transparent backgrounds with `backdrop-blur` to create a frosted-glass depth effect.

## Requirements

### Requirement 1: Dark-Mode-First Theme System

**User Story:** As a user, I want the app to default to a premium dark theme, so that the interface feels modern and visually compelling from the first interaction.

#### Acceptance Criteria

1. THE Theme_System SHALL define a dark-mode-first color palette as the default theme using CSS custom properties in `globals.css`, with near-black background values (oklch lightness between 0.10 and 0.16) for the base `--background` variable.
2. THE Theme_System SHALL define at least three distinct surface elevation levels (background, card/elevated, popover/overlay) with progressively lighter dark tones to create visual depth hierarchy.
3. THE Theme_System SHALL define a primary accent color in the cool spectrum (electric blue or cool violet, oklch hue between 250 and 290) for interactive elements, active navigation states, and focus rings.
4. THE Theme_System SHALL define foreground text colors with at least three opacity tiers: primary text (oklch lightness 0.93–0.98), secondary/muted text (oklch lightness 0.55–0.70), and disabled/hint text (oklch lightness 0.35–0.45).
5. THE Theme_System SHALL retain the existing light-mode CSS custom properties under the `:root` selector as a secondary theme option, ensuring no light-mode values are deleted.
6. WHEN the `html` element has the class `dark` applied, THE Theme_System SHALL activate the dark palette as the default visual presentation.
7. THE Theme_System SHALL set the `dark` class on the `html` element by default in the root layout so the app launches in dark mode without user action.

### Requirement 2: Accessible Status Color Palette

**User Story:** As a user, I want status indicators to use colors that are visually distinct and accessible without relying on red-green differentiation, so that I can interpret my health and training data regardless of color vision.

#### Acceptance Criteria

1. THE Theme_System SHALL define a Gradient_Scale for status communication that avoids red-green color pairs, using instead a progression through cyan, blue, amber, and magenta hues.
2. THE Theme_System SHALL define semantic status tokens for positive status (e.g. `--status-positive`) using cyan or teal hues (oklch hue 170–190), caution status (e.g. `--status-caution`) using amber or gold hues (oklch hue 80–95), and negative status (e.g. `--status-negative`) using magenta or rose-violet hues (oklch hue 320–350).
3. WHEN a Status_Indicator displays recovery status "strong", THE Status_Indicator SHALL use the positive status color token.
4. WHEN a Status_Indicator displays recovery status "strained", THE Status_Indicator SHALL use the negative status color token.
5. WHEN a Status_Indicator displays recovery status "steady", THE Status_Indicator SHALL use the caution status color token.
6. THE Status_Indicator SHALL maintain a minimum contrast ratio of 4.5:1 between status text and its background surface for WCAG AA compliance.
7. THE Theme_System SHALL define chart-specific color tokens (`--chart-1` through `--chart-5`) using distinguishable hues that maintain at least 3:1 contrast against the dark card background.

### Requirement 3: Premium App Shell Redesign

**User Story:** As a user, I want the navigation sidebar and header to feel like a premium dark-mode application, so that the overall experience matches high-end fitness apps like Oura and Whoop.

#### Acceptance Criteria

1. THE App_Shell sidebar SHALL use a dark surface color (matching or slightly darker than the main background) with a subtle border or 1px separator using a low-opacity white border (e.g. `oklch(1 0 0 / 8%)`).
2. THE App_Shell sidebar active navigation item SHALL use the primary accent color as a background highlight with white foreground text.
3. THE App_Shell sidebar inactive navigation items SHALL use muted foreground text that brightens on hover with a subtle background transition.
4. THE App_Shell top header bar SHALL use a dark surface with `backdrop-blur` to create a frosted-glass effect when content scrolls beneath it.
5. THE App_Shell sidebar "Sync Garmin" button SHALL use muted styling consistent with the dark theme, with a visible hover state.
6. THE App_Shell brand text ("TriCoach") SHALL use primary foreground color with the accent color applied to a subtle detail (e.g. a dot, underline, or the word "Coach").
7. THE App_Shell main content area background SHALL use the base `--background` dark token.

### Requirement 4: Dashboard Card Redesign

**User Story:** As a user, I want the dashboard cards to have a premium dark aesthetic with clear visual hierarchy, so that I can quickly scan my health and training data.

#### Acceptance Criteria

1. THE Card_Component SHALL use the elevated dark surface color (`--card` token) with a subtle border using low-opacity white (e.g. `oklch(1 0 0 / 8%)`) on dark backgrounds.
2. THE Card_Component SHALL apply a subtle Glassmorphism_Surface effect using `backdrop-blur` and semi-transparent backgrounds on dashboard cards where layering occurs.
3. THE Metric_Tile SHALL use a slightly elevated surface (darker than card, lighter than background) with rounded corners and the dark theme foreground colors for values.
4. THE Metric_Tile primary value text SHALL use a large, bold font weight with high-contrast foreground color (oklch lightness above 0.90).
5. THE Metric_Tile label text SHALL use the uppercase tracking style with muted foreground color.
6. WHEN the Coach Briefing card displays recommendations, THE Card_Component SHALL render recommendation items with subtle dark-surface sub-cards and accent-colored number badges.
7. WHEN the Coach Briefing card displays a caution message, THE Card_Component SHALL render the caution block with a warm amber-tinted dark surface and amber text, avoiding bright yellow on dark backgrounds.
8. THE Dashboard sync status bar SHALL use the dark card surface with muted text and a subtle border, matching the overall dark aesthetic.

### Requirement 5: Chart and Data Visualization Dark Theme

**User Story:** As a user, I want charts and data visualizations to look stunning on dark backgrounds with high-contrast, luminous data lines, so that trends and patterns are immediately visible.

#### Acceptance Criteria

1. THE Chart_System SHALL render all chart backgrounds as transparent or matching the parent card dark surface, with no white or light-colored chart backgrounds.
2. THE Chart_System SHALL use luminous, saturated line colors that contrast against dark backgrounds: cool blue for primary metrics (e.g. sleep score, fitness/CTL), teal/cyan for positive indicators (e.g. HRV, form/TSB), warm amber for fatigue/caution metrics (e.g. ATL), and soft magenta for alert metrics (e.g. resting HR when elevated).
3. THE Chart_System grid lines SHALL use very low-opacity white strokes (e.g. `oklch(1 0 0 / 6%)`) to remain visible without competing with data lines.
4. THE Chart_System axis labels and tick text SHALL use the muted foreground color token for readability against dark backgrounds.
5. THE Chart_System tooltip SHALL use a dark popover surface with light foreground text, rounded corners, and a subtle border matching the dark theme.
6. THE Chart_System reference areas (e.g. TSB zone bands in the fitness chart) SHALL use low-opacity fills of the corresponding status colors to create subtle colored zones on dark backgrounds.
7. THE Chart_System bar elements (e.g. daily TSS bars) SHALL use a muted, semi-transparent fill that is visible against the dark background without overpowering line data.

### Requirement 6: Activity Feed and Detail Dark Theme

**User Story:** As a user, I want the activity feed and detail pages to use the dark premium aesthetic consistently, so that browsing my training history feels cohesive with the rest of the app.

#### Acceptance Criteria

1. THE Activity_Feed list items SHALL use the dark card surface with subtle borders, and hover states SHALL brighten the border or add a subtle glow effect.
2. THE Activity_Feed discipline filter pills SHALL use a dark muted surface for inactive state and the primary accent color for the active/selected state.
3. THE Activity_Feed discipline icon badges SHALL use dark-themed background tints (low-opacity colored backgrounds) that are visible on dark surfaces, replacing the current light-mode pastel backgrounds.
4. WHEN an activity detail page displays stat boxes, THE stat boxes SHALL use the elevated dark surface with muted labels and high-contrast values.
5. WHEN an activity detail page displays an AI analysis card, THE Card_Component SHALL use an accent-tinted dark surface (e.g. subtle blue tint) with accent-colored header text, replacing the current light blue background.
6. THE Activity_Feed empty state message SHALL use muted foreground text on the dark background.

### Requirement 7: AI Coach Chat Dark Theme

**User Story:** As a user, I want the AI coach chat interface to have a sleek dark design that feels like a premium messaging experience, so that conversations with my coach feel immersive.

#### Acceptance Criteria

1. THE Coach_Chat user message bubbles SHALL use the primary accent color as background with white foreground text.
2. THE Coach_Chat assistant message bubbles SHALL use the elevated dark card surface with a subtle border and primary foreground text.
3. THE Coach_Chat input area SHALL use a dark surface with a subtle top border, and the input field SHALL use the dark input token background with visible placeholder text.
4. THE Coach_Chat goals sidebar SHALL use a dark surface matching or slightly different from the main chat background, with subtle borders between goal items.
5. THE Coach_Chat empty state (no messages) SHALL use muted foreground text with suggestion pills using the dark muted surface and subtle hover brightening.
6. THE Coach_Chat typing indicator dots SHALL use the muted foreground color with animation visible against the dark bubble background.
7. THE Coach_Chat markdown-rendered assistant responses SHALL use prose styling adapted for dark backgrounds (light headings, muted body text, accent-colored links).

### Requirement 8: Auth Pages Dark Theme

**User Story:** As a user, I want the login and registration pages to present a premium dark-mode first impression, so that the app feels high-end from the moment I arrive.

#### Acceptance Criteria

1. THE Auth_Pages background SHALL use the base dark `--background` color.
2. THE Auth_Pages card container SHALL use the elevated dark card surface with a subtle border and optional Glassmorphism_Surface effect.
3. THE Auth_Pages form inputs SHALL use the dark `--input` token background with visible borders, placeholder text in muted foreground, and typed text in primary foreground.
4. THE Auth_Pages primary submit button SHALL use the primary accent color with appropriate foreground contrast.
5. THE Auth_Pages brand title ("Personal Coach") SHALL use primary foreground color with the accent color applied to a detail element.
6. THE Auth_Pages error messages SHALL use the negative status color token (magenta/rose-violet) instead of plain red.
7. THE Auth_Pages secondary links (e.g. "Create one", "Sign in") SHALL use the primary accent color or a lighter foreground with underline styling visible on dark backgrounds.

### Requirement 9: Settings, Workouts, and Routes Dark Theme

**User Story:** As a user, I want all secondary pages (settings, workouts, routes) to use the same dark premium aesthetic, so that the entire app feels cohesive.

#### Acceptance Criteria

1. THE Settings page headings and labels SHALL use the dark theme foreground colors with appropriate hierarchy (primary for headings, muted for labels).
2. THE Settings page cards (Athlete Profile, Garmin Connect) SHALL use the dark card surface with subtle borders matching the dashboard card style.
3. THE Settings page form inputs and buttons SHALL use the dark theme input and button tokens consistently.
4. THE Workouts page list items and "New workout" button SHALL use dark theme surfaces and the primary accent color for the action button.
5. THE Routes page list items and "Plan route" button SHALL use dark theme surfaces and the primary accent color for the action button.
6. WHEN the Route_Planner displays a Mapbox map, THE Route_Planner SHALL use a dark-themed Mapbox style (e.g. `mapbox://styles/mapbox/dark-v11`) that matches the app aesthetic.

### Requirement 10: Premium Visual Polish and Gradient Accents

**User Story:** As a user, I want the app to have subtle gradient accents and visual polish that make it feel like a premium product people want to look at, so that the design is "sellable" and visually compelling.

#### Acceptance Criteria

1. THE Theme_System SHALL define at least one premium gradient using the accent color spectrum (e.g. cool violet to electric blue, or cyan to blue) as a CSS custom property for reuse across components.
2. THE App_Shell sidebar active navigation item SHALL optionally use a subtle gradient background instead of a flat accent color.
3. THE Metric_Tile SHALL support an optional subtle gradient border or glow effect for highlighted metrics (e.g. current form score, sleep score).
4. THE Card_Component section label text (uppercase tracking labels like "Recovery", "Activity") SHALL use the muted foreground color with optional accent color for emphasis.
5. THE Dashboard status badges (recovery status, activity status) SHALL use semi-transparent backgrounds tinted with the corresponding status color, creating a subtle glow effect on dark surfaces.
6. THE Auth_Pages card SHALL optionally display a subtle gradient border or ambient glow effect to create a premium first impression.
7. WHEN interactive elements (buttons, links, navigation items) receive focus, THE Theme_System SHALL apply a visible focus ring using the primary accent color with sufficient contrast for keyboard navigation accessibility.

### Requirement 11: Mapbox Dark Map Integration

**User Story:** As a user, I want maps displayed in the app to use a dark style that matches the overall dark theme, so that map views feel integrated rather than jarring.

#### Acceptance Criteria

1. WHEN the Route_Planner renders a Mapbox map, THE Route_Planner SHALL use the `mapbox://styles/mapbox/dark-v11` style or equivalent dark map style.
2. WHEN an activity detail page renders an endurance map, THE endurance map SHALL use the same dark Mapbox style as the Route_Planner.
3. THE map route overlay lines SHALL use the primary accent color or a high-visibility luminous color that contrasts against the dark map tiles.
4. THE map container SHALL have rounded corners and a subtle border matching the dark card style to integrate visually with surrounding content.

### Requirement 12: Typography and Spacing Consistency

**User Story:** As a user, I want consistent typography and spacing throughout the dark-themed app, so that the design feels polished and intentional.

#### Acceptance Criteria

1. THE Theme_System SHALL use the Geist Sans font family as the primary typeface across all components, maintaining the existing `--font-sans` variable.
2. THE page headings (h1 elements on settings, workouts, routes, activities pages) SHALL use primary foreground color with semibold or bold weight.
3. THE section labels (uppercase tracking labels within cards) SHALL use a consistent style: `text-xs`, `font-semibold`, `uppercase`, `tracking-[0.16em]`, and the muted foreground color.
4. THE body text within cards and panels SHALL use `text-sm` with relaxed leading (line-height 1.75 or higher) and secondary foreground color for readability on dark backgrounds.
5. THE tabular numeric values (metrics, stats, durations) SHALL use `tabular-nums` font feature for aligned number columns.
