# Implementation Plan: Workout Route Integration

## Overview

This implementation plan covers the integration of routes with workouts, enabling athletes to attach routes to RUN, RIDE_ROAD, and RIDE_GRAVEL workouts, receive smart route suggestions based on popularity and discipline compatibility, sync cycling routes to Garmin for turn-by-turn navigation, and filter routes by road type and prohibited areas.

The implementation is organized into four main components:
1. **Database** - Schema migrations for new tables and columns
2. **Backend Services** - Core business logic for route suggestions, popularity tracking, Garmin sync, and prohibited areas
3. **Backend Routers** - API endpoints for workout-route linking and new route features
4. **Frontend** - UI components for route selection, workout context mode, and Garmin sync

## Tasks

- [x] 1. Database Schema Updates
  - [x] 1.1 Add route_id column to workouts table
    - Create migration to add `route_id UUID REFERENCES routes(id) ON DELETE SET NULL` to workouts table
    - Add index `idx_workouts_route_id` for efficient lookups
    - _Requirements: 8.1_

  - [x] 1.2 Add Garmin course tracking and surface breakdown to routes table
    - Add `garmin_course_id BIGINT` column to routes table
    - Add `surface_breakdown JSONB` column to routes table
    - Add index `idx_routes_garmin_course_id` for Garmin course lookups
    - _Requirements: 8.2, 8.6_

  - [x] 1.3 Create route_segment_popularity table
    - Create table with fields: id (UUID), segment_hash (TEXT), discipline (TEXT), usage_count (INT), last_used_at (TIMESTAMPTZ), coordinates (JSONB), created_at (TIMESTAMPTZ)
    - Add unique constraint on (segment_hash, discipline)
    - Add indexes for segment_hash, discipline, and last_used_at
    - _Requirements: 8.3, 8.4_

  - [x] 1.4 Create cycling_prohibited_areas table
    - Create table with fields: id (UUID), area_name (TEXT), geometry (JSONB), osm_id (BIGINT), source (TEXT), restriction_type (TEXT), updated_at (TIMESTAMPTZ), created_at (TIMESTAMPTZ)
    - Add GIN index on geometry for spatial queries
    - _Requirements: 8.5_

- [x] 2. Checkpoint - Verify database migrations
  - Ensure all migrations applied successfully, ask the user if questions arise.

- [x] 3. Backend Services - Route Popularity
  - [x] 3.1 Create route popularity service
    - Create `backend/app/services/route_popularity.py`
    - Implement `hash_segment(lat1, lng1, lat2, lng2)` function to create consistent segment hashes at ~100m resolution (4 decimal places)
    - Implement `extract_and_store_segments(activity_id, polyline, discipline, sb)` to extract segments from activity GPS data and update popularity counters
    - Only process activities with ≥500m valid GPS data
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

  - [x] 3.2 Implement popularity query with time decay
    - Implement `get_segment_popularity(segment_hashes, discipline, sb)` function
    - Apply time decay: 90-180 days = 50% weight, >180 days = 25% weight
    - Return usage counts for given segment hashes
    - _Requirements: 3.4_

  - [x] 3.3 Write unit tests for route popularity service
    - Test segment hashing consistency
    - Test time decay calculations
    - Test minimum distance filtering (500m)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Backend Services - Prohibited Areas
  - [x] 4.1 Create prohibited areas service
    - Create `backend/app/services/prohibited_areas.py`
    - Implement `check_route_prohibited_areas(geojson, sb)` to check if route passes through cycling prohibited areas
    - Return list of intersecting areas with names and coordinates
    - _Requirements: 6.1, 6.2_

  - [x] 4.2 Implement OSM data refresh for prohibited areas
    - Implement `refresh_prohibited_areas_from_osm(bounds, sb)` to fetch areas tagged with bicycle=no, bicycle=dismount, or access=no from OpenStreetMap Overpass API
    - Update the cycling_prohibited_areas table with fetched data
    - _Requirements: 6.1, 6.4_

  - [x] 4.3 Write unit tests for prohibited areas service
    - Test route intersection detection
    - Test handling of missing prohibited area data
    - _Requirements: 6.2, 6.5_

