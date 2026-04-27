# Requirements Document

## Introduction

The Workout Route Integration feature connects the existing route planner with scheduled workouts for running and cycling disciplines. Athletes can attach routes to specific workouts in their training plan, receive intelligent route suggestions based on popularity and road type restrictions, and sync routes to their Garmin bike computer for turn-by-turn navigation during outdoor sessions. The feature ensures that suggested routes are appropriate for the activity type — for example, cycling routes only use paved bike roads and avoid parks where cycling is prohibited, while running routes can include park paths and trails.

## Glossary

- **Workout_Route**: A link between a workout (from the `workouts` table) and a route (from the `routes` table), stored as a `route_id` foreign key on the workout record.
- **Route_Suggestion**: An intelligently recommended route based on the workout's discipline, target distance, user location, and community popularity data.
- **Route_Popularity**: A score derived from how frequently a route or route segment is used by other athletes in the community for a given discipline.
- **Route_Segment**: A portion of a route between two points, used for popularity analysis and road type classification.
- **Road_Type_Restriction**: Rules that filter routes based on surface type and legal access — cycling routes must use paved bike roads, running routes can use paths and trails.
- **Community_Validation**: A route is considered validated when the majority of its segments are popular among athletes of the same discipline, or when it has been explicitly recommended by other users.
- **Garmin_Course_Sync**: The process of converting a route to Garmin FIT/GPX format and uploading it to Garmin Connect, where it syncs to the user's Garmin device for turn-by-turn navigation.
- **Paved_Bike_Road**: A road segment with surface type asphalt, paved, or concrete that is legally accessible to cyclists (not a pedestrian-only path or prohibited area).
- **Cycling_Prohibited_Area**: A geographic zone (such as certain parks) where cycling is not permitted, identified through OpenStreetMap access tags or local restriction data.

## Requirements

### Requirement 1: Workout-Route Linking

**User Story:** As a triathlete, I want to attach a route to a scheduled running or cycling workout, so that I know exactly where to train and can follow the route on my device.

#### Acceptance Criteria

1. WHEN the user views a workout detail for a RUN, RIDE_ROAD, or RIDE_GRAVEL discipline, THE system SHALL display an "Add Route" button if no route is currently attached.
2. WHEN the user clicks "Add Route" on a workout, THE system SHALL navigate to the routes page with the workout context preserved (workout_id, discipline, estimated duration).
3. WHEN the user is on the routes page with workout context, THE system SHALL display a banner indicating they are selecting a route for a specific workout.
4. WHEN the user saves or selects a route while in workout context mode, THE system SHALL link the route to the workout by storing the route_id on the workout record.
5. WHEN a workout has an attached route, THE workout detail view SHALL display the route name, distance, elevation gain, and a map preview.
6. WHEN a workout has an attached route, THE system SHALL display a "Remove Route" button to unlink the route from the workout.
7. THE workout-route linking SHALL only be available for disciplines RUN, RIDE_ROAD, and RIDE_GRAVEL — not for SWIM, STRENGTH, YOGA, or MOBILITY.

### Requirement 2: Smart Route Suggestions

**User Story:** As a triathlete, I want the system to suggest routes based on what other athletes use and what's appropriate for my activity type, so that I can discover popular and safe training routes.

#### Acceptance Criteria

1. WHEN the user requests route suggestions, THE system SHALL consider the workout discipline, target distance (derived from workout duration and expected pace), and user's starting location.
2. WHEN suggesting routes for running, THE Route_Suggestion_Engine SHALL prioritize routes with high popularity among runners, including park paths, trails, and pedestrian areas.
3. WHEN suggesting routes for cycling (RIDE_ROAD), THE Route_Suggestion_Engine SHALL only suggest routes where at least 90% of segments are on paved bike roads (asphalt, paved, or concrete surface with bike access).
4. WHEN suggesting routes for cycling, THE Route_Suggestion_Engine SHALL exclude routes that pass through Cycling_Prohibited_Areas (parks with no-cycling rules, pedestrian zones).
5. WHEN suggesting routes, THE system SHALL display a popularity indicator showing how many athletes have used each route or its segments in the past 90 days.
6. WHEN a route has unknown road type for less than 10% of its total distance, THE system SHALL still consider it valid for cycling suggestions.
7. THE Route_Suggestion_Engine SHALL rank suggestions by a combined score of: popularity (40%), route quality for discipline (30%), distance match (20%), and elevation profile match (10%).

### Requirement 3: Route Popularity Data Collection

**User Story:** As a platform operator, I want to collect anonymized route usage data from completed activities, so that the system can suggest popular routes to other athletes.

#### Acceptance Criteria

1. WHEN an activity with GPS data is synced from Garmin, THE system SHALL extract the route segments and update the popularity counters for each segment.
2. THE popularity data SHALL be stored anonymously — only segment coordinates and usage counts per discipline, not user identifiers.
3. THE popularity data SHALL be aggregated at the segment level (approximately 100m resolution) to enable matching partial route overlaps.
4. THE system SHALL decay popularity scores over time, with activities older than 90 days contributing 50% weight and activities older than 180 days contributing 25% weight.
5. THE popularity data collection SHALL only process activities with valid GPS polylines of at least 500 meters.

### Requirement 4: Garmin Course Sync for Cycling

