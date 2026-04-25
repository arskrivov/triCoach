# Requirements Document

## Introduction

The Activities page and activity detail view need a comprehensive upgrade across three areas: (1) the activity feed should default to showing the last 7 days with enhanced activity cards displaying discipline-specific metrics like calories, pace, and distance; (2) the activity detail view should present grouped metric sections (speed-related, heart-rate-related, sport-specific) with min/max statistics, HR zone percentages, fitness/fatigue metrics, and an interactive GPS map; (3) an on-demand AI Coach analysis button should generate structured, data-driven workout insights — following the same interpretive coaching philosophy used in the dashboard briefing — that evaluate specific metrics like ground contact time, cadence, and power rather than presenting raw numbers.

## Glossary

- **Activity_Feed**: The frontend component (`activity-feed.tsx`) that lists activity cards on the Activities page with filter pills and pagination.
- **Activity_Card**: A single clickable card in the Activity_Feed displaying a summary of one activity (discipline icon, name, date, duration, key metrics).
- **Activity_Detail_View**: The frontend page (`activities/[id]/activity-detail-content.tsx`) that displays full information for a single activity when clicked.
- **Activity_Detail_Endpoint**: The backend GET `/activities/{activity_id}` endpoint that returns all stored fields for a single activity.
- **Activity_List_Endpoint**: The backend GET `/activities` endpoint that returns paginated activity summaries.
- **Metric_Group**: A collapsible or visually grouped section of related metrics on the Activity_Detail_View (e.g., speed-related, heart-rate-related, sport-specific).
- **Speed_Metrics_Group**: A Metric_Group containing speed and pace related values: average pace, average speed, min/max speed, min/max pace.
- **Heart_Rate_Metrics_Group**: A Metric_Group containing heart rate related values: average HR, max HR, HR zone percentages, resting HR comparison.
- **Sport_Specific_Metrics_Group**: A Metric_Group containing metrics unique to a discipline — cadence and ground contact time for running; power, normalized power, and intensity factor for cycling; stroke count for swimming; reps, sets, and volume for strength.
- **Performance_Metrics_Group**: A Metric_Group containing training load and fitness metrics: TSS, intensity factor, aerobic/anaerobic training effect, training effect label, calories.
- **Elevation_Metrics_Group**: A Metric_Group containing elevation data: total elevation gain (Höhenmeter), elevation loss.
- **HR_Zone_Percentages**: The percentage of total activity duration spent in each heart rate zone, derived from the `hr_zones` JSONB field stored per activity.
- **AI_Activity_Analysis**: An on-demand AI-generated workout analysis triggered by the user clicking an "Analyze" button on the Activity_Detail_View.
- **Analysis_Endpoint**: A new backend POST `/activities/{activity_id}/analyze` endpoint that generates the AI_Activity_Analysis.
- **Activity_Context_Builder**: A backend function that assembles all available activity data (laps, pace, HR, cadence, power, zones, training effects) into a structured text prompt for the AI model.
- **Endurance_Discipline**: Any discipline in the set {RUN, SWIM, RIDE_ROAD, RIDE_GRAVEL} that involves distance-based metrics.
- **GPS_Map**: The Mapbox-rendered route map shown on the Activity_Detail_View for activities with a polyline.

## Requirements

### Requirement 1: Default Last-7-Days View on Activities Page

**User Story:** As a triathlete, I want the Activities page to show my last 7 days of activities by default, so that I immediately see my recent training without scrolling through months of history.

#### Acceptance Criteria

1. WHEN the Activity_Feed loads for the first time, THE Activity_Feed SHALL display only activities from the last 7 calendar days, ordered by start time descending.
2. WHEN the Activity_Feed is showing the last-7-days default view, THE Activity_Feed SHALL display a clearly labeled option to view all activities (e.g., "Show all activities") so the user can switch to the full paginated feed.
3. WHEN the user selects "Show all activities", THE Activity_Feed SHALL switch to the existing paginated view showing all activities with the current discipline filter pills and load-more pagination.
4. WHEN the user applies a discipline filter while in the last-7-days view, THE Activity_Feed SHALL filter the displayed activities to only those matching the selected discipline within the last 7 days.
5. WHEN no activities exist within the last 7 days, THE Activity_Feed SHALL display a message indicating no recent activities and offer the option to view all activities.

### Requirement 2: Enhanced Activity Cards

**User Story:** As a triathlete, I want activity cards to show discipline-specific metrics at a glance — like calories, pace, distance, and total volume — so that I can quickly assess each workout without opening it.

#### Acceptance Criteria

