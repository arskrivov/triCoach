"""Route suggestion service.

Provides intelligent route recommendations based on popularity,
discipline compatibility, distance match, and elevation profile.
"""

import logging
from dataclasses import dataclass, field
from typing import Literal

from supabase import AsyncClient

from app.services.prohibited_areas import check_route_prohibited_areas
from app.services.route_popularity import get_segment_popularity, hash_segment

logger = logging.getLogger(__name__)

# Scoring weights (must sum to 1.0)
WEIGHT_POPULARITY = 0.40
WEIGHT_QUALITY = 0.30
WEIGHT_DISTANCE = 0.20
WEIGHT_ELEVATION = 0.10

# Discipline-to-sport mapping for database queries
_DISCIPLINE_SPORT_MAP: dict[str, str] = {
    "RUN": "RUN",
    "RIDE_ROAD": "RIDE_ROAD",
    "RIDE_GRAVEL": "RIDE_GRAVEL",
}

# Paved surface types for road cycling quality scoring
_PAVED_SURFACES = {"asphalt", "paved", "concrete"}

# Maximum allowed percentage of unknown surface for cycling routes
_MAX_UNKNOWN_PCT_CYCLING = 10.0

# Minimum paved percentage required for RIDE_ROAD discipline
_MIN_PAVED_PCT_ROAD = 90.0


@dataclass
class RouteSuggestion:
    """A scored route recommendation for a given workout context."""

    route_id: str
    name: str
    distance_meters: float
    elevation_gain_meters: float
    popularity_score: float
    discipline_match_score: float
    distance_match_score: float
    elevation_match_score: float
    combined_score: float
    usage_count_90d: int
    surface_breakdown: dict[str, float] = field(default_factory=dict)
    popularity_label: str | None = None


def _calculate_distance_match_score(
    route_distance: float,
    target_distance: float,
) -> float:
    """
    Score how well a route's distance matches the target distance.

    Returns a value between 0.0 and 1.0.
    A perfect match returns 1.0; the score decays as the ratio diverges.
    Uses an exponential decay based on the percentage difference.
    """
    if target_distance <= 0 or route_distance <= 0:
        return 0.0

    ratio = route_distance / target_distance
    # Percentage deviation from 1.0
    deviation = abs(1.0 - ratio)
    # Exponential decay: score = e^(-3 * deviation)
    # At 0% deviation -> 1.0, at 33% -> ~0.37, at 100% -> ~0.05
    import math

    return math.exp(-3.0 * deviation)


def _calculate_elevation_match_score(
    route_elevation: float | None,
    target_elevation: float | None,
) -> float:
    """
    Score how well a route's elevation gain matches the target.

    Returns a value between 0.0 and 1.0.
    If either value is None/zero, returns a neutral 0.5 (no penalty, no bonus).
    """
    if target_elevation is None or target_elevation <= 0:
        return 0.5
    if route_elevation is None or route_elevation <= 0:
        return 0.5

    ratio = route_elevation / target_elevation
    deviation = abs(1.0 - ratio)
    import math

    return math.exp(-3.0 * deviation)


def _calculate_quality_score(
    discipline: str,
    surface_breakdown: dict[str, float] | None,
) -> float:
    """
    Score route quality based on surface/road type match for the discipline.

    Returns a value between 0.0 and 1.0.

    - RIDE_ROAD: Higher score for more paved surface percentage.
    - RIDE_GRAVEL: Higher score for gravel/dirt surfaces.
    - RUN: All surfaces are acceptable; returns a high base score.
    """
    if not surface_breakdown:
        # No surface data available — return a moderate default
        if discipline == "RUN":
            return 0.7
        return 0.5

    if discipline == "RIDE_ROAD":
        paved_pct = sum(
            surface_breakdown.get(s, 0.0) for s in _PAVED_SURFACES
        )
        # Scale: 100% paved -> 1.0, 90% -> 0.9, below 50% -> low
        return min(1.0, paved_pct / 100.0)

    if discipline == "RIDE_GRAVEL":
        gravel_surfaces = {"gravel", "dirt", "fine_gravel", "compacted"}
        gravel_pct = sum(
            surface_breakdown.get(s, 0.0) for s in gravel_surfaces
        )
        paved_pct = sum(
            surface_breakdown.get(s, 0.0) for s in _PAVED_SURFACES
        )
        # Gravel routes benefit from a mix of gravel and some paved
        return min(1.0, (gravel_pct * 0.7 + paved_pct * 0.3) / 100.0)

    # RUN — all surfaces are fine
    return 0.8


