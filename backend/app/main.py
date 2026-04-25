from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import activities, auth, coach, dashboard, fitness, garmin, plans, routes, sync, workouts

app = FastAPI(
    title="Personal Coach API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


app.include_router(auth.router, prefix="/api/v1")
app.include_router(garmin.router, prefix="/api/v1")
app.include_router(sync.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(activities.router, prefix="/api/v1")
app.include_router(workouts.router, prefix="/api/v1")
app.include_router(routes.router, prefix="/api/v1")
app.include_router(coach.router, prefix="/api/v1")
app.include_router(plans.router, prefix="/api/v1")
app.include_router(fitness.router, prefix="/api/v1")