1. THE Activity_Card SHALL display the activity discipline icon, activity name, relative date, and duration for all activity types.
2. WHEN the activity is an Endurance_Discipline, THE Activity_Card SHALL display distance and calories as secondary metrics alongside the existing pace or power stat.
3. WHEN the activity discipline is STRENGTH, THE Activity_Card SHALL display total sets, total volume in kg, and calories as secondary metrics.
4. WHEN the activity discipline is YOGA or MOBILITY, THE Activity_Card SHALL display duration and calories as secondary metrics.
5. THE Activity_Card SHALL display the calories value for all activity types when the value is available.
6. THE Activity_Card SHALL render metrics using a visually structured layout with the discipline-colored icon, primary info (name, date, duration), and secondary stats aligned consistently across card types.

### Requirement 3: Expanded Activity Detail Response

**User Story:** As a triathlete, I want the activity detail API to return all stored metrics including max HR, normalized power, cadence, intensity factor, training effects, and total volume, so that the frontend can display comprehensive workout data.

#### Acceptance Criteria

1. WHEN the Activity_Detail_Endpoint returns an activity, THE Activity_Detail_Endpoint SHALL include `max_hr`, `normalized_power_watts`, `avg_cadence`, `intensity_factor`, `aerobic_training_effect`, `anaerobic_training_effect`, `training_effect_label`, and `total_volume_kg` in the response schema.
2. WHEN the Activity_Detail_Endpoint returns an activity with `hr_zones` data, THE Activity_Detail_Endpoint SHALL include the `hr_zones` field as stored in the database without transformation.
3. WHEN any of the newly exposed fields are null in the database, THE Activity_Detail_Endpoint SHALL return null for those fields rather than omitting them from the response.

### Requirement 4: Grouped Metric Sections on Activity Detail

**User Story:** As a triathlete, I want my activity metrics organized into logical groups — speed, heart rate, sport-specific, performance, and elevation — so that I can quickly find and compare related data points.

#### Acceptance Criteria

1. WHEN the Activity_Detail_View renders an Endurance_Discipline activity, THE Activity_Detail_View SHALL display a Speed_Metrics_Group containing average pace (for running) or average speed (for cycling), and average speed derived from pace.
2. WHEN the Activity_Detail_View renders any activity with heart rate data, THE Activity_Detail_View SHALL display a Heart_Rate_Metrics_Group containing average HR and max HR.
3. WHEN the Activity_Detail_View renders an activity with `hr_zones` data, THE Activity_Detail_View SHALL display HR_Zone_Percentages as a visual bar or chart within the Heart_Rate_Metrics_Group showing the percentage of time spent in each zone.
4. WHEN the Activity_Detail_View renders a RUN activity, THE Sport_Specific_Metrics_Group SHALL display avg cadence (steps per minute) when available.
5. WHEN the Activity_Detail_View renders a RIDE_ROAD or RIDE_GRAVEL activity, THE Sport_Specific_Metrics_Group SHALL display avg power, normalized power, and intensity factor when available.
6. WHEN the Activity_Detail_View renders a STRENGTH activity, THE Sport_Specific_Metrics_Group SHALL display total sets, total volume in kg, and primary muscle groups.
7. WHEN the Activity_Detail_View renders an activity with training effect data, THE Performance_Metrics_Group SHALL display aerobic training effect, anaerobic training effect, training effect label, TSS, and calories.
8. WHEN the Activity_Detail_View renders an Endurance_Discipline activity with elevation data, THE Elevation_Metrics_Group SHALL display total elevation gain (Höhenmeter) in meters.
9. WHEN a Metric_Group has no available data for any of its metrics, THE Activity_Detail_View SHALL hide that entire group rather than showing an empty section.

### Requirement 5: GPS Map for Endurance Activities

**User Story:** As a triathlete, I want to see a map of my running and cycling routes with the GPS track, so that I can review where I trained.

#### Acceptance Criteria

1. WHEN the Activity_Detail_View renders an Endurance_Discipline activity with a non-null polyline, THE Activity_Detail_View SHALL display the GPS_Map with the decoded route rendered as a colored line on a Mapbox dark-style map.
2. WHEN the GPS_Map is displayed, THE GPS_Map SHALL show start and end markers on the route.
3. WHEN the GPS_Map is displayed, THE GPS_Map SHALL auto-fit the map bounds to show the entire route with padding.
4. WHEN the activity has no polyline data, THE Activity_Detail_View SHALL hide the GPS_Map section entirely.

### Requirement 6: On-Demand AI Activity Analysis

**User Story:** As a triathlete, I want to click an "Analyze" button on any activity to get AI-generated coaching insights about that specific workout, so that I understand what went well, what needs improvement, and what to focus on next time.

#### Acceptance Criteria