def _calculate_popularity_score(usage_count_90d: int, max_usage: int) -> float:
    """
    Normalise popularity to 0.0–1.0 relative to the most popular route in the set.

    If max_usage is 0 (no popularity data), returns 0.0 for all routes.
    """
    if max_usage <= 0:
        return 0.0
    return min(1.0, usage_count_90d / max_usage)


def _calculate_popularity_label(
    usage_count_90d: int,
    popularity_score: float,
    combined_score: float,
    popularity_threshold: float = 0.80,
    combined_score_threshold: float = 0.70,
) -> str | None:
    """
    Derive a human-readable popularity label for a route suggestion.

    Returns:
        "🔥 Popular"     – route is in the top tier of popularity
                           (popularity_score ≥ threshold, i.e. top ~20% by usage)
        "⭐ Recommended" – route has a high combined score but isn't necessarily
                           the most popular
        None             – no special label
    """
    if usage_count_90d > 0 and popularity_score >= popularity_threshold:
        return "🔥 Popular"
    if combined_score >= combined_score_threshold:
        return "⭐ Recommended"
    return None


def _passes_discipline_filter(
    discipline: str,
    surface_breakdown: dict[str, float] | None,
) -> bool:
    """
    Check whether a route passes the discipline-specific surface filter.

    - RIDE_ROAD: Requires ≥90% paved surfaces (asphalt, paved, concrete).
      Routes with <10% unknown surface are still considered valid.
    - RIDE_GRAVEL: No strict surface filtering — gravel routes are scored
      by quality instead.
    - RUN: No surface filtering — all surfaces are acceptable (park paths,
      trails, pedestrian areas are all fine).

    If surface_breakdown is None or empty, the route passes by default
    (no data to filter on).
    """
    if discipline == "RIDE_ROAD":
        if not surface_breakdown:
            # No surface data — cannot confirm paved; exclude
            return False

        total = sum(surface_breakdown.values())
        if total <= 0:
            return False

        paved_pct = (
            sum(surface_breakdown.get(s, 0.0) for s in _PAVED_SURFACES)
            / total
            * 100.0
        )
        unknown_pct = (
            surface_breakdown.get("unknown", 0.0) / total * 100.0
        )

        # Routes with <10% unknown are still valid — treat unknown as
        # potentially paved for the threshold check.
        if unknown_pct < _MAX_UNKNOWN_PCT_CYCLING:
            effective_paved_pct = (
                (sum(surface_breakdown.get(s, 0.0) for s in _PAVED_SURFACES)
                 + surface_breakdown.get("unknown", 0.0))
                / total
                * 100.0
            )
        else:
            effective_paved_pct = paved_pct

        return effective_paved_pct >= _MIN_PAVED_PCT_ROAD

    # RIDE_GRAVEL and RUN: no strict surface filtering
    return True


def _extract_route_segment_hashes(geojson: dict | None) -> list[str]:
    """
    Extract segment hashes from a route's GeoJSON for popularity lookup.

    Walks the LineString coordinates and hashes consecutive pairs at ~100m resolution.
    """
    if not geojson:
        return []

    # Handle Feature wrapper
    geometry = geojson
    if geojson.get("type") == "Feature":
        geometry = geojson.get("geometry", {})
    if geojson.get("type") == "FeatureCollection":
        features = geojson.get("features", [])
        if features:
            geometry = features[0].get("geometry", {})

    coords = geometry.get("coordinates", [])
    if not coords or geometry.get("type") not in ("LineString", "MultiLineString"):
        return []

    # Flatten MultiLineString
    if geometry.get("type") == "MultiLineString":
        flat_coords = []
        for line in coords:
            flat_coords.extend(line)
        coords = flat_coords

    hashes: list[str] = []
    for i in range(len(coords) - 1):
        # GeoJSON coordinates are [lng, lat, (optional elevation)]
        lng1, lat1 = coords[i][0], coords[i][1]
        lng2, lat2 = coords[i + 1][0], coords[i + 1][1]
        hashes.append(hash_segment(lat1, lng1, lat2, lng2))

    return hashes


