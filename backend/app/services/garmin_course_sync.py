"""Garmin course sync service.

Handles conversion of routes to Garmin course format and upload
to Garmin Connect for turn-by-turn navigation on cycling workouts.
"""

import logging
import math
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException, status
from supabase import AsyncClient

from app.services.garmin import get_garmin_client

logger = logging.getLogger(__name__)

# GPX XML namespace
_GPX_NS = "http://www.topografix.com/GPX/1/1"
_XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
_GPX_SCHEMA = "http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"

# Sport mapping from internal discipline to GPX activity type
_SPORT_MAP: dict[str, str] = {
    "RIDE_ROAD": "Biking",
    "RIDE_GRAVEL": "Biking",
    "RUN": "Running",
}

# Minimum bearing change (degrees) to be considered a significant turn
_TURN_THRESHOLD_DEG = 30.0

# Minimum distance (meters) between consecutive course points to avoid clutter
_MIN_COURSEPOINT_SPACING_M = 100.0


@dataclass
class GarminCourseResult:
    """Result of a successful Garmin course upload."""

    garmin_course_id: int
    course_name: str
    uploaded_at: str


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return the great-circle distance in metres between two points."""
    R = 6_371_000  # Earth radius in metres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return the initial bearing (0-360°) from point 1 to point 2."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlam = math.radians(lon2 - lon1)
    x = math.sin(dlam) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlam)
    return math.degrees(math.atan2(x, y)) % 360


def _bearing_change(b1: float, b2: float) -> float:
    """Return the absolute bearing change in degrees (0-180)."""
    diff = (b2 - b1 + 180) % 360 - 180
    return abs(diff)


def _turn_type(bearing_change: float, signed_change: float) -> str:
    """Classify a turn based on bearing change magnitude and direction.

    Returns a GPX course-point type string.
    """
    if bearing_change >= 120:
        return "Left" if signed_change < 0 else "Right"
    if bearing_change >= 60:
        return "Left" if signed_change < 0 else "Right"
    # Gentle turn
    return "Left" if signed_change < 0 else "Right"


def _signed_bearing_change(b1: float, b2: float) -> float:
    """Return the signed bearing change (-180 to 180). Negative = left turn."""
    return (b2 - b1 + 180) % 360 - 180


# ---------------------------------------------------------------------------
# Coordinate extraction
# ---------------------------------------------------------------------------

def _extract_coordinates(geojson: dict) -> list[tuple[float, float]]:
    """Extract (lat, lon) pairs from a GeoJSON object.

    Supports:
    - LineString geometry
    - Feature with LineString geometry
    - FeatureCollection with the first Feature containing a LineString

    GeoJSON coordinates are [longitude, latitude], so we swap them.

    Raises ValueError if the geometry type is unsupported or coordinates
    are missing.
    """
    geom = geojson

    # Unwrap FeatureCollection → first Feature
    if geom.get("type") == "FeatureCollection":
        features = geom.get("features", [])
        if not features:
            raise ValueError("FeatureCollection contains no features")
        geom = features[0]

    # Unwrap Feature → geometry
    if geom.get("type") == "Feature":
        geom = geom.get("geometry", {})

    if geom.get("type") != "LineString":
        raise ValueError(
            f"Unsupported geometry type: {geom.get('type')}. Expected LineString."
        )

    raw_coords = geom.get("coordinates", [])
    if len(raw_coords) < 2:
        raise ValueError("LineString must contain at least 2 coordinates")

    # GeoJSON is [lon, lat, (optional elevation)] → we need (lat, lon)
    return [(c[1], c[0]) for c in raw_coords]


# ---------------------------------------------------------------------------
# Turn-by-turn course point detection
# ---------------------------------------------------------------------------

def _detect_course_points(
    coords: list[tuple[float, float]],
) -> list[dict]:
    """Detect significant direction changes along a coordinate list.

    Returns a list of dicts with keys: lat, lon, name, type.
    """
    if len(coords) < 3:
        return []

    course_points: list[dict] = []
    last_cp_idx = 0  # index of the last emitted course point
    turn_number = 0

    for i in range(1, len(coords) - 1):
        b_in = _bearing(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1])
        b_out = _bearing(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1])

        change = _bearing_change(b_in, b_out)
        if change < _TURN_THRESHOLD_DEG:
            continue

        # Enforce minimum spacing from the last course point
        dist_from_last = _haversine(
            coords[last_cp_idx][0], coords[last_cp_idx][1],
            coords[i][0], coords[i][1],
        )
        if dist_from_last < _MIN_COURSEPOINT_SPACING_M:
            continue

        signed = _signed_bearing_change(b_in, b_out)
        direction = _turn_type(change, signed)
        turn_number += 1

        course_points.append({
            "lat": coords[i][0],
            "lon": coords[i][1],
            "name": f"Turn {turn_number}",
            "type": direction,
        })
        last_cp_idx = i

    return course_points


# ---------------------------------------------------------------------------
# GPX generation
# ---------------------------------------------------------------------------

def convert_geojson_to_fit_course(
    geojson: dict,
    name: str,
    sport: str,
) -> bytes:
    """Convert a GeoJSON LineString to GPX course format.

    The output is a GPX 1.1 XML document (as bytes) containing:
    - A route (<rte>) with route points for each coordinate
    - Course points (<rtept> with <name> and <type>) at significant turns
    - A track (<trk>) with track points for device rendering

    Garmin Connect accepts GPX uploads for courses, making this a simpler
    and more maintainable alternative to the binary FIT format.

    Args:
        geojson: A GeoJSON dict (LineString, Feature, or FeatureCollection).
        name: Human-readable course name.
        sport: Internal discipline string (RIDE_ROAD, RIDE_GRAVEL, RUN).

    Returns:
        GPX XML content as UTF-8 encoded bytes.

    Raises:
        ValueError: If the GeoJSON geometry is unsupported or has < 2 points.
    """
    coords = _extract_coordinates(geojson)
    course_points = _detect_course_points(coords)
    activity_type = _SPORT_MAP.get(sport, "Other")

    # Build the GPX XML tree
    gpx = ET.Element("gpx")
    gpx.set("xmlns", _GPX_NS)
    gpx.set("xmlns:xsi", _XSI_NS)
    gpx.set("xsi:schemaLocation", _GPX_SCHEMA)
    gpx.set("version", "1.1")
    gpx.set("creator", "PersonalCoach")

    # Metadata
    metadata = ET.SubElement(gpx, "metadata")
    meta_name = ET.SubElement(metadata, "name")
    meta_name.text = name

    # --- Route (rte) with course points ---
    rte = ET.SubElement(gpx, "rte")
    rte_name = ET.SubElement(rte, "name")
    rte_name.text = name
    rte_type = ET.SubElement(rte, "type")
    rte_type.text = activity_type

    # Build a set of course-point coordinates for quick lookup
    cp_lookup: dict[tuple[float, float], dict] = {
        (cp["lat"], cp["lon"]): cp for cp in course_points
    }

    for lat, lon in coords:
        rtept = ET.SubElement(rte, "rtept")
        rtept.set("lat", f"{lat:.7f}")
        rtept.set("lon", f"{lon:.7f}")

        # If this coordinate is a course point, annotate it
        cp = cp_lookup.get((lat, lon))
        if cp:
            cp_name = ET.SubElement(rtept, "name")
            cp_name.text = cp["name"]
            cp_type = ET.SubElement(rtept, "type")
            cp_type.text = cp["type"]

    # --- Track (trk) for device rendering ---
    trk = ET.SubElement(gpx, "trk")
    trk_name = ET.SubElement(trk, "name")
    trk_name.text = name
    trk_type = ET.SubElement(trk, "type")
    trk_type.text = activity_type

    trkseg = ET.SubElement(trk, "trkseg")
    for lat, lon in coords:
        trkpt = ET.SubElement(trkseg, "trkpt")
        trkpt.set("lat", f"{lat:.7f}")
        trkpt.set("lon", f"{lon:.7f}")

    # Serialize to bytes
    tree = ET.ElementTree(gpx)
    ET.indent(tree, space="  ")

    # ET.tostring with xml_declaration
    xml_bytes = ET.tostring(
        gpx,
        encoding="utf-8",
        xml_declaration=True,
    )
    return xml_bytes


# ---------------------------------------------------------------------------
# Garmin course upload
# ---------------------------------------------------------------------------


async def sync_route_to_garmin(
    route_id: str,
    user_id: str,
    sb: AsyncClient,
) -> GarminCourseResult:
    """Convert a route's GeoJSON to GPX and upload it to Garmin Connect.

    Stores the resulting garmin_course_id on the route record.

    Args:
        route_id: UUID of the route to sync.
        user_id: UUID of the authenticated user.
        sb: Supabase async client.

    Returns:
        GarminCourseResult with the Garmin course ID, name, and timestamp.

    Raises:
        HTTPException 400: Garmin account not connected.
        HTTPException 404: Route not found or does not belong to user.
        HTTPException 500: GPX conversion or Garmin upload failed.
    """
    # 1. Fetch the route
    res = await sb.table("routes").select("*").eq("id", route_id).eq("user_id", user_id).limit(1).execute()
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Route {route_id} not found",
        )
    route = res.data[0]

    geojson = route.get("geojson")
    if not geojson:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Route has no GeoJSON data to upload",
        )

    route_name = route.get("name", "Untitled Route")
    sport = route.get("sport", "RIDE_ROAD")

    # 2. Get the Garmin client (raises 400 if not connected)
    garmin_client = await get_garmin_client(user_id, sb)

    # 3. Convert GeoJSON to GPX
    try:
        gpx_bytes = convert_geojson_to_fit_course(geojson, route_name, sport)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to convert route to GPX: {exc}",
        ) from exc

    # 4. Write GPX to a temp file and upload to Garmin Connect
    try:
        with tempfile.NamedTemporaryFile(suffix=".gpx", delete=False) as tmp:
            tmp.write(gpx_bytes)
            tmp.flush()
            tmp_path = tmp.name

        upload_response = garmin_client.upload_activity(tmp_path)
    except Exception as exc:
        logger.error(
            "Garmin course upload failed for route %s, user %s: %s",
            route_id,
            user_id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload course to Garmin Connect: {exc}",
        ) from exc

    # 5. Extract the course/activity ID from the upload response
    garmin_course_id = _extract_course_id(upload_response)

    # 6. Store garmin_course_id on the route record
    uploaded_at = datetime.now(timezone.utc).isoformat()
    await sb.table("routes").update({
        "garmin_course_id": garmin_course_id,
    }).eq("id", route_id).execute()

    logger.info(
        "Uploaded course %s to Garmin for route %s (user %s)",
        garmin_course_id,
        route_id,
        user_id,
    )

    return GarminCourseResult(
        garmin_course_id=garmin_course_id,
        course_name=route_name,
        uploaded_at=uploaded_at,
    )


def _extract_course_id(upload_response: dict | list | None) -> int:
    """Extract the Garmin activity/course ID from the upload response.

    The garminconnect library returns a dict with a
    ``detailedImportResult`` key containing the uploaded activity details.

    Falls back to a sentinel value of 0 if the response structure is
    unexpected, so the upload is still recorded.
    """
    if not upload_response:
        return 0

    if isinstance(upload_response, dict):
        detailed = upload_response.get("detailedImportResult", {})
        successes = detailed.get("successes", [])
        if successes and isinstance(successes, list):
            first = successes[0]
            internal_id = first.get("internalId")
            if internal_id is not None:
                return int(internal_id)

        # Fallback: check for a top-level activityId
        activity_id = upload_response.get("activityId")
        if activity_id is not None:
            return int(activity_id)

    return 0
