# Tech Stack

## Frontend

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 + shadcn/ui |
| HTTP client | Axios (`lib/api.ts`) with Supabase JWT interceptor |
| Auth | Supabase Auth (`@supabase/ssr`) |
| Maps | Mapbox GL JS |
| Charts | Recharts |
| Icons | Lucide React |
| Markdown | react-markdown |

## Backend

| Concern | Choice |
|---|---|
| Framework | FastAPI (async) |
| Language | Python 3.11+ |
| Database client | Supabase Python SDK (async) — no ORM, raw Supabase queries |
| Data models | Pydantic v2 `BaseModel` row types in `app/models.py` |
| Config | `pydantic-settings` reading from `.env` |
| Auth | Supabase JWT validation via `sb.auth.get_user(token)` |
| Garmin | `garminconnect` (unofficial Python library, pinned fork) |
| Garmin session | Fernet-encrypted, stored in `users.garmin_session_data` |
| AI | OpenAI Python SDK — `gpt-4.1` for coach, `gpt-4.1-mini` for analysis |
| Background jobs | Celery + Redis |
| Routing engine | GraphHopper API |

## Infrastructure

- **Database**: Supabase (PostgreSQL) — schema managed via SQL migrations run in Supabase SQL Editor
- **Auth**: Supabase Auth; a DB trigger auto-creates a `public.users` row on signup
- **Frontend proxy**: Next.js rewrites `/api/backend/*` to the FastAPI backend (see `next.config.ts`)
- **Containerisation**: Docker + `docker-compose.yml` for local development

## Common commands

### Frontend
```bash
# Install dependencies
cd frontend && npm install

# Development server (run manually — do not use as a background command)
cd frontend && npm run dev

# Production build
cd frontend && npm run build

# Lint
cd frontend && npm run lint
```

### Backend
```bash
# Create/activate virtualenv
cd backend && python -m venv .venv && source .venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Run dev server (run manually)
cd backend && uvicorn app.main:app --reload --port 8000

# Run tests
cd backend && pytest

# Run a single test file
cd backend && pytest tests/test_activities.py -v
```

### Docker (full stack)
```bash
docker-compose up --build
```

## Environment variables

Backend `.env` keys (see `app/config.py`):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `GARMIN_ENCRYPTION_KEY` (Fernet key)
- `OPENAI_API_KEY`, `OPENAI_COACH_MODEL`, `OPENAI_ANALYSIS_MODEL`
- `GRAPHHOPPER_API_KEY`
- `REDIS_URL`

Frontend `.env.local` keys:
- `NEXT_PUBLIC_API_URL` — FastAPI base URL (defaults to `http://localhost:8000`)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
