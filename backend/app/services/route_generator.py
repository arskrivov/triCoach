"""GraphHopper-based route generation service."""

import logging
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

GRAPHHOPPER_BASE = "https://graphhopper.com/api/1"
ROUTE_DETAILS = ["surface", "road_class", "bike_network", "foot_network"]

PROFILE_MAP = {
    "RUN": "foot",
    "RIDE_ROAD": "bike",
    "RIDE_GRAVEL": "bike",
}

_SPEEDS = {"RUN": 3.0, "RIDE_ROAD": 7.0, "RIDE_GRAVEL": 5.0}


class RouteGenerationError(Exception):
    pass


class RouteGenerationRateLimitError(RouteGenerationError):
    pass


@dataclass
class RouteOption:
    geojson: dict
    distance_km: float
    elevation_gain_m: float
    elevation_loss_m: float
    estimated_duration_seconds: int
    seed: int
    surface_breakdown: dict[str, float] | None = None


def _seed_offset_for_sport(sport: str) -> int:
    return {"RUN": 0, "RIDE_ROAD": 0, "RIDE_GRAVEL": 20}.get(sport, 0)


def _snap_preventions_for_sport(sport: str) -> list[str]:
    if sport == "RUN":
        return ["motorway", "trunk", "tunnel", "ferry"]
    if sport == "RIDE_ROAD":
        return ["motorway", "trunk", "ferry"]
    return ["motorway", "trunk", "ferry", "tunnel"]


def _custom_model_for_sport(sport: str) -> dict[str, Any]:
    if sport == "RUN":
        return {
            "priority": [
                {"if": "road_environment == TUNNEL", "multiply_by": "0.05"},
                {"if": "road_class == MOTORWAY || road_class == TRUNK || road_class == PRIMARY", "multiply_by": "0.05"},
                {"if": "road_class == SECONDARY", "multiply_by": "0.3"},
                {"if": "road_class == CYCLEWAY || road_class == FOOTWAY || road_class == PATH || road_class == TRACK || road_class == LIVING_STREET", "multiply_by": "1.6"},
                {"if": "foot_network != MISSING", "multiply_by": "1.15"},
                {"if": "surface == ASPHALT || surface == PAVED || surface == COMPACTED", "multiply_by": "1.1"},
            ],
            "distance_influence": 40,
        }

    if sport == "RIDE_ROAD":
        return {
            "priority": [
                {"if": "road_environment == TUNNEL", "multiply_by": "0.1"},
                {"if": "road_class == MOTORWAY || road_class == TRUNK || road_class == STEPS", "multiply_by": "0"},
                {"if": "road_class == FOOTWAY || road_class == PATH", "multiply_by": "0.2"},
                {"if": "road_class == TRACK", "multiply_by": "0.1"},
                {"if": "road_class == PRIMARY", "multiply_by": "0.45"},
                {"if": "road_class == SECONDARY", "multiply_by": "0.75"},
                {"if": "road_class == CYCLEWAY", "multiply_by": "1.8"},
                {"if": "bike_network != MISSING", "multiply_by": "1.25"},
                {"if": "surface == ASPHALT || surface == PAVED || surface == CONCRETE", "multiply_by": "1.45"},
                {"if": "surface == GRAVEL || surface == DIRT || surface == GROUND || surface == SAND", "multiply_by": "0.08"},
            ],
            "distance_influence": 90,
        }

    return {
        "priority": [
            {"if": "road_environment == TUNNEL", "multiply_by": "0.2"},
            {"if": "road_class == MOTORWAY || road_class == TRUNK || road_class == STEPS", "multiply_by": "0"},
            {"if": "road_class == PRIMARY", "multiply_by": "0.25"},
            {"if": "road_class == SECONDARY", "multiply_by": "0.5"},
            {"if": "road_class == TRACK || road_class == PATH", "multiply_by": "1.5"},
            {"if": "road_class == CYCLEWAY", "multiply_by": "1.2"},
            {"if": "bike_network != MISSING", "multiply_by": "1.1"},
            {"if": "surface == GRAVEL || surface == DIRT || surface == GROUND || surface == COMPACTED", "multiply_by": "1.6"},
            {"if": "surface == ASPHALT || surface == PAVED || surface == CONCRETE", "multiply_by": "0.7"},
            {"if": "surface == SAND", "multiply_by": "0.2"},
        ],
        "distance_influence": 65,
    }


