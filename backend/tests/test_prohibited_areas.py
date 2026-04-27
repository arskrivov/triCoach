"""Unit tests for prohibited_areas.py service functions.

Tests cover:
- _point_in_polygon: point-in-polygon algorithm
- _extract_route_coordinates: GeoJSON parsing
- _get_polygon_coordinates: polygon extraction from geometry
- check_route_prohibited_areas: route intersection detection

Requirements: 6.2, 6.5
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.prohibited_areas import (
    _point_in_polygon,
    _extract_route_coordinates,
    _get_polygon_coordinates,
    _get_bounding_box,
    _bounding_boxes_overlap,
    _get_polygon_bbox,
    _check_route_intersects_polygon,
    _get_polygon_centroid,
    check_route_prohibited_areas,
)


# ---------------------------------------------------------------------------
# _point_in_polygon tests - Requirement 6.2
# ---------------------------------------------------------------------------


class TestPointInPolygon:
    """Tests for point-in-polygon algorithm."""

    def test_point_inside_simple_square(self):
        """Point inside a simple square polygon is detected."""
        # Square from (0,0) to (10,10)
        square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
        point = (5, 5)  # Center of square
        
        assert _point_in_polygon(point, square) is True

    def test_point_outside_simple_square(self):
        """Point outside a simple square polygon is not detected."""
        square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
        point = (15, 15)  # Outside square
        
        assert _point_in_polygon(point, square) is False

    def test_point_inside_triangle(self):
        """Point inside a triangle is detected."""
        triangle = [[0, 0], [10, 0], [5, 10], [0, 0]]
        point = (5, 3)  # Inside triangle
        
        assert _point_in_polygon(point, triangle) is True

    def test_point_outside_triangle(self):
        """Point outside a triangle is not detected."""
        triangle = [[0, 0], [10, 0], [5, 10], [0, 0]]
        point = (0, 10)  # Outside triangle
        
        assert _point_in_polygon(point, triangle) is False

    def test_point_inside_irregular_polygon(self):
        """Point inside an irregular polygon is detected."""
        # L-shaped polygon
        polygon = [[0, 0], [5, 0], [5, 5], [10, 5], [10, 10], [0, 10], [0, 0]]
        point = (2, 5)  # Inside the L
        
        assert _point_in_polygon(point, polygon) is True

    def test_point_outside_irregular_polygon(self):
        """Point outside an irregular polygon is not detected."""
        # L-shaped polygon
        polygon = [[0, 0], [5, 0], [5, 5], [10, 5], [10, 10], [0, 10], [0, 0]]
        point = (7, 2)  # In the "cut out" part of the L
        
        assert _point_in_polygon(point, polygon) is False

    def test_polygon_with_less_than_3_points_returns_false(self):
        """Polygon with fewer than 3 points returns False."""
        line = [[0, 0], [10, 10]]
        point = (5, 5)
        
        assert _point_in_polygon(point, line) is False

    def test_empty_polygon_returns_false(self):
        """Empty polygon returns False."""
        assert _point_in_polygon((5, 5), []) is False

    def test_point_with_negative_coordinates(self):
        """Point-in-polygon works with negative coordinates."""
        square = [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]
        
        assert _point_in_polygon((0, 0), square) is True
        assert _point_in_polygon((-5, -5), square) is True
        assert _point_in_polygon((15, 15), square) is False

    def test_point_with_real_world_coordinates(self):
        """Point-in-polygon works with real-world GPS coordinates."""
        # Small area in Munich (lng, lat format as per GeoJSON)
        munich_area = [
            [11.5700, 48.1350],
            [11.5800, 48.1350],
            [11.5800, 48.1400],
            [11.5700, 48.1400],
            [11.5700, 48.1350],
        ]
        
        # Point inside
        assert _point_in_polygon((11.5750, 48.1375), munich_area) is True
        # Point outside
        assert _point_in_polygon((11.5600, 48.1375), munich_area) is False


# ---------------------------------------------------------------------------
# _extract_route_coordinates tests - Requirement 6.2
# ---------------------------------------------------------------------------


class TestExtractRouteCoordinates:
    """Tests for GeoJSON coordinate extraction."""

    def test_extract_from_linestring_geometry(self):
        """Extracts coordinates from a LineString geometry."""
        geojson = {
            "type": "LineString",
            "coordinates": [[11.5700, 48.1350], [11.5750, 48.1375], [11.5800, 48.1400]],
        }
        
        result = _extract_route_coordinates(geojson)
        
        assert len(result) == 3
        assert result[0] == (11.5700, 48.1350)
        assert result[1] == (11.5750, 48.1375)
        assert result[2] == (11.5800, 48.1400)

    def test_extract_from_feature_with_linestring(self):
        """Extracts coordinates from a Feature containing LineString."""
        geojson = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[11.5700, 48.1350], [11.5800, 48.1400]],
            },
            "properties": {"name": "Test Route"},
        }
        
        result = _extract_route_coordinates(geojson)
        
        assert len(result) == 2
        assert result[0] == (11.5700, 48.1350)
        assert result[1] == (11.5800, 48.1400)

    def test_extract_from_multilinestring(self):
        """Extracts coordinates from a MultiLineString geometry."""
        geojson = {
            "type": "MultiLineString",
            "coordinates": [
                [[11.5700, 48.1350], [11.5750, 48.1375]],
                [[11.5750, 48.1375], [11.5800, 48.1400]],
            ],
        }
        
        result = _extract_route_coordinates(geojson)
        
        assert len(result) == 4
        assert result[0] == (11.5700, 48.1350)
        assert result[3] == (11.5800, 48.1400)

    def test_extract_from_empty_geojson_returns_empty_list(self):
        """Empty GeoJSON returns empty list."""
        result = _extract_route_coordinates({})
        
        assert result == []

    def test_extract_from_geojson_with_no_coordinates(self):
        """GeoJSON with no coordinates returns empty list."""
        geojson = {"type": "LineString", "coordinates": []}
        
        result = _extract_route_coordinates(geojson)
        
        assert result == []

    def test_extract_from_unsupported_geometry_type(self):
        """Unsupported geometry type returns empty list."""
        geojson = {
            "type": "Point",
            "coordinates": [11.5700, 48.1350],
        }
        
        result = _extract_route_coordinates(geojson)
        
        assert result == []

    def test_extract_handles_coordinates_with_elevation(self):
        """Handles coordinates with elevation (3D coordinates)."""
        geojson = {
            "type": "LineString",
            "coordinates": [[11.5700, 48.1350, 500], [11.5800, 48.1400, 520]],
        }
        
        result = _extract_route_coordinates(geojson)
        
        assert len(result) == 2
        # Should only extract lng, lat (first two values)
        assert result[0] == (11.5700, 48.1350)
        assert result[1] == (11.5800, 48.1400)


# ---------------------------------------------------------------------------
# _get_polygon_coordinates tests - Requirement 6.2
# ---------------------------------------------------------------------------


class TestGetPolygonCoordinates:
    """Tests for polygon coordinate extraction from geometry."""

    def test_extract_from_polygon_geometry(self):
        """Extracts exterior ring from Polygon geometry."""
        geometry = {
            "type": "Polygon",
            "coordinates": [
                [[11.57, 48.13], [11.58, 48.13], [11.58, 48.14], [11.57, 48.14], [11.57, 48.13]]
            ],
        }
        
        result = _get_polygon_coordinates(geometry)
        
        assert len(result) == 1
        assert len(result[0]) == 5

    def test_extract_from_multipolygon_geometry(self):
        """Extracts exterior rings from MultiPolygon geometry."""
        geometry = {
            "type": "MultiPolygon",
            "coordinates": [
                [[[11.57, 48.13], [11.58, 48.13], [11.58, 48.14], [11.57, 48.14], [11.57, 48.13]]],
                [[[11.60, 48.15], [11.61, 48.15], [11.61, 48.16], [11.60, 48.16], [11.60, 48.15]]],
            ],
        }
        
        result = _get_polygon_coordinates(geometry)
        
        assert len(result) == 2

    def test_extract_from_empty_polygon(self):
        """Empty polygon returns empty list."""
        geometry = {"type": "Polygon", "coordinates": []}
        
        result = _get_polygon_coordinates(geometry)
        
        assert result == []

    def test_extract_from_unsupported_geometry_type(self):
        """Unsupported geometry type returns empty list."""
        geometry = {"type": "Point", "coordinates": [11.57, 48.13]}
        
        result = _get_polygon_coordinates(geometry)
        
        assert result == []


# ---------------------------------------------------------------------------
# Bounding box helper tests - Requirement 6.2
# ---------------------------------------------------------------------------


class TestBoundingBoxHelpers:
    """Tests for bounding box calculation and overlap detection."""

    def test_get_bounding_box_from_coordinates(self):
        """Calculates correct bounding box from coordinates."""
        coords = [(11.57, 48.13), (11.58, 48.14), (11.59, 48.12)]
        
        result = _get_bounding_box(coords)
        
        assert result == (11.57, 48.12, 11.59, 48.14)

    def test_get_bounding_box_empty_returns_zeros(self):
        """Empty coordinate list returns zero bounding box."""
        result = _get_bounding_box([])
        
        assert result == (0.0, 0.0, 0.0, 0.0)

    def test_bounding_boxes_overlap_true(self):
        """Overlapping bounding boxes are detected."""
        bbox1 = (0, 0, 10, 10)
        bbox2 = (5, 5, 15, 15)
        
        assert _bounding_boxes_overlap(bbox1, bbox2) is True

    def test_bounding_boxes_overlap_false_horizontal(self):
        """Non-overlapping boxes (horizontal separation) are detected."""
        bbox1 = (0, 0, 10, 10)
        bbox2 = (15, 0, 25, 10)
        
        assert _bounding_boxes_overlap(bbox1, bbox2) is False

    def test_bounding_boxes_overlap_false_vertical(self):
        """Non-overlapping boxes (vertical separation) are detected."""
        bbox1 = (0, 0, 10, 10)
        bbox2 = (0, 15, 10, 25)
        
        assert _bounding_boxes_overlap(bbox1, bbox2) is False

    def test_get_polygon_bbox(self):
        """Calculates correct bounding box from polygon."""
        polygon = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
        
        result = _get_polygon_bbox(polygon)
        
        assert result == (0, 0, 10, 10)

    def test_get_polygon_bbox_empty(self):
        """Empty polygon returns zero bounding box."""
        result = _get_polygon_bbox([])
        
        assert result == (0.0, 0.0, 0.0, 0.0)


# ---------------------------------------------------------------------------
# _check_route_intersects_polygon tests - Requirement 6.2
# ---------------------------------------------------------------------------


class TestCheckRouteIntersectsPolygon:
    """Tests for route-polygon intersection detection."""

    def test_route_through_polygon_is_detected(self):
        """Route passing through a polygon is detected."""
        route_coords = [(5, 5), (15, 15)]  # Passes through the square
        polygon = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
        route_bbox = (5, 5, 15, 15)
        
        result = _check_route_intersects_polygon(route_coords, polygon, route_bbox)
        
        assert result is True

    def test_route_outside_polygon_not_detected(self):
        """Route not passing through a polygon is not detected."""
        route_coords = [(15, 15), (20, 20)]  # Outside the square
        polygon = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
        route_bbox = (15, 15, 20, 20)
        
        result = _check_route_intersects_polygon(route_coords, polygon, route_bbox)
        
        assert result is False

    def test_route_bbox_no_overlap_quick_rejection(self):
        """Route with non-overlapping bounding box is quickly rejected."""
        route_coords = [(100, 100), (110, 110)]
        polygon = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
        route_bbox = (100, 100, 110, 110)
        
        result = _check_route_intersects_polygon(route_coords, polygon, route_bbox)
        
        assert result is False


# ---------------------------------------------------------------------------
# _get_polygon_centroid tests
# ---------------------------------------------------------------------------


class TestGetPolygonCentroid:
    """Tests for polygon centroid calculation."""

    def test_centroid_of_square(self):
        """Calculates correct centroid for a square."""
        square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
        
        result = _get_polygon_centroid(square)
        
        # Centroid should be at (5, 5) - but note the closed polygon has 5 points
        # Average of [0,10,10,0,0] = 20/5 = 4 for lng
        # Average of [0,0,10,10,0] = 20/5 = 4 for lat
        assert result["lng"] == 4.0
        assert result["lat"] == 4.0

    def test_centroid_of_empty_polygon(self):
        """Empty polygon returns zero centroid."""
        result = _get_polygon_centroid([])
        
        assert result == {"lat": 0.0, "lng": 0.0}


# ---------------------------------------------------------------------------
# check_route_prohibited_areas tests - Requirements 6.2, 6.5
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestCheckRouteProhibitedAreas:
    """Tests for check_route_prohibited_areas function."""

    async def test_route_through_prohibited_area_is_detected(self):
        """Route passing through a prohibited area is detected. (Requirement 6.2)"""
        mock_sb = MagicMock()
        
        # Route that passes through the prohibited area
        route_geojson = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[11.575, 48.137], [11.576, 48.138]],
            },
        }
        
        # Mock prohibited area that the route passes through
        prohibited_area = {
            "id": "area-1",
            "area_name": "No Cycling Park",
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [[11.570, 48.135], [11.580, 48.135], [11.580, 48.140], [11.570, 48.140], [11.570, 48.135]]
                ],
            },
            "restriction_type": "no",
        }
        
        mock_execute = AsyncMock(return_value=MagicMock(data=[prohibited_area]))
        mock_select = MagicMock()
        mock_select.execute = mock_execute
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_sb.table.return_value = mock_table
        
        result = await check_route_prohibited_areas(route_geojson, mock_sb)
        
        assert len(result) == 1
        assert result[0]["area_name"] == "No Cycling Park"
        assert result[0]["restriction_type"] == "no"
        assert "coordinates" in result[0]

    async def test_route_not_through_prohibited_area_returns_empty(self):
        """Route not passing through any prohibited area returns empty list. (Requirement 6.2)"""
        mock_sb = MagicMock()
        
        # Route that does NOT pass through the prohibited area
        route_geojson = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[11.590, 48.150], [11.591, 48.151]],  # Far from prohibited area
            },
        }
        
        # Prohibited area in a different location
        prohibited_area = {
            "id": "area-1",
            "area_name": "No Cycling Park",
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [[11.570, 48.135], [11.580, 48.135], [11.580, 48.140], [11.570, 48.140], [11.570, 48.135]]
                ],
            },
            "restriction_type": "no",
        }
        
        mock_execute = AsyncMock(return_value=MagicMock(data=[prohibited_area]))
        mock_select = MagicMock()
        mock_select.execute = mock_execute
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_sb.table.return_value = mock_table
        
        result = await check_route_prohibited_areas(route_geojson, mock_sb)
        
        assert result == []

    async def test_empty_geojson_returns_empty_list(self):
        """Empty GeoJSON returns empty list. (Requirement 6.5)"""
        mock_sb = MagicMock()
        
        result = await check_route_prohibited_areas({}, mock_sb)
        
        assert result == []
        # Database should not be queried
        mock_sb.table.assert_not_called()

    async def test_none_geojson_returns_empty_list(self):
        """None GeoJSON returns empty list. (Requirement 6.5)"""
        mock_sb = MagicMock()
        
        result = await check_route_prohibited_areas(None, mock_sb)
        
        assert result == []

    async def test_missing_prohibited_area_data_returns_empty_list(self):
        """Missing prohibited area data returns empty list (fail open). (Requirement 6.5)"""
        mock_sb = MagicMock()
        
        route_geojson = {
            "type": "LineString",
            "coordinates": [[11.575, 48.137], [11.576, 48.138]],
        }
        
        # No prohibited areas in database
        mock_execute = AsyncMock(return_value=MagicMock(data=[]))
        mock_select = MagicMock()
        mock_select.execute = mock_execute
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_sb.table.return_value = mock_table
        
        result = await check_route_prohibited_areas(route_geojson, mock_sb)
        
        assert result == []

    async def test_database_error_returns_empty_list_fail_open(self):
        """Database error returns empty list (fail open). (Requirement 6.5)"""
        mock_sb = MagicMock()
        
        route_geojson = {
            "type": "LineString",
            "coordinates": [[11.575, 48.137], [11.576, 48.138]],
        }
        
        # Simulate database error
        mock_execute = AsyncMock(side_effect=Exception("Database connection failed"))
        mock_select = MagicMock()
        mock_select.execute = mock_execute
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_sb.table.return_value = mock_table
        
        result = await check_route_prohibited_areas(route_geojson, mock_sb)
        
        # Should fail open - return empty list instead of raising
        assert result == []

    async def test_geojson_with_no_extractable_coordinates_returns_empty(self):
        """GeoJSON with no extractable coordinates returns empty list. (Requirement 6.5)"""
        mock_sb = MagicMock()
        
        # Point geometry - not a route
        route_geojson = {
            "type": "Point",
            "coordinates": [11.575, 48.137],
        }
        
        result = await check_route_prohibited_areas(route_geojson, mock_sb)
        
        assert result == []
        # Database should not be queried
        mock_sb.table.assert_not_called()

    async def test_multiple_prohibited_areas_detected(self):
        """Multiple prohibited areas along route are all detected. (Requirement 6.2)"""
        mock_sb = MagicMock()
        
        # Route that passes through two prohibited areas
        route_geojson = {
            "type": "LineString",
            "coordinates": [
                [11.575, 48.137],  # In area 1
                [11.585, 48.147],  # In area 2
            ],
        }
        
        prohibited_areas = [
            {
                "id": "area-1",
                "area_name": "Park A",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [[11.570, 48.135], [11.580, 48.135], [11.580, 48.140], [11.570, 48.140], [11.570, 48.135]]
                    ],
                },
                "restriction_type": "no",
            },
            {
                "id": "area-2",
                "area_name": "Park B",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [[11.580, 48.145], [11.590, 48.145], [11.590, 48.150], [11.580, 48.150], [11.580, 48.145]]
                    ],
                },
                "restriction_type": "dismount",
            },
        ]
        
        mock_execute = AsyncMock(return_value=MagicMock(data=prohibited_areas))
        mock_select = MagicMock()
        mock_select.execute = mock_execute
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_sb.table.return_value = mock_table
        
        result = await check_route_prohibited_areas(route_geojson, mock_sb)
        
        assert len(result) == 2
        area_names = [r["area_name"] for r in result]
        assert "Park A" in area_names
        assert "Park B" in area_names

    async def test_prohibited_area_with_missing_geometry_is_skipped(self):
        """Prohibited area with missing geometry is skipped. (Requirement 6.5)"""
        mock_sb = MagicMock()
        
        route_geojson = {
            "type": "LineString",
            "coordinates": [[11.575, 48.137], [11.576, 48.138]],
        }
        
        # Area with missing geometry
        prohibited_areas = [
            {
                "id": "area-1",
                "area_name": "Invalid Area",
                "geometry": None,  # Missing geometry
                "restriction_type": "no",
            },
        ]
        
        mock_execute = AsyncMock(return_value=MagicMock(data=prohibited_areas))
        mock_select = MagicMock()
        mock_select.execute = mock_execute
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_sb.table.return_value = mock_table
        
        result = await check_route_prohibited_areas(route_geojson, mock_sb)
        
        # Should return empty - area with no geometry is skipped
        assert result == []

    async def test_multipolygon_prohibited_area_is_checked(self):
        """MultiPolygon prohibited areas are properly checked. (Requirement 6.2)"""
        mock_sb = MagicMock()
        
        # Route that passes through one of the multipolygon parts
        route_geojson = {
            "type": "LineString",
            "coordinates": [[11.605, 48.155], [11.606, 48.156]],
        }
        
        # MultiPolygon with two separate areas
        prohibited_area = {
            "id": "area-1",
            "area_name": "Multi-Part Park",
            "geometry": {
                "type": "MultiPolygon",
                "coordinates": [
                    # First polygon - route doesn't pass through
                    [[[11.570, 48.135], [11.580, 48.135], [11.580, 48.140], [11.570, 48.140], [11.570, 48.135]]],
                    # Second polygon - route passes through
                    [[[11.600, 48.150], [11.610, 48.150], [11.610, 48.160], [11.600, 48.160], [11.600, 48.150]]],
                ],
            },
            "restriction_type": "no",
        }
        
        mock_execute = AsyncMock(return_value=MagicMock(data=[prohibited_area]))
        mock_select = MagicMock()
        mock_select.execute = mock_execute
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_sb.table.return_value = mock_table
        
        result = await check_route_prohibited_areas(route_geojson, mock_sb)
        
        assert len(result) == 1
        assert result[0]["area_name"] == "Multi-Part Park"

    async def test_unnamed_prohibited_area_returns_none_for_name(self):
        """Unnamed prohibited area returns None for area_name. (Requirement 6.2)"""
        mock_sb = MagicMock()
        
        route_geojson = {
            "type": "LineString",
            "coordinates": [[11.575, 48.137], [11.576, 48.138]],
        }
        
        prohibited_area = {
            "id": "area-1",
            "area_name": None,  # Unnamed area
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [[11.570, 48.135], [11.580, 48.135], [11.580, 48.140], [11.570, 48.140], [11.570, 48.135]]
                ],
            },
            "restriction_type": "private",
        }
        
        mock_execute = AsyncMock(return_value=MagicMock(data=[prohibited_area]))
        mock_select = MagicMock()
        mock_select.execute = mock_execute
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_sb.table.return_value = mock_table
        
        result = await check_route_prohibited_areas(route_geojson, mock_sb)
        
        assert len(result) == 1
        assert result[0]["area_name"] is None
        assert result[0]["restriction_type"] == "private"