- [x] 5. Backend Services - Route Suggestions
  - [x] 5.1 Create route suggestion service
    - Create `backend/app/services/route_suggestions.py`
    - Define `RouteSuggestion` dataclass with fields: route_id, name, distance_meters, elevation_gain_meters, popularity_score, discipline_match_score, distance_match_score, elevation_match_score, combined_score, usage_count_90d, surface_breakdown
    - _Requirements: 2.1_

  - [x] 5.2 Implement route suggestion ranking algorithm
    - Implement `get_route_suggestions(user_id, discipline, target_distance_meters, start_lat, start_lng, target_elevation_gain, limit, sb)` function
    - Calculate combined score: popularity (40%), route quality (30%), distance match (20%), elevation match (10%)
    - _Requirements: 2.7_

  - [x] 5.3 Implement discipline-specific filtering for suggestions
    - For RIDE_ROAD: Filter to routes with ≥90% paved segments
    - For all cycling: Exclude routes through prohibited areas
    - For RUN: Include park paths, trails, and pedestrian areas
    - Handle routes with <10% unknown road type as valid for cycling
    - _Requirements: 2.2, 2.3, 2.4, 2.6_

  - [x] 5.4 Implement popularity indicator calculation
    - Calculate usage count in last 90 days for each route/segment
    - Include popularity indicator in suggestion response
    - _Requirements: 2.5_

  - [x] 5.5 Write unit tests for route suggestion service
    - Test ranking algorithm weights
    - Test discipline-specific filtering
    - Test popularity score calculation
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [x] 6. Backend Services - Garmin Course Sync
  - [x] 6.1 Create Garmin course sync service
    - Create `backend/app/services/garmin_course_sync.py`
    - Define `GarminCourseResult` dataclass with fields: garmin_course_id, course_name, uploaded_at
    - _Requirements: 4.1_

  - [x] 6.2 Implement GeoJSON to Garmin course conversion
    - Implement `convert_geojson_to_fit_course(geojson, name, sport)` function
    - Include turn-by-turn navigation points derived from route geometry
    - _Requirements: 4.3_

  - [x] 6.3 Implement Garmin course upload
    - Implement `sync_route_to_garmin(route_id, user_id, sb)` function
    - Upload course to Garmin Connect using garminconnect library
    - Store garmin_course_id on the route record
    - Handle Garmin not connected error (400)
    - Handle upload failures with clear error messages
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [x] 6.4 Write unit tests for Garmin course sync service
    - Test GeoJSON to FIT conversion
    - Test error handling for disconnected Garmin
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

- [x] 7. Checkpoint - Verify backend services
  - Ensure all backend services are implemented and tests pass, ask the user if questions arise.

- [x] 8. Backend Routers - Workouts Router Extensions
  - [x] 8.1 Update workout models for route linking
    - Add `route_id: str | None = None` to WorkoutUpdate model
    - Add `route_id: str | None` and `route: RouteResponse | None` to WorkoutResponse model
    - Update WorkoutRow model in `app/models.py`
    - _Requirements: 1.4, 1.5_

  - [x] 8.2 Implement route linking endpoints
    - Add `PUT /workouts/{workout_id}/route` endpoint to link a route to a workout
    - Add `DELETE /workouts/{workout_id}/route` endpoint to unlink a route from a workout
    - Validate that discipline is RUN, RIDE_ROAD, or RIDE_GRAVEL before linking
    - _Requirements: 1.4, 1.6, 1.7_

  - [x] 8.3 Update get_workout to include route data
    - Modify GET /workouts/{workout_id} to fetch and include linked route data
    - Include route name, distance, elevation gain, and geojson for map preview
    - _Requirements: 1.5_

  - [x] 8.4 Write integration tests for workout route linking
    - Test linking route to workout
    - Test unlinking route from workout
    - Test discipline validation
    - _Requirements: 1.4, 1.6, 1.7_

