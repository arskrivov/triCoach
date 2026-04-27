import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from supabase import AsyncClient

from app.database import get_supabase
from app.models import UserRow
from app.services.auth import get_current_user
from app.services.route_generator import (
    RouteGenerationError,
    RouteGenerationRateLimitError,
    generate_routes,
)
from app.services.garmin_course_sync import sync_route_to_garmin
from app.services.prohibited_areas import check_route_prohibited_areas
from app.services.route_suggestions import get_route_suggestions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/routes", tags=["routes"])


class RouteGenerateRequest(BaseModel):
    sport: str
    start_lat: float
    start_lng: float
    target_distance_km: float
    end_lat: float | None = None
    end_lng: float | None = None
    options_count: int = 3


class RouteOptionResponse(BaseModel):
    seed: int
    geojson: Any
    distance_km: float
    elevation_gain_m: float
    elevation_loss_m: float
    estimated_duration_seconds: int
    surface_breakdown: dict[str, float] | None = None


class RouteSaveRequest(BaseModel):
    name: str
    sport: str
    start_lat: float
    start_lng: float
    end_lat: float | None = None
    end_lng: float | None = None
    is_loop: bool = True
    distance_meters: float | None = None
    elevation_gain_meters: float | None = None
    elevation_loss_meters: float | None = None
    estimated_duration_seconds: int | None = None
    geojson: Any = None
    surface_breakdown: dict[str, float] | None = None


class RouteResponse(BaseModel):
    id: str
    name: str
    sport: str
    start_lat: float
    start_lng: float
    end_lat: float | None
    end_lng: float | None
    is_loop: bool
    distance_meters: float | None
    elevation_gain_meters: float | None
    elevation_loss_meters: float | None
    estimated_duration_seconds: int | None
    geojson: Any
    gpx_data: str | None
    garmin_course_id: int | None = None
    surface_breakdown: dict | None = None


@router.post("/generate", response_model=list[RouteOptionResponse])
async def generate(
    body: RouteGenerateRequest,
    current_user: UserRow = Depends(get_current_user),
):
    sport = body.sport.upper()
    if sport not in ("RUN", "RIDE_ROAD", "RIDE_GRAVEL"):
        raise HTTPException(status_code=400, detail="sport must be RUN, RIDE_ROAD, or RIDE_GRAVEL")
    try:
        options = await generate_routes(
            sport=sport,
            start_lat=body.start_lat,
            start_lng=body.start_lng,
            target_distance_km=body.target_distance_km,
            end_lat=body.end_lat,
            end_lng=body.end_lng,
            options_count=min(body.options_count, 3),
        )
    except RouteGenerationRateLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except RouteGenerationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return [
        RouteOptionResponse(
            seed=o.seed,
            geojson=o.geojson,
            distance_km=o.distance_km,
            elevation_gain_m=o.elevation_gain_m,
            elevation_loss_m=o.elevation_loss_m,
            estimated_duration_seconds=o.estimated_duration_seconds,
            surface_breakdown=o.surface_breakdown,
        )
        for o in options
    ]


@router.post("", response_model=RouteResponse, status_code=status.HTTP_201_CREATED)
async def save_route(
    body: RouteSaveRequest,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    payload = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "sport": body.sport.upper(),
        **body.model_dump(exclude={"sport"}),
    }
    res = await sb.table("routes").insert(payload).execute()
    return res.data[0]