def _build_route_payload(
    *,
    sport: str,
    start_lat: float,
    start_lng: float,
    target_distance_km: float | None = None,
    seed: int | None = None,
    end_lat: float | None = None,
    end_lng: float | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "profile": PROFILE_MAP.get(sport, "foot"),
        "points": [[start_lng, start_lat]],
        "snap_preventions": _snap_preventions_for_sport(sport),
        "points_encoded": False,
        "elevation": True,
        "details": ROUTE_DETAILS,
        "ch.disable": True,
        "custom_model": _custom_model_for_sport(sport),
    }
    if end_lat is None or end_lng is None:
        payload["algorithm"] = "round_trip"
        payload["round_trip.distance"] = int((target_distance_km or 10) * 1000)
        payload["round_trip.seed"] = seed or 0
    else:
        payload["points"] = [[start_lng, start_lat], [end_lng, end_lat]]
    return payload


def _build_free_route_params(
    *,
    sport: str,
    start_lat: float,
    start_lng: float,
    target_distance_km: float | None = None,
    seed: int | None = None,
    end_lat: float | None = None,
    end_lng: float | None = None,
) -> list[tuple[str, str]]:
    params: list[tuple[str, str]] = [
        ("profile", PROFILE_MAP.get(sport, "foot")),
        ("points_encoded", "false"),
        ("elevation", "true"),
    ]
    for snap in _snap_preventions_for_sport(sport):
        params.append(("snap_prevention", snap))
    for detail in ROUTE_DETAILS:
        params.append(("details", detail))

    if end_lat is None or end_lng is None:
        params.extend(
            [
                ("point", f"{start_lat},{start_lng}"),
                ("algorithm", "round_trip"),
                ("round_trip.distance", str(int((target_distance_km or 10) * 1000))),
                ("round_trip.seed", str(seed or 0)),
            ]
        )
    else:
        params.extend(
            [
                ("point", f"{start_lat},{start_lng}"),
                ("point", f"{end_lat},{end_lng}"),
            ]
        )
    return params


def _weighted_sum(details: dict[str, list[list[Any]]], key: str, weights: dict[str, float]) -> float:
    total = 0.0
    for start_idx, end_idx, value in details.get(key, []):
        total += (end_idx - start_idx) * weights.get(str(value).lower(), 0.0)
    return total


def _score_route(data: dict, sport: str) -> float:
    path = data.get("paths", [{}])[0]
    details = path.get("details", {})

    road_weights = {
        "cycleway": 1.3,
        "residential": 0.5,
        "living_street": 0.7,
        "secondary": -0.3,
        "primary": -1.0,
        "trunk": -2.0,
        "motorway": -3.0,
        "track": -0.8,
        "footway": -0.8,
        "path": -0.8,
    }
    gravel_road_weights = {
        "track": 1.2,
        "path": 1.1,
        "cycleway": 0.4,
        "residential": 0.2,
        "secondary": -0.2,
        "primary": -1.0,
        "trunk": -2.0,
        "motorway": -3.0,
    }
    run_road_weights = {
        "footway": 1.5,
        "path": 1.3,
        "living_street": 0.8,
        "track": 1.0,
        "cycleway": 0.4,
        "residential": 0.2,
        "secondary": -0.7,
        "primary": -1.5,
        "trunk": -2.5,
        "motorway": -3.0,
    }

    road_surface_weights = {
        "asphalt": 1.4,
        "paved": 1.4,
        "concrete": 1.3,
        "cobblestone": -0.8,
        "gravel": -1.8,
        "dirt": -1.8,
        "ground": -1.6,
        "sand": -2.0,
        "compacted": -0.3,
    }
    gravel_surface_weights = {
        "gravel": 1.7,
        "dirt": 1.6,
        "ground": 1.5,
        "compacted": 1.3,
        "unpaved": 1.2,
        "asphalt": -0.8,
        "paved": -0.8,
        "concrete": -0.7,
        "sand": -1.2,
    }
    run_surface_weights = {
        "compacted": 1.0,
        "paved": 0.6,
        "asphalt": 0.5,
        "gravel": 0.8,
        "dirt": 0.9,
        "ground": 0.8,
        "sand": -0.8,
    }

    if sport == "RUN":
        return (
            _weighted_sum(details, "road_class", run_road_weights)
            + _weighted_sum(details, "surface", run_surface_weights)
            + _weighted_sum(details, "foot_network", {"local": 0.8, "regional": 0.9, "national": 0.9, "international": 0.8})
        )

    if sport == "RIDE_ROAD":
        return (
            _weighted_sum(details, "road_class", road_weights)
            + _weighted_sum(details, "surface", road_surface_weights)
            + _weighted_sum(details, "bike_network", {"local": 0.5, "regional": 0.8, "national": 0.8, "international": 0.7})
        )

    return (
        _weighted_sum(details, "road_class", gravel_road_weights)
        + _weighted_sum(details, "surface", gravel_surface_weights)
        + _weighted_sum(details, "bike_network", {"local": 0.2, "regional": 0.3, "national": 0.2, "international": 0.1})
    )


