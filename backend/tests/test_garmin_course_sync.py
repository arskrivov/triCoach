"""Unit tests for garmin_course_sync.py.

Tests cover:
- GeoJSON coordinate extraction (LineString, Feature, FeatureCollection)
- GPX XML structure and content
- Turn-by-turn course point detection at significant direction changes
- Sport type mapping (RIDE_ROAD, RIDE_GRAVEL → Biking; RUN → Running)
- Error handling for invalid inputs
- sync_route_to_garmin: successful upload, route not found, no GeoJSON,
  Garmin not connected, upload failure, garmin_course_id storage
- _extract_course_id: various response formats

Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
"""

from __future__ import annotations

import math
import xml.etree.ElementTree as ET
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.garmin_course_sync import (
    GarminCourseResult,
    _bearing,
    _bearing_change,
    _detect_course_points,
    _extract_coordinates,
    _extract_course_id,
    _haversine,
    _SPORT_MAP,
    _TURN_THRESHOLD_DEG,
    convert_geojson_to_fit_course,
    sync_route_to_garmin,
)

GPX_NS = {"gpx": "http://www.topografix.com/GPX/1/1"}


# ---------------------------------------------------------------------------
# Helper to parse GPX bytes
# ---------------------------------------------------------------------------

def _parse_gpx(gpx_bytes: bytes) -> ET.Element:
    return ET.fromstring(gpx_bytes)


# ---------------------------------------------------------------------------
# Coordinate extraction tests
# ---------------------------------------------------------------------------


class TestExtractCoordinates:
    """Tests for _extract_coordinates – Requirement 4.3."""

    def test_linestring_direct(self):
        geojson = {
            "type": "LineString",
            "coordinates": [[13.38, 52.51], [13.39, 52.52]],
        }
        coords = _extract_coordinates(geojson)
        assert coords == [(52.51, 13.38), (52.52, 13.39)]

    def test_feature_with_linestring(self):
        geojson = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[1.0, 2.0], [3.0, 4.0]],
            },
        }
        coords = _extract_coordinates(geojson)
        assert coords == [(2.0, 1.0), (4.0, 3.0)]

    def test_feature_collection(self):
        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[10.0, 20.0], [30.0, 40.0]],
                    },
                }
            ],
        }
        coords = _extract_coordinates(geojson)
        assert coords == [(20.0, 10.0), (40.0, 30.0)]

    def test_unsupported_geometry_raises(self):
        with pytest.raises(ValueError, match="Unsupported geometry type"):
            _extract_coordinates({"type": "Point", "coordinates": [0, 0]})

    def test_too_few_coordinates_raises(self):
        with pytest.raises(ValueError, match="at least 2 coordinates"):
            _extract_coordinates({"type": "LineString", "coordinates": [[0, 0]]})

    def test_empty_feature_collection_raises(self):
        with pytest.raises(ValueError, match="no features"):
            _extract_coordinates({"type": "FeatureCollection", "features": []})


# ---------------------------------------------------------------------------
# Geometry helper tests
# ---------------------------------------------------------------------------


class TestGeometryHelpers:
    """Tests for haversine and bearing calculations."""

    def test_haversine_same_point(self):
        assert _haversine(52.52, 13.40, 52.52, 13.40) == 0.0

    def test_haversine_known_distance(self):
        # Berlin to Potsdam is roughly 27 km
        dist = _haversine(52.5200, 13.4050, 52.3906, 13.0645)
        assert 25_000 < dist < 30_000

    def test_bearing_east(self):
        # Moving east along the equator
        b = _bearing(0.0, 0.0, 0.0, 1.0)
        assert 89 < b < 91

    def test_bearing_north(self):
        b = _bearing(0.0, 0.0, 1.0, 0.0)
        assert b < 1 or b > 359

    def test_bearing_change_opposite(self):
        assert _bearing_change(0, 180) == pytest.approx(180, abs=0.1)

    def test_bearing_change_right_angle(self):
        assert _bearing_change(0, 90) == pytest.approx(90, abs=0.1)

    def test_bearing_change_wraparound(self):
        assert _bearing_change(350, 10) == pytest.approx(20, abs=0.1)


