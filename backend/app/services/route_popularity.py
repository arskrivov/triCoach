"""Route popularity service for tracking segment usage.

Extracts route segments from activity GPS data and updates popularity counters.
Segments are hashed at ~100m resolution for matching partial overlaps.
"""

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from math import radians, sin, cos, sqrt, atan2

import polyline as polyline_codec
from supabase import AsyncClient

logger = logging.getLogger(__name__)

# Segment resolution: ~100m (4 decimal places = ~11m precision)
SEGMENT_RESOLUTION_METERS = 100
COORDINATE_PRECISION = 4

# Minimum activity distance to process (500m)
MIN_ACTIVITY_DISTANCE_METERS = 500

# Time decay thresholds (in days)
TIME_DECAY_90_DAYS = 90
TIME_DECAY_180_DAYS = 180

# Time decay weights
WEIGHT_RECENT = 1.0  # 0-90 days: 100%
WEIGHT_MEDIUM = 0.5  # 90-180 days: 50%
WEIGHT_OLD = 0.25    # >180 days: 25%


def _round_coordinate(value: float) -> float:
    """Round coordinate to 4 decimal places (~11m precision)."""
    return round(value, COORDINATE_PRECISION)


def _haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance between two points in meters using Haversine formula."""
    R = 6371000  # Earth's radius in meters
    
    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)
    delta_lat = radians(lat2 - lat1)
    delta_lng = radians(lng2 - lng1)
    
    a = sin(delta_lat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lng / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    
    return R * c


def hash_segment(lat1: float, lng1: float, lat2: float, lng2: float) -> str:
    """
    Creates a consistent hash for a segment at ~100m resolution.
    Coordinates are rounded to 4 decimal places (~11m precision).
    
    The hash is direction-independent: (A→B) produces the same hash as (B→A).
    """
    # Round coordinates to 4 decimal places
    r_lat1 = _round_coordinate(lat1)
    r_lng1 = _round_coordinate(lng1)
    r_lat2 = _round_coordinate(lat2)
    r_lng2 = _round_coordinate(lng2)
    
    # Sort points to ensure direction-independence
    # Compare by lat first, then lng
    point1 = (r_lat1, r_lng1)
    point2 = (r_lat2, r_lng2)
    
    if point1 > point2:
        point1, point2 = point2, point1
    
    # Create a consistent string representation
    segment_str = f"{point1[0]:.4f},{point1[1]:.4f}|{point2[0]:.4f},{point2[1]:.4f}"
    
    # Return SHA-256 hash (first 16 chars for reasonable uniqueness)
    return hashlib.sha256(segment_str.encode()).hexdigest()[:16]


def _decode_polyline(encoded_polyline: str) -> list[tuple[float, float]]:
    """Decode a polyline string to a list of (lat, lng) tuples."""
    try:
        return polyline_codec.decode(encoded_polyline, precision=5)
    except Exception as e:
        logger.warning("Failed to decode polyline: %s", e)
        return []


def _calculate_total_distance(points: list[tuple[float, float]]) -> float:
    """Calculate total distance of a polyline in meters."""
    if len(points) < 2:
        return 0.0
    
    total = 0.0
    for i in range(len(points) - 1):
        lat1, lng1 = points[i]
        lat2, lng2 = points[i + 1]
        total += _haversine_distance(lat1, lng1, lat2, lng2)
    
    return total


def _extract_segments_from_points(
    points: list[tuple[float, float]],
) -> list[tuple[str, dict]]:
    """
    Extract segments from a list of GPS points.
    
    Returns a list of (segment_hash, coordinates_dict) tuples.
    Segments are approximately 100m in length.
    """
    if len(points) < 2:
        return []
    
    segments: list[tuple[str, dict]] = []
    accumulated_distance = 0.0
    segment_start_idx = 0
    
    for i in range(1, len(points)):
        lat1, lng1 = points[i - 1]
        lat2, lng2 = points[i]
        
        distance = _haversine_distance(lat1, lng1, lat2, lng2)
        accumulated_distance += distance
        
        # Create a segment when we've accumulated ~100m
        if accumulated_distance >= SEGMENT_RESOLUTION_METERS:
            start_lat, start_lng = points[segment_start_idx]
            end_lat, end_lng = points[i]
            
            segment_hash = hash_segment(start_lat, start_lng, end_lat, end_lng)
            coordinates = {
                "lat1": _round_coordinate(start_lat),
                "lng1": _round_coordinate(start_lng),
                "lat2": _round_coordinate(end_lat),
                "lng2": _round_coordinate(end_lng),
            }
            
            segments.append((segment_hash, coordinates))
            
            # Reset for next segment
            segment_start_idx = i
            accumulated_distance = 0.0
    
    return segments


async def extract_and_store_segments(
    activity_id: str,
    polyline: str,
    discipline: str,
    sb: AsyncClient,
) -> int:
    """
    Extracts route segments from activity polyline and updates popularity counters.
    Returns number of segments processed.
    
    Segments are hashed at ~100m resolution for matching partial overlaps.
    Only processes activities with ≥500m valid GPS data.
    """
    if not polyline:
        logger.debug("No polyline provided for activity %s", activity_id)
        return 0
    
    # Decode the polyline
    points = _decode_polyline(polyline)
    if len(points) < 2:
        logger.debug("Insufficient points in polyline for activity %s", activity_id)
        return 0
    
    # Check minimum distance requirement
    total_distance = _calculate_total_distance(points)
    if total_distance < MIN_ACTIVITY_DISTANCE_METERS:
        logger.debug(
            "Activity %s has insufficient distance (%.1fm < %dm)",
            activity_id,
            total_distance,
            MIN_ACTIVITY_DISTANCE_METERS,
        )
        return 0
    
    # Extract segments
    segments = _extract_segments_from_points(points)
    if not segments:
        logger.debug("No segments extracted from activity %s", activity_id)
        return 0
    
    # Prepare records for upsert
    now = datetime.now(timezone.utc).isoformat()
    
    # Process segments in batches to avoid overwhelming the database
    batch_size = 50
    total_processed = 0
    
    for i in range(0, len(segments), batch_size):
        batch = segments[i:i + batch_size]
        
        for segment_hash, coordinates in batch:
            try:
                # Try to update existing record first
                existing = await sb.table("route_segment_popularity").select(
                    "id", "usage_count"
                ).eq("segment_hash", segment_hash).eq("discipline", discipline).execute()
                
                if existing.data:
                    # Update existing record
                    record = existing.data[0]
                    await sb.table("route_segment_popularity").update({
                        "usage_count": record["usage_count"] + 1,
                        "last_used_at": now,
                    }).eq("id", record["id"]).execute()
                else:
                    # Insert new record
                    await sb.table("route_segment_popularity").insert({
                        "segment_hash": segment_hash,
                        "discipline": discipline,
                        "usage_count": 1,
                        "last_used_at": now,
                        "coordinates": coordinates,
                    }).execute()
                
                total_processed += 1
                
            except Exception as e:
                logger.warning(
                    "Failed to upsert segment %s for activity %s: %s",
                    segment_hash,
                    activity_id,
                    e,
                )
    
    logger.info(
        "Processed %d segments from activity %s (discipline: %s, distance: %.1fm)",
        total_processed,
        activity_id,
        discipline,
        total_distance,
    )
    
    return total_processed


def _calculate_time_decay_weight(last_used_at: str) -> float:
    """
    Calculate the time decay weight based on how old the last usage is.
    
    - Within 90 days: 100% weight
    - 90-180 days: 50% weight
    - Older than 180 days: 25% weight
    """
    try:
        # Parse the timestamp
        if last_used_at.endswith("Z"):
            last_used_at = last_used_at[:-1] + "+00:00"
        last_used_dt = datetime.fromisoformat(last_used_at)
        
        # Ensure timezone-aware comparison
        if last_used_dt.tzinfo is None:
            last_used_dt = last_used_dt.replace(tzinfo=timezone.utc)
        
        now = datetime.now(timezone.utc)
        age_days = (now - last_used_dt).days
        
        if age_days <= TIME_DECAY_90_DAYS:
            return WEIGHT_RECENT
        elif age_days <= TIME_DECAY_180_DAYS:
            return WEIGHT_MEDIUM
        else:
            return WEIGHT_OLD
    except (ValueError, TypeError) as e:
        logger.warning("Failed to parse last_used_at timestamp '%s': %s", last_used_at, e)
        # Default to medium weight if parsing fails
        return WEIGHT_MEDIUM


async def get_segment_popularity(
    segment_hashes: list[str],
    discipline: str,
    sb: AsyncClient,
) -> dict[str, int]:
    """
    Returns usage counts for given segment hashes.
    Applies time decay: 90-180 days = 50% weight, >180 days = 25% weight.
    
    Args:
        segment_hashes: List of segment hash strings to query
        discipline: The discipline to filter by (e.g., "RUN", "RIDE_ROAD")
        sb: Supabase async client
        
    Returns:
        Dictionary mapping segment hashes to weighted usage counts (rounded to int)
    """
    if not segment_hashes:
        return {}
    
    result: dict[str, int] = {}
    
    # Query in batches to avoid query size limits
    batch_size = 100
    
    for i in range(0, len(segment_hashes), batch_size):
        batch = segment_hashes[i:i + batch_size]
        
        try:
            response = await sb.table("route_segment_popularity").select(
                "segment_hash", "usage_count", "last_used_at"
            ).in_("segment_hash", batch).eq("discipline", discipline).execute()
            
            if response.data:
                for record in response.data:
                    segment_hash = record["segment_hash"]
                    usage_count = record["usage_count"]
                    last_used_at = record["last_used_at"]
                    
                    # Apply time decay weight
                    weight = _calculate_time_decay_weight(last_used_at)
                    weighted_count = int(round(usage_count * weight))
                    
                    result[segment_hash] = weighted_count
                    
        except Exception as e:
            logger.warning(
                "Failed to query segment popularity for batch starting at %d: %s",
                i,
                e,
            )
    
    logger.debug(
        "Retrieved popularity for %d/%d segments (discipline: %s)",
        len(result),
        len(segment_hashes),
        discipline,
    )
    
    return result