async def generate_routes(
    sport: Literal["RUN", "RIDE_ROAD", "RIDE_GRAVEL"],
    start_lat: float,
    start_lng: float,
    target_distance_km: float,
    end_lat: float | None = None,
    end_lng: float | None = None,
    options_count: int = 3,
) -> list[RouteOption]:
    api_key = settings.graphhopper_api_key
    if not api_key:
        raise RouteGenerationError("GRAPHHOPPER_API_KEY not configured.")

    async with httpx.AsyncClient(timeout=30) as client:
        if end_lat is None or end_lng is None:
            return await _generate_loops(
                client=client,
                sport=sport,
                lat=start_lat,
                lng=start_lng,
                target_km=target_distance_km,
                count=options_count,
                api_key=api_key,
            )

        route = await _generate_point_to_point(
            client=client,
            sport=sport,
            start_lat=start_lat,
            start_lng=start_lng,
            end_lat=end_lat,
            end_lng=end_lng,
            api_key=api_key,
        )
        return [route] if route else []


async def _graphhopper_route_request(
    client: httpx.AsyncClient,
    *,
    sport: str,
    start_lat: float,
    start_lng: float,
    target_distance_km: float | None,
    seed: int | None,
    end_lat: float | None,
    end_lng: float | None,
    api_key: str,
) -> dict:
    payload = _build_route_payload(
        sport=sport,
        start_lat=start_lat,
        start_lng=start_lng,
        target_distance_km=target_distance_km,
        seed=seed,
        end_lat=end_lat,
        end_lng=end_lng,
    )
    resp = await client.post(f"{GRAPHHOPPER_BASE}/route", params={"key": api_key}, json=payload)
    if resp.status_code == 429:
        raise RouteGenerationRateLimitError("GraphHopper rate limit reached. Wait a minute and try again.")
    if resp.status_code == 400 and "Free packages cannot use flexible mode" in resp.text:
        free_params = _build_free_route_params(
            sport=sport,
            start_lat=start_lat,
            start_lng=start_lng,
            target_distance_km=target_distance_km,
            seed=seed,
            end_lat=end_lat,
            end_lng=end_lng,
        )
        free_resp = await client.get(f"{GRAPHHOPPER_BASE}/route", params=[*free_params, ("key", api_key)])
        if free_resp.status_code == 429:
            raise RouteGenerationRateLimitError("GraphHopper rate limit reached. Wait a minute and try again.")
        free_resp.raise_for_status()
        return free_resp.json()
    resp.raise_for_status()
    return resp.json()