# ---------------------------------------------------------------------------
# Course point detection tests
# ---------------------------------------------------------------------------


class TestDetectCoursePoints:
    """Tests for turn-by-turn navigation point detection – Requirement 4.3."""

    def test_straight_line_no_turns(self):
        # Points along a straight east-west line
        coords = [(52.52, 13.38 + i * 0.002) for i in range(5)]
        cps = _detect_course_points(coords)
        assert len(cps) == 0

    def test_right_angle_turn_detected(self):
        # Go east, then turn north (90° turn)
        coords = [
            (52.5170, 13.3880),
            (52.5170, 13.3900),
            (52.5170, 13.3920),  # turn point
            (52.5190, 13.3920),
            (52.5210, 13.3920),
        ]
        cps = _detect_course_points(coords)
        assert len(cps) >= 1
        assert cps[0]["lat"] == pytest.approx(52.5170, abs=0.001)

    def test_course_point_has_required_fields(self):
        coords = [
            (52.5170, 13.3880),
            (52.5170, 13.3900),
            (52.5170, 13.3920),
            (52.5190, 13.3920),
            (52.5210, 13.3920),
        ]
        cps = _detect_course_points(coords)
        assert len(cps) >= 1
        cp = cps[0]
        assert "lat" in cp
        assert "lon" in cp
        assert "name" in cp
        assert "type" in cp
        assert cp["type"] in ("Left", "Right")

    def test_too_few_points_returns_empty(self):
        assert _detect_course_points([(0, 0), (1, 1)]) == []

    def test_multiple_turns(self):
        # Zigzag pattern with enough spacing
        coords = [
            (52.5000, 13.3800),
            (52.5000, 13.3830),
            (52.5000, 13.3860),  # turn 1
            (52.5030, 13.3860),
            (52.5060, 13.3860),  # turn 2
            (52.5060, 13.3890),
            (52.5060, 13.3920),
        ]
        cps = _detect_course_points(coords)
        assert len(cps) >= 2


# ---------------------------------------------------------------------------
# GPX output tests
# ---------------------------------------------------------------------------