@router.get("", response_model=list[RouteResponse])
async def list_routes(
    sport: str | None = Query(None),
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    q = sb.table("routes").select("*").eq("user_id", current_user.id).order("created_at", desc=True)
    if sport:
        q = q.eq("sport", sport.upper())
    res = await q.execute()
    return res.data or []


class RouteSuggestionRequest(BaseModel):
    discipline: str
    target_distance_meters: float
    start_lat: float
    start_lng: float
    target_elevation_gain: float | None = None


class RouteSuggestionResponse(BaseModel):
    id: str
    name: str
    distance_meters: float
    elevation_gain_meters: float | None
    popularity_score: float
    combined_score: float
    usage_count_90d: int
    surface_breakdown: dict[str, float] | None
    popularity_label: str | None = None


@router.post("/suggestions", response_model=list[RouteSuggestionResponse])
async def get_suggestions(
    body: RouteSuggestionRequest,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    discipline = body.discipline.upper()
    if discipline not in ("RUN", "RIDE_ROAD", "RIDE_GRAVEL"):
        raise HTTPException(
            status_code=400,
            detail="discipline must be RUN, RIDE_ROAD, or RIDE_GRAVEL",
        )

    suggestions = await get_route_suggestions(
        user_id=current_user.id,
        discipline=discipline,
        target_distance_meters=body.target_distance_meters,
        start_lat=body.start_lat,
        start_lng=body.start_lng,
        target_elevation_gain=body.target_elevation_gain,
        sb=sb,
    )

    return [
        RouteSuggestionResponse(
            id=s.route_id,
            name=s.name,
            distance_meters=s.distance_meters,
            elevation_gain_meters=s.elevation_gain_meters if s.elevation_gain_meters else None,
            popularity_score=s.popularity_score,
            combined_score=s.combined_score,
            usage_count_90d=s.usage_count_90d,
            surface_breakdown=s.surface_breakdown if s.surface_breakdown else None,
            popularity_label=s.popularity_label,
        )
        for s in suggestions
    ]


class GarminSyncResponse(BaseModel):
    garmin_course_id: int
    message: str


_CYCLING_SPORTS = {"RIDE_ROAD", "RIDE_GRAVEL"}


@router.post("/{route_id}/sync-garmin", response_model=GarminSyncResponse)
async def sync_to_garmin(
    route_id: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    # Fetch the route and verify ownership
    res = await sb.table("routes").select("*").eq("id", route_id).eq(
        "user_id", current_user.id
    ).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Route not found")

    route = res.data[0]
    sport = (route.get("sport") or "").upper()

    if sport not in _CYCLING_SPORTS:
        raise HTTPException(
            status_code=400,
            detail="Garmin course sync is only available for cycling routes (RIDE_ROAD, RIDE_GRAVEL)",
        )

    result = await sync_route_to_garmin(
        route_id=route_id,
        user_id=current_user.id,
        sb=sb,
    )

    return GarminSyncResponse(
        garmin_course_id=result.garmin_course_id,
        message=f"Course '{result.course_name}' synced to Garmin successfully",
    )


class ProhibitedAreaCheck(BaseModel):
    has_prohibited_areas: bool
    areas: list[dict]


@router.get("/{route_id}/check-prohibited", response_model=ProhibitedAreaCheck)
async def check_prohibited_areas(
    route_id: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    # Fetch the route and verify ownership
    res = await sb.table("routes").select("*").eq("id", route_id).eq(
        "user_id", current_user.id
    ).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Route not found")

    route = res.data[0]
    geojson = route.get("geojson")

    areas = await check_route_prohibited_areas(geojson=geojson or {}, sb=sb)

    return ProhibitedAreaCheck(
        has_prohibited_areas=len(areas) > 0,
        areas=areas,
    )


@router.get("/{route_id}", response_model=RouteResponse)
async def get_route(
    route_id: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    res = await sb.table("routes").select("*").eq("id", route_id).eq(
        "user_id", current_user.id
    ).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Route not found")
    return res.data[0]


@router.delete("/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_route(
    route_id: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    existing = await sb.table("routes").select("id").eq("id", route_id).eq(
        "user_id", current_user.id
    ).limit(1).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Route not found")
    await sb.table("routes").delete().eq("id", route_id).execute()


@router.get("/{route_id}/gpx")
async def export_gpx(
    route_id: str,
    current_user: UserRow = Depends(get_current_user),
    sb: AsyncClient = Depends(get_supabase),
):
    res = await sb.table("routes").select("name,gpx_data,geojson").eq("id", route_id).eq(
        "user_id", current_user.id
    ).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Route not found")
    r = res.data[0]
    gpx = r.get("gpx_data") or _geojson_to_gpx(r.get("geojson"), r.get("name", "Route"))
    filename = f"{r.get('name', 'route').replace(' ', '_')}.gpx"
    return Response(
        content=gpx,
        media_type="application/gpx+xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _geojson_to_gpx(geojson: dict | None, name: str) -> str:
    if not geojson:
        return "<gpx></gpx>"
    coords = geojson.get("geometry", {}).get("coordinates", [])
    trkpts = "\n".join(
        f'    <trkpt lat="{c[1]}" lon="{c[0]}">'
        + (f"<ele>{c[2]}</ele>" if len(c) > 2 else "")
        + "</trkpt>"
        for c in coords
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PersonalCoach">
  <trk>
    <name>{name}</name>
    <trkseg>
{trkpts}
    </trkseg>
  </trk>
</gpx>"""