- [x] 9. Backend Routers - Routes Router Extensions
  - [x] 9.1 Update route models for new fields
    - Add `garmin_course_id: int | None` and `surface_breakdown: dict | None` to RouteResponse model
    - Update RouteRow model in `app/models.py`
    - _Requirements: 8.2, 8.6_

  - [x] 9.2 Implement route suggestions endpoint
    - Add `POST /routes/suggestions` endpoint
    - Accept RouteSuggestionRequest with discipline, target_distance_meters, start_lat, start_lng, target_elevation_gain
    - Return list of RouteSuggestionResponse with popularity and combined scores
    - _Requirements: 2.1, 2.5, 2.7_

  - [x] 9.3 Implement Garmin course sync endpoint
    - Add `POST /routes/{route_id}/sync-garmin` endpoint
    - Return GarminSyncResponse with garmin_course_id and message
    - Only allow for cycling routes (RIDE_ROAD, RIDE_GRAVEL)
    - _Requirements: 4.1, 4.6_

  - [x] 9.4 Implement prohibited area check endpoint
    - Add `GET /routes/{route_id}/check-prohibited` endpoint
    - Return ProhibitedAreaCheck with has_prohibited_areas flag and list of areas
    - _Requirements: 6.2, 6.3_

  - [x] 9.5 Update route generation to include surface breakdown
    - Modify generate endpoint to calculate and return surface breakdown
    - Show percentage of each surface type (asphalt, gravel, dirt, etc.)
    - _Requirements: 5.5_

  - [x] 9.6 Write integration tests for routes router extensions
    - Test route suggestions endpoint
    - Test Garmin sync endpoint
    - Test prohibited area check endpoint
    - _Requirements: 2.1, 4.1, 6.2_

- [x] 10. Checkpoint - Verify backend routers
  - Ensure all backend router extensions are implemented and tests pass, ask the user if questions arise.

- [x] 11. Frontend Types and API
  - [x] 11.1 Update frontend types for route integration
    - Add `garmin_course_id: number | null` and `surface_breakdown: Record<string, number> | null` to Route interface
    - Add `route_id: string | null` and `route: Route | null` to Workout interface (create if needed)
    - Add RouteSuggestion interface
    - Add WorkoutRouteContext interface
    - _Requirements: 1.5, 2.5, 8.2, 8.6_

  - [x] 11.2 Add API functions for route integration
    - Add `linkRouteToWorkout(workoutId, routeId)` function
    - Add `unlinkRouteFromWorkout(workoutId)` function
    - Add `getRouteSuggestions(params)` function
    - Add `syncRouteToGarmin(routeId)` function
    - Add `checkProhibitedAreas(routeId)` function
    - _Requirements: 1.4, 1.6, 2.1, 4.1, 6.2_

- [x] 12. Frontend - Workout Detail Route Section
  - [x] 12.1 Create route section component
    - Create `frontend/app/(app)/workouts/[id]/route-section.tsx`
    - Display "Add Route" button if no route is linked
    - Display route preview card with map, distance, elevation when linked
    - Display "Remove Route" and "Sync to Garmin" buttons when linked
    - Only show for RUN, RIDE_ROAD, RIDE_GRAVEL disciplines
    - _Requirements: 1.1, 1.5, 1.6, 1.7_

  - [x] 12.2 Implement Garmin sync button functionality
    - Add "Sync to Garmin" button for cycling workouts only
    - Show loading state during sync
    - Display success message with garmin_course_id
    - Handle errors (Garmin not connected, sync failed)
    - _Requirements: 4.1, 4.4, 4.5, 4.6_

  - [x] 12.3 Create workout detail page
    - Create `frontend/app/(app)/workouts/[id]/page.tsx` if it doesn't exist
    - Integrate RouteSection component
    - Fetch workout with route data
    - _Requirements: 1.1, 1.5_