async def get_route_suggestions(
    user_id: str,
    discipline: Literal["RUN", "RIDE_ROAD", "RIDE_GRAVEL"],
    target_distance_meters: float,
    start_lat: float,
    start_lng: float,
    target_elevation_gain: float | None = None,
    limit: int = 10,
    sb: AsyncClient | None = None,
) -> list[RouteSuggestion]:
    """
    Returns ranked route suggestions based on:
    - Popularity (40%): Usage count in last 90 days for this discipline
    - Route quality (30%): Surface/road type match for discipline
    - Distance match (20%): Proximity to target distance
    - Elevation match (10%): Proximity to target elevation gain

    For RIDE_ROAD: Filters to routes with ≥90% paved segments (handled in Task 5.3)
    For all cycling: Excludes routes through prohibited areas
    """
    if sb is None:
        logger.error("Supabase client is required for get_route_suggestions")
        return []

    sport = _DISCIPLINE_SPORT_MAP.get(discipline, discipline)

    # ---- 1. Fetch candidate routes from the database ----
    try:
        response = await sb.table("routes").select(
            "id, name, sport, distance_meters, elevation_gain_meters, "
            "geojson, surface_breakdown, start_lat, start_lng"
        ).eq("sport", sport).execute()
    except Exception as e:
        logger.error("Failed to query routes: %s", e)
        return []

    routes = response.data or []
    if not routes:
        logger.debug("No routes found for sport=%s", sport)
        return []

    # ---- 2. For cycling disciplines, exclude routes through prohibited areas ----
    if discipline in ("RIDE_ROAD", "RIDE_GRAVEL"):
        filtered_routes: list[dict] = []
        for route in routes:
            geojson = route.get("geojson")
            if geojson:
                prohibited = await check_route_prohibited_areas(geojson, sb)
                if prohibited:
                    logger.debug(
                        "Excluding route %s — passes through %d prohibited area(s)",
                        route.get("id"),
                        len(prohibited),
                    )
                    continue
            filtered_routes.append(route)
        routes = filtered_routes

    if not routes:
        logger.debug("No routes remaining after prohibited area filtering")
        return []

    # ---- 2b. Apply discipline-specific surface filtering ----
    if discipline == "RIDE_ROAD":
        surface_filtered: list[dict] = []
        for route in routes:
            surface = route.get("surface_breakdown")
            if _passes_discipline_filter(discipline, surface):
                surface_filtered.append(route)
            else:
                logger.debug(
                    "Excluding route %s — does not meet RIDE_ROAD paved surface threshold",
                    route.get("id"),
                )
        routes = surface_filtered

    if not routes:
        logger.debug("No routes remaining after discipline surface filtering")
        return []

    # ---- 3. Gather popularity data for all candidate routes ----
    # Collect all segment hashes across all routes
    route_hashes_map: dict[str, list[str]] = {}
    all_hashes: list[str] = []
    for route in routes:
        hashes = _extract_route_segment_hashes(route.get("geojson"))
        route_hashes_map[route["id"]] = hashes
        all_hashes.extend(hashes)

    # Deduplicate for the popularity query
    unique_hashes = list(set(all_hashes))
    segment_popularity: dict[str, int] = {}
    if unique_hashes:
        segment_popularity = await get_segment_popularity(
            unique_hashes, discipline, sb
        )

    # Calculate per-route usage counts (sum of segment popularities)
    route_usage: dict[str, int] = {}
    for route in routes:
        rid = route["id"]
        hashes = route_hashes_map.get(rid, [])
        usage = sum(segment_popularity.get(h, 0) for h in hashes)
        route_usage[rid] = usage

    max_usage = max(route_usage.values()) if route_usage else 0

    # ---- 4. Score each route ----
    suggestions: list[RouteSuggestion] = []
    for route in routes:
        rid = route["id"]
        distance = route.get("distance_meters") or 0.0
        elevation = route.get("elevation_gain_meters")
        surface = route.get("surface_breakdown") or {}
        usage_90d = route_usage.get(rid, 0)

        popularity_score = _calculate_popularity_score(usage_90d, max_usage)
        quality_score = _calculate_quality_score(discipline, surface)
        distance_score = _calculate_distance_match_score(distance, target_distance_meters)
        elevation_score = _calculate_elevation_match_score(elevation, target_elevation_gain)

        combined = (
            WEIGHT_POPULARITY * popularity_score
            + WEIGHT_QUALITY * quality_score
            + WEIGHT_DISTANCE * distance_score
            + WEIGHT_ELEVATION * elevation_score
        )

        popularity_label = _calculate_popularity_label(
            usage_90d, popularity_score, combined,
        )

        suggestions.append(
            RouteSuggestion(
                route_id=rid,
                name=route.get("name", ""),
                distance_meters=distance,
                elevation_gain_meters=elevation or 0.0,
                popularity_score=popularity_score,
                discipline_match_score=quality_score,
                distance_match_score=distance_score,
                elevation_match_score=elevation_score,
                combined_score=round(combined, 4),
                usage_count_90d=usage_90d,
                surface_breakdown=surface,
                popularity_label=popularity_label,
            )
        )

    # ---- 5. Sort by combined score descending and limit ----
    suggestions.sort(key=lambda s: s.combined_score, reverse=True)
    return suggestions[:limit]
