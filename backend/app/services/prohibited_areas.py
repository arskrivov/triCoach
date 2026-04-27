"""Cycling prohibited areas service.

Manages the database of areas where cycling is not permitted and provides
functions to check if routes pass through these areas.
"""

import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from supabase import AsyncClient

logger = logging.getLogger(__name__)

# OpenStreetMap Overpass API endpoint
OVERPASS_API_URL = "https://overpass-api.de/api/interpreter"

# Timeout for Overpass API requests (seconds)
OVERPASS_TIMEOUT = 120


def _point_in_polygon(point: tuple[float, float], polygon: list[list[float]]) -> bool:
    """
    Check if a point is inside a polygon using the ray casting algorithm.
    
    Args:
        point: (lng, lat) tuple - note: GeoJSON uses [lng, lat] order
        polygon: List of [lng, lat] coordinate pairs forming the polygon
        
    Returns:
        True if the point is inside the polygon, False otherwise
    """
    x, y = point
    n = len(polygon)
    inside = False
    
    if n < 3:
        return False
    
    p1x, p1y = polygon[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    
    return inside


def _get_polygon_coordinates(geometry: dict) -> list[list[list[float]]]:
    """
    Extract polygon coordinates from a GeoJSON geometry.
    
    Handles both Polygon and MultiPolygon types.
    Returns a list of polygon rings (each ring is a list of [lng, lat] coordinates).
    """
    geom_type = geometry.get("type", "")
    coordinates = geometry.get("coordinates", [])
    
    if geom_type == "Polygon":
        # Polygon coordinates are [exterior_ring, hole1, hole2, ...]
        # We only check the exterior ring (first element)
        if coordinates:
            return [coordinates[0]]
        return []
    
    elif geom_type == "MultiPolygon":
        # MultiPolygon is a list of polygons
        rings = []
        for polygon_coords in coordinates:
            if polygon_coords:
                rings.append(polygon_coords[0])  # Exterior ring of each polygon
        return rings
    
    return []


def _extract_route_coordinates(geojson: dict) -> list[tuple[float, float]]:
    """
    Extract coordinates from a route GeoJSON.
    
    Handles both Feature and direct Geometry objects.
    Returns a list of (lng, lat) tuples.
    """
    # Handle Feature wrapper
    if geojson.get("type") == "Feature":
        geometry = geojson.get("geometry", {})
    else:
        geometry = geojson
    
    geom_type = geometry.get("type", "")
    coordinates = geometry.get("coordinates", [])
    
    if geom_type == "LineString":
        # LineString coordinates are [[lng, lat], [lng, lat], ...]
        return [(coord[0], coord[1]) for coord in coordinates if len(coord) >= 2]
    
    elif geom_type == "MultiLineString":
        # MultiLineString is a list of LineStrings
        points = []
        for line_coords in coordinates:
            points.extend(
                (coord[0], coord[1]) for coord in line_coords if len(coord) >= 2
            )
        return points
    
    return []


def _get_bounding_box(
    coordinates: list[tuple[float, float]],
) -> tuple[float, float, float, float]:
    """
    Calculate the bounding box of a list of coordinates.
    
    Returns (min_lng, min_lat, max_lng, max_lat).
    """
    if not coordinates:
        return (0.0, 0.0, 0.0, 0.0)
    
    lngs = [c[0] for c in coordinates]
    lats = [c[1] for c in coordinates]
    
    return (min(lngs), min(lats), max(lngs), max(lats))


def _bounding_boxes_overlap(
    bbox1: tuple[float, float, float, float],
    bbox2: tuple[float, float, float, float],
) -> bool:
    """
    Check if two bounding boxes overlap.
    
    Each bbox is (min_lng, min_lat, max_lng, max_lat).
    """
    min_lng1, min_lat1, max_lng1, max_lat1 = bbox1
    min_lng2, min_lat2, max_lng2, max_lat2 = bbox2
    
    # Check for no overlap conditions
    if max_lng1 < min_lng2 or max_lng2 < min_lng1:
        return False
    if max_lat1 < min_lat2 or max_lat2 < min_lat1:
        return False
    
    return True


def _get_polygon_bbox(polygon: list[list[float]]) -> tuple[float, float, float, float]:
    """
    Calculate the bounding box of a polygon.
    
    Returns (min_lng, min_lat, max_lng, max_lat).
    """
    if not polygon:
        return (0.0, 0.0, 0.0, 0.0)
    
    lngs = [coord[0] for coord in polygon]
    lats = [coord[1] for coord in polygon]
    
    return (min(lngs), min(lats), max(lngs), max(lats))


def _check_route_intersects_polygon(
    route_coords: list[tuple[float, float]],
    polygon: list[list[float]],
    route_bbox: tuple[float, float, float, float],
) -> bool:
    """
    Check if any point on the route falls within the polygon.
    
    Uses bounding box pre-filtering for efficiency.
    """
    # Get polygon bounding box
    poly_bbox = _get_polygon_bbox(polygon)
    
    # Quick rejection using bounding boxes
    if not _bounding_boxes_overlap(route_bbox, poly_bbox):
        return False
    
    # Check each route point
    for point in route_coords:
        if _point_in_polygon(point, polygon):
            return True
    
    return False


def _get_polygon_centroid(polygon: list[list[float]]) -> dict[str, float]:
    """
    Calculate the centroid of a polygon.
    
    Returns {"lat": float, "lng": float}.
    """
    if not polygon:
        return {"lat": 0.0, "lng": 0.0}
    
    # Simple centroid calculation (average of all points)
    total_lng = sum(coord[0] for coord in polygon)
    total_lat = sum(coord[1] for coord in polygon)
    n = len(polygon)
    
    return {
        "lat": total_lat / n,
        "lng": total_lng / n,
    }


async def check_route_prohibited_areas(
    geojson: dict,
    sb: AsyncClient,
) -> list[dict]:
    """
    Checks if any route segment passes through a cycling prohibited area.
    Returns list of intersecting areas with names and coordinates.
    
    Args:
        geojson: Route GeoJSON (Feature or Geometry with LineString/MultiLineString)
        sb: Supabase async client
        
    Returns:
        List of dicts with keys:
        - area_name: Name of the prohibited area (or None if unnamed)
        - coordinates: Centroid of the area {"lat": float, "lng": float}
        - restriction_type: Type of restriction (e.g., "no", "dismount", "private")
    """
    if not geojson:
        logger.debug("No GeoJSON provided for prohibited area check")
        return []
    
    # Extract route coordinates
    route_coords = _extract_route_coordinates(geojson)
    if not route_coords:
        logger.debug("No coordinates extracted from route GeoJSON")
        return []
    
    # Calculate route bounding box for efficient filtering
    route_bbox = _get_bounding_box(route_coords)
    min_lng, min_lat, max_lng, max_lat = route_bbox
    
    # Add a small buffer to the bounding box (approximately 100m at mid-latitudes)
    buffer = 0.001  # ~111m at equator
    min_lng -= buffer
    min_lat -= buffer
    max_lng += buffer
    max_lat += buffer
    
    try:
        # Query all prohibited areas
        # Note: In a production system with many areas, we would want to use
        # spatial indexing. For now, we fetch all and filter in Python.
        response = await sb.table("cycling_prohibited_areas").select(
            "id", "area_name", "geometry", "restriction_type"
        ).execute()
        
        if not response.data:
            logger.debug("No prohibited areas found in database")
            return []
        
        intersecting_areas: list[dict] = []
        
        for area in response.data:
            geometry = area.get("geometry")
            if not geometry:
                continue
            
            # Get polygon rings from the geometry
            polygon_rings = _get_polygon_coordinates(geometry)
            
            for polygon in polygon_rings:
                if _check_route_intersects_polygon(route_coords, polygon, route_bbox):
                    # Calculate centroid for the area
                    centroid = _get_polygon_centroid(polygon)
                    
                    intersecting_areas.append({
                        "area_name": area.get("area_name"),
                        "coordinates": centroid,
                        "restriction_type": area.get("restriction_type"),
                    })
                    
                    # Only add each area once (break after first matching polygon)
                    break
        
        if intersecting_areas:
            logger.info(
                "Route intersects %d prohibited area(s)",
                len(intersecting_areas),
            )
        else:
            logger.debug("Route does not intersect any prohibited areas")
        
        return intersecting_areas
        
    except Exception as e:
        logger.error("Failed to check prohibited areas: %s", e)
        # Return empty list on error - fail open to not block route usage
        # The caller can decide how to handle missing data
        return []


def _build_overpass_query(bounds: tuple[float, float, float, float]) -> str:
    """
    Build an Overpass QL query to fetch areas with cycling restrictions.
    
    Args:
        bounds: (min_lat, min_lng, max_lat, max_lng) bounding box
        
    Returns:
        Overpass QL query string
    """
    min_lat, min_lng, max_lat, max_lng = bounds
    bbox = f"{min_lat},{min_lng},{max_lat},{max_lng}"
    
    # Query for ways and relations with cycling restrictions
    # bicycle=no: cycling explicitly prohibited
    # bicycle=dismount: must walk bike
    # access=no: general access prohibited (includes cyclists)
    query = f"""
[out:json][timeout:90];
(
  // Ways with bicycle=no
  way["bicycle"="no"]({bbox});
  // Ways with bicycle=dismount
  way["bicycle"="dismount"]({bbox});
  // Ways with access=no (general prohibition)
  way["access"="no"]({bbox});
  // Areas (closed ways) with these tags
  way["area"="yes"]["bicycle"="no"]({bbox});
  way["area"="yes"]["bicycle"="dismount"]({bbox});
  way["area"="yes"]["access"="no"]({bbox});
  // Relations (multipolygons) with these tags
  relation["type"="multipolygon"]["bicycle"="no"]({bbox});
  relation["type"="multipolygon"]["bicycle"="dismount"]({bbox});
  relation["type"="multipolygon"]["access"="no"]({bbox});
);
out body;
>;
out skel qt;
"""
    return query


def _determine_restriction_type(tags: dict[str, str]) -> str:
    """
    Determine the restriction type from OSM tags.
    
    Returns one of: 'no', 'dismount', 'private'
    """
    bicycle = tags.get("bicycle", "")
    access = tags.get("access", "")
    
    if bicycle == "no":
        return "no"
    elif bicycle == "dismount":
        return "dismount"
    elif access == "no" or access == "private":
        return "private"
    
    return "no"  # Default


def _get_area_name(tags: dict[str, str]) -> str | None:
    """
    Extract a human-readable name from OSM tags.
    
    Tries multiple tag keys in order of preference.
    """
    name_keys = ["name", "name:en", "alt_name", "description", "ref"]
    
    for key in name_keys:
        if key in tags and tags[key]:
            return tags[key]
    
    return None


def _osm_nodes_to_geojson_polygon(
    node_ids: list[int],
    nodes: dict[int, tuple[float, float]],
) -> dict | None:
    """
    Convert a list of OSM node IDs to a GeoJSON Polygon geometry.
    
    Args:
        node_ids: List of node IDs forming the polygon
        nodes: Dict mapping node ID to (lat, lon) tuple
        
    Returns:
        GeoJSON Polygon geometry dict, or None if invalid
    """
    if len(node_ids) < 3:
        return None
    
    coordinates = []
    for node_id in node_ids:
        if node_id not in nodes:
            return None
        lat, lon = nodes[node_id]
        # GeoJSON uses [lng, lat] order
        coordinates.append([lon, lat])
    
    # Ensure the polygon is closed
    if coordinates[0] != coordinates[-1]:
        coordinates.append(coordinates[0])
    
    return {
        "type": "Polygon",
        "coordinates": [coordinates],
    }


def _parse_overpass_response(data: dict) -> list[dict[str, Any]]:
    """
    Parse Overpass API response and extract prohibited areas.
    
    Args:
        data: Overpass API JSON response
        
    Returns:
        List of dicts with keys: osm_id, area_name, geometry, restriction_type
    """
    elements = data.get("elements", [])
    
    # Build a lookup of nodes by ID
    nodes: dict[int, tuple[float, float]] = {}
    for elem in elements:
        if elem.get("type") == "node":
            nodes[elem["id"]] = (elem["lat"], elem["lon"])
    
    # Process ways and relations
    areas: list[dict[str, Any]] = []
    
    for elem in elements:
        elem_type = elem.get("type")
        
        if elem_type == "way":
            tags = elem.get("tags", {})
            node_ids = elem.get("nodes", [])
            
            # Skip if no relevant tags (might be a member of a relation)
            if not any(
                tags.get(k) in ["no", "dismount"]
                for k in ["bicycle", "access"]
            ) and tags.get("access") != "no":
                continue
            
            # Convert to GeoJSON polygon
            geometry = _osm_nodes_to_geojson_polygon(node_ids, nodes)
            if not geometry:
                continue
            
            areas.append({
                "osm_id": elem["id"],
                "area_name": _get_area_name(tags),
                "geometry": geometry,
                "restriction_type": _determine_restriction_type(tags),
            })
        
        elif elem_type == "relation":
            tags = elem.get("tags", {})
            
            # Skip if not a multipolygon or no relevant tags
            if tags.get("type") != "multipolygon":
                continue
            
            if not any(
                tags.get(k) in ["no", "dismount"]
                for k in ["bicycle", "access"]
            ) and tags.get("access") != "no":
                continue
            
            # For relations, we need to assemble the outer ways
            # This is simplified - full multipolygon handling is complex
            members = elem.get("members", [])
            outer_ways = [m for m in members if m.get("role") == "outer"]
            
            # For now, we'll create a simple polygon from the first outer way
            # A full implementation would merge all outer ways
            if outer_ways:
                # Find the way element
                way_ref = outer_ways[0].get("ref")
                for way_elem in elements:
                    if way_elem.get("type") == "way" and way_elem.get("id") == way_ref:
                        node_ids = way_elem.get("nodes", [])
                        geometry = _osm_nodes_to_geojson_polygon(node_ids, nodes)
                        if geometry:
                            areas.append({
                                "osm_id": elem["id"],
                                "area_name": _get_area_name(tags),
                                "geometry": geometry,
                                "restriction_type": _determine_restriction_type(tags),
                            })
                        break
    
    return areas


async def refresh_prohibited_areas_from_osm(
    bounds: tuple[float, float, float, float],
    sb: AsyncClient,
) -> int:
    """
    Fetches areas tagged with bicycle=no, bicycle=dismount, or access=no
    from OpenStreetMap Overpass API and updates the database.
    
    Args:
        bounds: (min_lat, min_lng, max_lat, max_lng) bounding box to query
        sb: Supabase async client
        
    Returns:
        Number of areas updated/inserted
        
    Raises:
        httpx.HTTPError: If the Overpass API request fails
    """
    min_lat, min_lng, max_lat, max_lng = bounds
    
    # Validate bounds
    if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
        raise ValueError("Latitude must be between -90 and 90")
    if not (-180 <= min_lng <= 180 and -180 <= max_lng <= 180):
        raise ValueError("Longitude must be between -180 and 180")
    if min_lat >= max_lat or min_lng >= max_lng:
        raise ValueError("Invalid bounds: min must be less than max")
    
    logger.info(
        "Refreshing prohibited areas from OSM for bounds: (%.4f, %.4f, %.4f, %.4f)",
        min_lat, min_lng, max_lat, max_lng,
    )
    
    # Build and execute Overpass query
    query = _build_overpass_query(bounds)
    
    async with httpx.AsyncClient(timeout=OVERPASS_TIMEOUT) as client:
        try:
            response = await client.post(
                OVERPASS_API_URL,
                data={"data": query},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response.raise_for_status()
            data = response.json()
        except httpx.TimeoutException:
            logger.error("Overpass API request timed out")
            raise
        except httpx.HTTPStatusError as e:
            logger.error("Overpass API returned error: %s", e.response.status_code)
            raise
    
    # Parse the response
    areas = _parse_overpass_response(data)
    
    if not areas:
        logger.info("No prohibited areas found in the specified bounds")
        return 0
    
    logger.info("Found %d prohibited areas from OSM", len(areas))
    
    # Upsert areas into the database
    now = datetime.now(timezone.utc).isoformat()
    updated_count = 0
    
    for area in areas:
        try:
            # Use upsert with osm_id as the conflict key
            # First check if the area exists
            existing = await sb.table("cycling_prohibited_areas").select(
                "id"
            ).eq("osm_id", area["osm_id"]).execute()
            
            if existing.data:
                # Update existing record
                await sb.table("cycling_prohibited_areas").update({
                    "area_name": area["area_name"],
                    "geometry": area["geometry"],
                    "restriction_type": area["restriction_type"],
                    "updated_at": now,
                }).eq("osm_id", area["osm_id"]).execute()
            else:
                # Insert new record
                await sb.table("cycling_prohibited_areas").insert({
                    "osm_id": area["osm_id"],
                    "area_name": area["area_name"],
                    "geometry": area["geometry"],
                    "restriction_type": area["restriction_type"],
                    "source": "osm",
                    "updated_at": now,
                    "created_at": now,
                }).execute()
            
            updated_count += 1
            
        except Exception as e:
            logger.warning(
                "Failed to upsert prohibited area osm_id=%d: %s",
                area["osm_id"],
                e,
            )
            continue
    
    logger.info(
        "Successfully updated %d prohibited areas in database",
        updated_count,
    )
    
    return updated_count