1. WHEN the Activity_Detail_View renders an activity that has no existing `ai_analysis`, THE Activity_Detail_View SHALL display an "Analyze" button in the AI Coach section.
2. WHEN the user clicks the "Analyze" button, THE Activity_Detail_View SHALL send a request to the Analysis_Endpoint and display a loading state while the analysis is being generated.
3. WHEN the Analysis_Endpoint receives a request, THE Activity_Context_Builder SHALL assemble all available activity data into a structured prompt including: discipline, duration, distance, laps (splits with per-lap pace, HR, cadence), average and max HR, HR_Zone_Percentages, average pace, average and normalized power, average cadence, TSS, intensity factor, aerobic and anaerobic training effects, elevation gain, and calories.
4. WHEN the Analysis_Endpoint generates the AI_Activity_Analysis, THE Analysis_Endpoint SHALL use the athlete profile (FTP, threshold pace, max HR, weight) as context so the AI can evaluate metrics relative to the athlete's capabilities.
5. WHEN the AI model generates the analysis, THE AI model SHALL provide interpretive coaching insights — evaluating whether specific metrics are good, acceptable, or need improvement — rather than restating raw numbers (e.g., "Your cadence of 168 spm is slightly below optimal; aim for 175-180 to reduce ground contact stress" rather than "Your cadence was 168 spm").
6. WHEN the AI model generates the analysis for a RUN activity, THE AI model SHALL evaluate running-specific metrics including cadence assessment, pace consistency across laps, HR drift analysis, and training zone adherence.
7. WHEN the AI model generates the analysis for a RIDE_ROAD or RIDE_GRAVEL activity, THE AI model SHALL evaluate cycling-specific metrics including power consistency, normalized power vs average power ratio (variability index), and intensity factor relative to FTP.
8. WHEN the AI model generates the analysis for a STRENGTH activity, THE AI model SHALL evaluate volume, exercise selection relative to muscle group balance, and set/rep patterns.
9. WHEN the Analysis_Endpoint completes the analysis, THE Analysis_Endpoint SHALL store the generated text in the activity's `ai_analysis` field and update `ai_analyzed_at` so subsequent visits display the cached result without re-generating.
10. WHEN the Activity_Detail_View renders an activity that already has an `ai_analysis`, THE Activity_Detail_View SHALL display the cached analysis text and offer a "Re-analyze" button to regenerate.
11. IF the AI model is unavailable or the API call fails, THEN THE Analysis_Endpoint SHALL return an error message and THE Activity_Detail_View SHALL display a user-friendly error indicating the analysis could not be generated.

### Requirement 7: AI Analysis Content Quality

**User Story:** As a triathlete, I want the AI workout analysis to follow the same expert coaching philosophy as the dashboard briefing — specific, data-driven, no generic filler — so that every insight is actionable and grounded in my actual performance data.

#### Acceptance Criteria

1. WHEN the Analysis_Endpoint constructs the system prompt for the AI model, THE system prompt SHALL establish the model as an expert triathlon coach with the same persona and coaching philosophy used in the dashboard Briefing_Pipeline.
2. WHEN the AI model generates the analysis, THE AI model SHALL ground every observation in a specific data point from the activity (e.g., a specific lap split, HR value, power number, or zone percentage).
3. WHEN the AI model generates the analysis, THE AI model SHALL prohibit generic wellness filler (e.g., "great job", "keep it up", "listen to your body") and require every sentence to reference activity-specific data.
4. WHEN the AI model generates the analysis, THE AI model SHALL provide at least one specific actionable recommendation for the athlete's next similar workout.
5. WHEN the AI model generates the analysis, THE AI model SHALL structure the output into clear sections: a workout summary, key observations (what went well, what needs attention), and next-session recommendations.

### Requirement 8: Frontend Type and Formatting Updates

**User Story:** As a developer, I want the frontend TypeScript types and formatting helpers to support all new metrics, so that the UI can render expanded activity data correctly.

#### Acceptance Criteria

1. THE `ActivityDetail` TypeScript type SHALL include `max_hr`, `normalized_power_watts`, `avg_cadence`, `intensity_factor`, `aerobic_training_effect`, `anaerobic_training_effect`, and `training_effect_label` fields matching the expanded backend response.
2. THE format helpers in `lib/format.ts` SHALL include a `formatSpeed` function that converts pace (sec/km) to speed (km/h) and formats it with one decimal place.
3. THE format helpers in `lib/format.ts` SHALL include a `formatCadence` function that formats cadence values with the appropriate unit (spm for running, rpm for cycling).
4. THE format helpers in `lib/format.ts` SHALL include a `formatPower` function that formats watt values with the "W" unit suffix.
5. THE format helpers in `lib/format.ts` SHALL include a `formatHRZones` function that takes the `hr_zones` JSONB data and returns an array of zone objects with zone name, duration, and percentage of total time.
6. THE `ActivitySummary` TypeScript type SHALL include `calories` so the Activity_Card can display calorie data.