**User Story:** As a cyclist, I want my workout route to sync to my Garmin bike computer, so that I can follow turn-by-turn navigation during my ride.

#### Acceptance Criteria

1. WHEN a cycling workout (RIDE_ROAD or RIDE_GRAVEL) has an attached route and the user clicks "Sync to Garmin", THE system SHALL convert the route to Garmin course format and upload it to Garmin Connect.
2. WHEN the route is uploaded to Garmin Connect, THE system SHALL store the `garmin_course_id` on the route record for tracking.
3. WHEN a route is synced to Garmin, THE Garmin device SHALL receive the course with turn-by-turn navigation points derived from the route geometry.
4. WHEN the user's Garmin account is not connected, THE system SHALL display a message directing them to connect Garmin in Settings.
5. WHEN a route sync fails, THE system SHALL display a clear error message and allow the user to retry.
6. THE Garmin course sync SHALL be available for cycling workouts only — running workouts do not require course sync as runners typically don't use turn-by-turn navigation.

### Requirement 5: Route Filtering by Road Type

**User Story:** As a cyclist, I want the route planner to only generate routes on paved bike roads, so that I don't end up on trails or paths unsuitable for my road bike.

#### Acceptance Criteria

1. WHEN generating routes for RIDE_ROAD discipline, THE Route_Generator SHALL apply a custom model that strongly penalizes unpaved surfaces (gravel, dirt, grass, sand) and non-bike roads (footways, paths, tracks).
2. WHEN generating routes for RIDE_ROAD discipline, THE Route_Generator SHALL exclude segments tagged with bicycle=no or access=private in OpenStreetMap data.
3. WHEN generating routes for RIDE_GRAVEL discipline, THE Route_Generator SHALL prefer gravel and dirt surfaces while still avoiding pedestrian-only paths.
4. WHEN generating routes for RUN discipline, THE Route_Generator SHALL allow all surface types suitable for running, including trails, paths, and park routes.
5. THE route generation response SHALL include a surface breakdown showing the percentage of each surface type (asphalt, gravel, dirt, etc.) in the generated route.

### Requirement 6: Cycling Prohibited Area Detection

**User Story:** As a cyclist, I want the system to avoid suggesting routes through parks or areas where cycling is prohibited, so that I don't accidentally break local rules.

#### Acceptance Criteria

1. THE system SHALL maintain a database of Cycling_Prohibited_Areas derived from OpenStreetMap data (areas tagged with bicycle=no, bicycle=dismount, or access=no for cyclists).
2. WHEN generating or suggesting cycling routes, THE system SHALL check if any route segment passes through a Cycling_Prohibited_Area and exclude such routes.
3. WHEN a route passes through a known Cycling_Prohibited_Area, THE system SHALL display a warning to the user if they attempt to use it for a cycling workout.
4. THE Cycling_Prohibited_Area data SHALL be refreshed periodically (at least monthly) from OpenStreetMap to reflect current restrictions.
5. IF the prohibited area data is unavailable for a region, THE system SHALL rely on road type filtering only and display a disclaimer that local restrictions may apply.

### Requirement 7: Route Context in Workout Creation Flow

**User Story:** As a triathlete, I want to create a route directly from a workout and have it automatically linked, so that I don't have to manually connect them afterward.

#### Acceptance Criteria

1. WHEN the user clicks "Add Route" from a workout, THE routes page SHALL pre-fill the sport type based on the workout discipline (RUN → RUN, RIDE_ROAD → RIDE_ROAD, RIDE_GRAVEL → RIDE_GRAVEL).
2. WHEN the user clicks "Add Route" from a workout, THE routes page SHALL suggest a target distance based on the workout's estimated duration and typical pace for the discipline.
3. WHEN the user saves a new route while in workout context mode, THE system SHALL automatically link the route to the originating workout and redirect back to the workout detail view.
4. WHEN the user selects an existing saved route while in workout context mode, THE system SHALL link that route to the workout and redirect back to the workout detail view.
5. THE workout context mode SHALL be indicated by URL parameters (e.g., `/routes/new?workout_id=xxx&discipline=RUN`) that persist through the route creation flow.

### Requirement 8: Database Schema Updates

**User Story:** As a developer, I want the database schema to support workout-route linking and route popularity tracking, so that the system can store and query this data efficiently.

#### Acceptance Criteria

1. THE `workouts` table SHALL be extended with a `route_id` column (UUID, nullable, FK to routes.id) to link workouts to routes.
2. THE `routes` table SHALL be extended with a `garmin_course_id` column (bigint, nullable) to track Garmin course sync status.
3. A new `route_segment_popularity` table SHALL be created with fields: id, segment_hash (text, indexed), discipline (text), usage_count (int), last_used_at (timestamp), coordinates (JSONB).
4. THE `route_segment_popularity` table SHALL have a unique constraint on (segment_hash, discipline) to prevent duplicate entries.
5. A new `cycling_prohibited_areas` table SHALL be created with fields: id, area_name (text), geometry (JSONB or PostGIS geometry), source (text), updated_at (timestamp).
6. THE `routes` table SHALL be extended with a `surface_breakdown` column (JSONB, nullable) to store the percentage of each surface type.
7. ALL new columns on existing tables SHALL be nullable to maintain backward compatibility with existing data.