- [x] 13. Frontend - Routes Page Workout Context Mode
  - [x] 13.1 Implement workout context detection
    - Parse URL parameters: workout_id, discipline, duration
    - Calculate suggested distance from duration and typical pace
    - Store workout context in component state
    - _Requirements: 7.1, 7.2, 7.5_

  - [x] 13.2 Add workout context banner
    - Display banner when in workout context mode
    - Show workout name and target distance
    - Include "Cancel" button to exit context mode
    - _Requirements: 1.3_

  - [x] 13.3 Implement route selection in context mode
    - Show "Select" button on route cards when in context mode
    - On select: call linkRouteToWorkout API
    - Redirect back to workout detail page after linking
    - _Requirements: 1.4, 7.4_

  - [x] 13.4 Pre-filter routes by discipline in context mode
    - Filter displayed routes to match workout discipline
    - Pre-fill sport type in new route form
    - _Requirements: 7.1_

- [x] 14. Frontend - New Route Page Context Mode
  - [x] 14.1 Implement workout context in new route page
    - Parse workout context from URL parameters
    - Pre-fill sport type based on workout discipline
    - Suggest target distance based on workout duration
    - _Requirements: 7.1, 7.2_

  - [x] 14.2 Auto-link route on save in context mode
    - After saving new route, automatically link to originating workout
    - Redirect back to workout detail view
    - _Requirements: 7.3_

- [x] 15. Frontend - Route Suggestion Cards
  - [x] 15.1 Create route suggestion card component
    - Create component to display suggested routes
    - Show route name, distance, elevation
    - Display popularity indicator (🔥 Popular, ⭐ Recommended)
    - Show usage count badge: "Used by X athletes"
    - Display surface breakdown for cycling routes
    - _Requirements: 2.5_

  - [x] 15.2 Integrate suggestions into routes page
    - Fetch and display route suggestions when in workout context mode
    - Show suggestions section above saved routes
    - Allow selecting suggested routes for linking
    - _Requirements: 2.1, 2.5_

- [x] 16. Frontend - Prohibited Area Warning
  - [x] 16.1 Implement prohibited area warning display
    - Check for prohibited areas when viewing cycling route
    - Display warning banner if route passes through prohibited areas
    - Show area names in warning message
    - _Requirements: 6.3_

- [x] 17. Checkpoint - Verify frontend implementation
  - Ensure all frontend components are implemented and working, ask the user if questions arise.

- [x] 18. Integration - Route Generator Surface Breakdown
  - [x] 18.1 Update route generator to calculate surface breakdown
    - Modify `backend/app/services/route_generator.py` to extract surface details from GraphHopper response
    - Calculate percentage of each surface type
    - Include surface_breakdown in RouteOption response
    - _Requirements: 5.5_

  - [x] 18.2 Update route save to store surface breakdown
    - Modify save_route endpoint to accept and store surface_breakdown
    - Update frontend to pass surface_breakdown when saving route
    - _Requirements: 5.5, 8.6_

- [x] 19. Integration - Activity Sync Popularity Extraction
  - [x] 19.1 Integrate popularity extraction into Garmin sync
    - Modify `backend/app/services/garmin_sync.py` to call extract_and_store_segments after activity sync
    - Extract segments from activity polyline
    - Only process activities with valid GPS data ≥500m
    - _Requirements: 3.1, 3.5_

- [x] 20. Final Checkpoint - End-to-end verification
  - Ensure all components work together, all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The implementation follows the existing project patterns:
  - Backend: FastAPI async, Supabase client, Pydantic models
  - Frontend: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui
- Database migrations should be applied via Supabase SQL Editor
- Property-based tests are not included as the design does not define correctness properties
