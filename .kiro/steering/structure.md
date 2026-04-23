# Project Structure

Monorepo with two independent apps: `frontend/` (Next.js) and `backend/` (FastAPI).

```
/
├── frontend/               # Next.js app
│   ├── app/
│   │   ├── (app)/          # Authenticated route group
│   │   │   ├── dashboard/  # Dashboard page + card components
│   │   │   ├── activities/ # Activity feed + detail view
│   │   │   ├── coach/      # AI coach chat page
│   │   │   ├── routes/     # Route planner page
│   │   │   ├── settings/   # Garmin connect + athlete profile
│   │   │   ├── workouts/   # Workout builder
│   │   │   └── layout.tsx  # Shared authenticated shell
│   │   ├── (auth)/         # Unauthenticated route group (login, register)
│   │   └── layout.tsx      # Root layout (fonts, providers)
│   ├── components/
│   │   ├── ui/             # shadcn/ui primitives (button, card, input, etc.)
│   │   └── providers.tsx   # Client-side context providers
│   └── lib/
│       ├── api.ts          # Axios instance with Supabase JWT interceptor
│       ├── types.ts        # Shared TypeScript types mirroring backend schemas
│       ├── format.ts       # Display formatting helpers (pace, distance, HR, etc.)
│       ├── garmin-sync.ts  # Garmin sync custom events (browser)
│       ├── garmin-sync-api.ts # Garmin sync API calls
│       └── supabase/       # Supabase client/server helpers
│
├── backend/
│   └── app/
│       ├── main.py         # FastAPI app, CORS, router registration
│       ├── config.py       # pydantic-settings config (reads .env)
│       ├── database.py     # Supabase async client singleton
│       ├── models.py       # Pydantic row models (one per DB table)
│       ├── routers/        # One file per resource (activities, auth, coach,
│       │                   #   dashboard, fitness, garmin, routes, sync, workouts)
│       ├── services/       # Business logic called by routers
│       │   ├── auth.py     # get_current_user FastAPI dependency
│       │   ├── dashboard.py # Dashboard aggregation + briefing generation
│       │   ├── fitness.py  # CTL/ATL/TSB fitness timeline
│       │   ├── garmin.py   # Garmin session management
│       │   ├── garmin_sync.py # Garmin data sync logic
│       │   ├── coach_context.py # AI coach context builder
│       │   ├── route_generator.py # GraphHopper route generation
│       │   └── athlete_profile.py # Athlete profile helpers
│       └── tasks/          # Celery background tasks
│
└── docker-compose.yml      # Local dev: backend + Redis
```

## Key conventions

### Backend

- **No ORM.** All DB access goes through the Supabase async client (`sb.table(...).select/insert/update/upsert`). Never introduce SQLAlchemy.
- **Row models** live in `app/models.py` as Pydantic `BaseModel` classes (e.g. `ActivityRow`, `DailyHealthRow`). These are used to parse Supabase response dicts.
- **Response schemas** are defined inline in each router file as separate Pydantic models — they are not the same as row models.
- **Auth** is always enforced via `Depends(get_current_user)` in router functions. Never skip this on protected endpoints.
- **All routers** are registered in `main.py` under the `/api/v1` prefix.
- **Services** contain business logic; routers stay thin (validate input, call service, return response).
- **Config** is accessed via the `settings` singleton from `app/config.py`. Never read `os.environ` directly.
- **Async throughout** — all router functions and service functions are `async def`.

### Frontend

- **API calls** always go through the `api` Axios instance from `lib/api.ts`. Never use `fetch` directly for backend calls.
- **Types** shared across the frontend live in `lib/types.ts` and mirror backend response shapes.
- **Page components** are server components by default. Interactive components that need state or effects get `"use client"` at the top.
- **Component co-location**: page-specific components (cards, sections) live alongside their `page.tsx` in the same folder. Only truly shared components go in `components/`.
- **Styling**: Tailwind utility classes only. No CSS modules, no inline styles. Use `cn()` from `lib/utils.ts` for conditional class merging.
- **shadcn/ui** primitives are in `components/ui/`. Add new primitives with `npx shadcn add <component>` — do not hand-write them.
- **Timezone**: always read from `Intl.DateTimeFormat().resolvedOptions().timeZone` on the client and pass as `X-User-Timezone` header to the backend.

### Database

- Schema changes are applied as raw SQL in the Supabase SQL Editor — there is no migration tool or ORM migration system.
- All tables are in the `public` schema.
- Row-level security is handled by Supabase Auth; the backend uses the service role key and enforces user scoping manually via `.eq("user_id", current_user.id)`.

### Disciplines

The canonical discipline enum used in both frontend and backend:
`SWIM | RUN | RIDE_ROAD | RIDE_GRAVEL | STRENGTH | YOGA | MOBILITY | OTHER`