class TestConvertGeojsonToFitCourse:
    """Tests for the main conversion function – Requirement 4.3."""

    @pytest.fixture
    def simple_linestring(self) -> dict:
        return {
            "type": "LineString",
            "coordinates": [
                [13.3880, 52.5170],
                [13.3900, 52.5170],
                [13.3920, 52.5170],
            ],
        }

    @pytest.fixture
    def route_with_turn(self) -> dict:
        return {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [13.3880, 52.5170],
                    [13.3900, 52.5170],
                    [13.3920, 52.5170],
                    [13.3920, 52.5190],
                    [13.3920, 52.5210],
                ],
            },
        }

    def test_returns_bytes(self, simple_linestring):
        result = convert_geojson_to_fit_course(simple_linestring, "Test", "RIDE_ROAD")
        assert isinstance(result, bytes)

    def test_valid_xml(self, simple_linestring):
        result = convert_geojson_to_fit_course(simple_linestring, "Test", "RIDE_ROAD")
        root = _parse_gpx(result)
        assert root is not None

    def test_gpx_version(self, simple_linestring):
        result = convert_geojson_to_fit_course(simple_linestring, "Test", "RIDE_ROAD")
        root = _parse_gpx(result)
        assert root.get("version") == "1.1"

    def test_course_name_in_metadata(self, simple_linestring):
        result = convert_geojson_to_fit_course(simple_linestring, "Morning Ride", "RIDE_ROAD")
        root = _parse_gpx(result)
        name = root.find(".//gpx:metadata/gpx:name", GPX_NS)
        assert name is not None
        assert name.text == "Morning Ride"

    def test_route_points_match_coordinates(self, simple_linestring):
        result = convert_geojson_to_fit_course(simple_linestring, "Test", "RIDE_ROAD")
        root = _parse_gpx(result)
        rtepts = root.findall(".//gpx:rte/gpx:rtept", GPX_NS)
        assert len(rtepts) == 3

    def test_track_points_match_coordinates(self, simple_linestring):
        result = convert_geojson_to_fit_course(simple_linestring, "Test", "RIDE_ROAD")
        root = _parse_gpx(result)
        trkpts = root.findall(".//gpx:trk/gpx:trkseg/gpx:trkpt", GPX_NS)
        assert len(trkpts) == 3

    def test_sport_mapping_ride_road(self, simple_linestring):
        result = convert_geojson_to_fit_course(simple_linestring, "Test", "RIDE_ROAD")
        root = _parse_gpx(result)
        rte_type = root.find(".//gpx:rte/gpx:type", GPX_NS)
        assert rte_type is not None
        assert rte_type.text == "Biking"

    def test_sport_mapping_ride_gravel(self, simple_linestring):
        result = convert_geojson_to_fit_course(simple_linestring, "Test", "RIDE_GRAVEL")
        root = _parse_gpx(result)
        rte_type = root.find(".//gpx:rte/gpx:type", GPX_NS)
        assert rte_type.text == "Biking"

    def test_sport_mapping_run(self, simple_linestring):
        result = convert_geojson_to_fit_course(simple_linestring, "Test", "RUN")
        root = _parse_gpx(result)
        rte_type = root.find(".//gpx:rte/gpx:type", GPX_NS)
        assert rte_type.text == "Running"

    def test_sport_mapping_unknown_defaults_to_other(self, simple_linestring):
        result = convert_geojson_to_fit_course(simple_linestring, "Test", "SWIM")
        root = _parse_gpx(result)
        rte_type = root.find(".//gpx:rte/gpx:type", GPX_NS)
        assert rte_type.text == "Other"

    def test_turn_annotated_in_route(self, route_with_turn):
        result = convert_geojson_to_fit_course(route_with_turn, "Turn Test", "RIDE_ROAD")
        root = _parse_gpx(result)
        rtepts = root.findall(".//gpx:rte/gpx:rtept", GPX_NS)
        annotated = [
            rpt for rpt in rtepts if rpt.find("gpx:name", GPX_NS) is not None
        ]
        assert len(annotated) >= 1
        assert annotated[0].find("gpx:type", GPX_NS).text in ("Left", "Right")

    def test_xml_declaration_present(self, simple_linestring):
        result = convert_geojson_to_fit_course(simple_linestring, "Test", "RIDE_ROAD")
        assert result.startswith(b"<?xml")

    def test_lat_lon_precision(self, simple_linestring):
        result = convert_geojson_to_fit_course(simple_linestring, "Test", "RIDE_ROAD")
        root = _parse_gpx(result)
        trkpt = root.find(".//gpx:trk/gpx:trkseg/gpx:trkpt", GPX_NS)
        lat = trkpt.get("lat")
        # Should have 7 decimal places
        assert "." in lat
        decimals = lat.split(".")[1]
        assert len(decimals) == 7


# ---------------------------------------------------------------------------
# _extract_course_id tests
# ---------------------------------------------------------------------------