async def _generate_loops(
    client: httpx.AsyncClient,
    sport: str,
    lat: float,
    lng: float,
    target_km: float,
    count: int,
    api_key: str,
) -> list[RouteOption]:
    scored_routes: list[tuple[float, RouteOption]] = []
    rate_limited = False
    seed_offset = _seed_offset_for_sport(sport)

    for local_seed in range(count):
        seed = seed_offset + local_seed
        try:
            data = await _graphhopper_route_request(
                client,
                sport=sport,
                start_lat=lat,
                start_lng=lng,
                target_distance_km=target_km,
                seed=seed,
                end_lat=None,
                end_lng=None,
                api_key=api_key,
            )
            option = _parse_route(data, local_seed, sport)
            if option:
                scored_routes.append((_score_route(data, sport), option))
        except RouteGenerationRateLimitError:
            rate_limited = True
            logger.warning("GraphHopper loop seed=%d hit rate limit", seed)
        except Exception as e:
            logger.warning("GraphHopper loop seed=%d failed: %s", seed, e)

    if scored_routes:
        scored_routes.sort(key=lambda item: item[0], reverse=True)
        return [route for _, route in scored_routes[:count]]
    if rate_limited:
        raise RouteGenerationRateLimitError("GraphHopper rate limit reached. Wait a minute and try again.")
    raise RouteGenerationError("GraphHopper could not generate a route for this request.")


async def _generate_point_to_point(
    client: httpx.AsyncClient,
    sport: str,
    start_lat: float,
    start_lng: float,
    end_lat: float,
    end_lng: float,
    api_key: str,
) -> RouteOption | None:
    try:
        data = await _graphhopper_route_request(
            client,
            sport=sport,
            start_lat=start_lat,
            start_lng=start_lng,
            target_distance_km=None,
            seed=None,
            end_lat=end_lat,
            end_lng=end_lng,
            api_key=api_key,
        )
        return _parse_route(data, 0, sport)
    except RouteGenerationRateLimitError:
        raise
    except Exception as e:
        logger.error("GraphHopper point-to-point failed: %s", e)
        raise RouteGenerationError("GraphHopper could not generate a route for this request.") from e


def _calculate_surface_breakdown(path: dict) -> dict[str, float] | None:
    """Calculate percentage of each surface type from GraphHopper route details.

    GraphHopper returns surface details as a list of [start_index, end_index, surface_type]
    entries where the indices refer to coordinate positions. The distance between indices
    is used as a proxy for segment length.
    """
    details = path.get("details", {})
    surface_segments = details.get("surface", [])
    if not surface_segments:
        return None

    surface_lengths: dict[str, int] = {}
    total_length = 0
    for start_idx, end_idx, surface_type in surface_segments:
        segment_length = end_idx - start_idx
        if segment_length <= 0:
            continue
        key = str(surface_type).lower()
        surface_lengths[key] = surface_lengths.get(key, 0) + segment_length
        total_length += segment_length

    if total_length == 0:
        return None

    breakdown: dict[str, float] = {}
    for surface_type, length in sorted(surface_lengths.items(), key=lambda x: x[1], reverse=True):
        percentage = round((length / total_length) * 100, 1)
        if percentage > 0:
            breakdown[surface_type] = percentage

    return breakdown


def _parse_route(data: dict, seed: int, sport: str) -> RouteOption | None:
    paths = data.get("paths", [])
    if not paths:
        return None
    path = paths[0]
    coords = path.get("points", {}).get("coordinates", [])
    if not coords:
        return None

    distance_m = path.get("distance", 0)
    ascend = path.get("ascend", 0)
    descend = path.get("descend", 0)
    time_ms = path.get("time", 0)
    duration_s = int(time_ms / 1000) if time_ms else int(distance_m / _SPEEDS.get(sport, 3.0))

    surface_breakdown = _calculate_surface_breakdown(path)

    return RouteOption(
        geojson={
            "type": "Feature",
            "properties": {},
            "geometry": {"type": "LineString", "coordinates": coords},
        },
        distance_km=round(distance_m / 1000, 2),
        elevation_gain_m=round(ascend, 1),
        elevation_loss_m=round(descend, 1),
        estimated_duration_seconds=duration_s,
        seed=seed,
        surface_breakdown=surface_breakdown,
    )