class TestExtractCourseId:
    """Tests for _extract_course_id helper – Requirements 4.1, 4.2."""

    def test_course_service_response(self):
        """Course-service upload returns a list with courseId."""
        response = [{"courseId": 12345678, "courseName": "My Course"}]
        assert _extract_course_id(response) == 12345678

    def test_course_service_dict_response(self):
        """Course-service may also return a dict with courseId."""
        response = {"courseId": 12345678, "courseName": "My Course"}
        assert _extract_course_id(response) == 12345678

    def test_standard_garmin_response(self):
        """Fallback: activity upload response with detailedImportResult."""
        response = {
            "detailedImportResult": {
                "successes": [{"internalId": 12345678}],
            }
        }
        assert _extract_course_id(response) == 12345678

    def test_none_response_returns_zero(self):
        assert _extract_course_id(None) == 0

    def test_empty_dict_returns_zero(self):
        assert _extract_course_id({}) == 0

    def test_empty_successes_list(self):
        response = {
            "detailedImportResult": {
                "successes": [],
            }
        }
        assert _extract_course_id(response) == 0

    def test_successes_missing_internal_id(self):
        response = {
            "detailedImportResult": {
                "successes": [{"someOtherField": "value"}],
            }
        }
        assert _extract_course_id(response) == 0

    def test_string_internal_id_converted_to_int(self):
        response = {
            "detailedImportResult": {
                "successes": [{"internalId": "42"}],
            }
        }
        assert _extract_course_id(response) == 42

    def test_list_response_returns_zero(self):
        """A list response (unexpected format) returns sentinel 0."""
        assert _extract_course_id([{"id": 123}]) == 0


# ---------------------------------------------------------------------------
# sync_route_to_garmin tests
# ---------------------------------------------------------------------------


def _make_mock_sb(
    route_data: list[dict] | None = None,
) -> MagicMock:
    """Build a mock Supabase AsyncClient for sync_route_to_garmin tests.

    sb.table() is synchronous in the Supabase SDK, so we use MagicMock
    for the top-level object and the chained query builders. Only the
    terminal .execute() calls are AsyncMock (they are awaited).
    """
    sb = MagicMock()

    # --- routes table: select chain ---
    route_select_chain = MagicMock()
    route_select_chain.eq.return_value = route_select_chain
    route_select_chain.limit.return_value = route_select_chain
    route_select_chain.execute = AsyncMock(
        return_value=MagicMock(data=route_data if route_data is not None else [])
    )

    # --- routes table: update chain ---
    route_update_chain = MagicMock()
    route_update_chain.eq.return_value = route_update_chain
    route_update_chain.execute = AsyncMock(return_value=MagicMock(data=[]))

    # Build a single routes table mock so the same instance is returned
    # every time sb.table("routes") is called.
    routes_table_mock = MagicMock()
    routes_table_mock.select.return_value = route_select_chain
    routes_table_mock.update.return_value = route_update_chain

    def table_router(name: str):
        if name == "routes":
            return routes_table_mock
        # Fallback for any other table
        fallback = MagicMock()
        fallback.select.return_value = fallback
        fallback.eq.return_value = fallback
        fallback.limit.return_value = fallback
        fallback.execute = AsyncMock(return_value=MagicMock(data=[]))
        return fallback

    sb.table = MagicMock(side_effect=table_router)
    return sb


_SAMPLE_GEOJSON = {
    "type": "LineString",
    "coordinates": [
        [13.3880, 52.5170],
        [13.3900, 52.5170],
        [13.3920, 52.5170],
    ],
}

_SAMPLE_ROUTE = {
    "id": "route-uuid-1",
    "user_id": "user-uuid-1",
    "name": "Morning Ride",
    "sport": "RIDE_ROAD",
    "geojson": _SAMPLE_GEOJSON,
}


class TestSyncRouteToGarmin:
    """Tests for sync_route_to_garmin – Requirements 4.1, 4.2, 4.4, 4.5."""

    @pytest.mark.asyncio
    async def test_successful_upload(self):
        """Validates: Requirements 4.1, 4.2 – successful course upload and ID storage."""
        sb = _make_mock_sb(route_data=[_SAMPLE_ROUTE])

        mock_garmin_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.json.return_value = [{"courseId": 55555, "courseName": "Morning Ride"}]
        mock_garmin_client.client.request.return_value = mock_resp

        with patch(
            "app.services.garmin_course_sync.get_garmin_client",
            new_callable=AsyncMock,
            return_value=mock_garmin_client,
        ):
            result = await sync_route_to_garmin("route-uuid-1", "user-uuid-1", sb)

        assert isinstance(result, GarminCourseResult)
        assert result.garmin_course_id == 55555
        assert result.course_name == "Morning Ride"
        assert result.uploaded_at  # non-empty ISO timestamp

    @pytest.mark.asyncio
    async def test_route_not_found_raises_404(self):
        """Validates: Requirement 4.1 – route must exist."""
        sb = _make_mock_sb(route_data=[])

        with pytest.raises(HTTPException) as exc_info:
            await sync_route_to_garmin("nonexistent-route", "user-uuid-1", sb)

        assert exc_info.value.status_code == 404
        assert "not found" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_route_without_geojson_raises_400(self):
        """Validates: Requirement 4.1 – route must have GeoJSON data."""
        route_no_geojson = {**_SAMPLE_ROUTE, "geojson": None}
        sb = _make_mock_sb(route_data=[route_no_geojson])

        with pytest.raises(HTTPException) as exc_info:
            await sync_route_to_garmin("route-uuid-1", "user-uuid-1", sb)

        assert exc_info.value.status_code == 400
        assert "no geojson" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_garmin_not_connected_raises_400(self):
        """Validates: Requirement 4.4 – Garmin account not connected."""
        sb = _make_mock_sb(route_data=[_SAMPLE_ROUTE])

        with patch(
            "app.services.garmin_course_sync.get_garmin_client",
            new_callable=AsyncMock,
            side_effect=HTTPException(
                status_code=400,
                detail="Garmin account not connected",
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await sync_route_to_garmin("route-uuid-1", "user-uuid-1", sb)

            assert exc_info.value.status_code == 400
            assert "not connected" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_upload_failure_raises_500(self):
        """Validates: Requirement 4.5 – upload failure returns clear error."""
        sb = _make_mock_sb(route_data=[_SAMPLE_ROUTE])

        mock_garmin_client = MagicMock()
        mock_garmin_client.client.request.side_effect = RuntimeError(
            "Garmin Connect returned 503"
        )
        mock_garmin_client.upload_activity.side_effect = RuntimeError(
            "Garmin Connect returned 503"
        )

        with patch(
            "app.services.garmin_course_sync.get_garmin_client",
            new_callable=AsyncMock,
            return_value=mock_garmin_client,
        ):
            with pytest.raises(HTTPException) as exc_info:
                await sync_route_to_garmin("route-uuid-1", "user-uuid-1", sb)

            assert exc_info.value.status_code == 500
            assert "failed to upload" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_garmin_course_id_stored_on_route(self):
        """Validates: Requirement 4.2 – garmin_course_id is persisted on the route record."""
        sb = _make_mock_sb(route_data=[_SAMPLE_ROUTE])

        mock_garmin_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.json.return_value = [{"courseId": 77777, "courseName": "Morning Ride"}]
        mock_garmin_client.client.request.return_value = mock_resp

        # Capture the update chain mock before the call
        routes_table = sb.table("routes")
        update_mock = routes_table.update

        with patch(
            "app.services.garmin_course_sync.get_garmin_client",
            new_callable=AsyncMock,
            return_value=mock_garmin_client,
        ):
            await sync_route_to_garmin("route-uuid-1", "user-uuid-1", sb)

        # Verify the update call was made with the correct garmin_course_id
        update_mock.assert_called_once_with({"garmin_course_id": 77777})

    @pytest.mark.asyncio
    async def test_route_with_empty_geojson_dict_raises_400(self):
        """Validates: Requirement 4.1 – empty geojson dict is treated as missing."""
        route_empty_geojson = {**_SAMPLE_ROUTE, "geojson": {}}
        sb = _make_mock_sb(route_data=[route_empty_geojson])

        # Empty dict is falsy in Python, so it should hit the "no GeoJSON" check
        with pytest.raises(HTTPException) as exc_info:
            await sync_route_to_garmin("route-uuid-1", "user-uuid-1", sb)

        assert exc_info.value.status_code == 400
