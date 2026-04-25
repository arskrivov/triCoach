# Requirements Document

## Introduction

Redesign the existing Settings page into a cleaner, more informative Account page. The redesign renames "Settings" to "Account" throughout the app, organizes athlete profile fields into logical sections, surfaces Garmin-derived data alongside manual overrides so the user understands what the AI coach sees, and fixes the API gap where `weekly_training_hours` and `field_sources` are computed but never returned to the frontend.

## Glossary

- **Account_Page**: The redesigned page (formerly "Settings") that displays the athlete profile, field source indicators, and Garmin connection management.
- **Athlete_Profile_API**: The backend REST endpoints (`GET /api/v1/activities/profile/athlete` and `PUT /api/v1/activities/profile/athlete`) that return and update the effective athlete profile.
- **Field_Source**: A per-field indicator showing where the current effective value originated — one of `"manual"`, `"garmin"`, or `"default"`.
- **Effective_Value**: The resolved value the AI coach uses for a given profile field, determined by the merge priority: manual override > Garmin-derived > default.
- **Manual_Override**: A value explicitly entered and saved by the user, which takes precedence over any Garmin-derived value.
- **Garmin_Derived_Value**: A value automatically computed from synced Garmin activity and health data by the `athlete_profile` service.
- **Section**: A visually distinct group of related profile fields on the Account_Page (e.g., Endurance Thresholds, Heart Rate, Strength, Training Preferences, Body).
- **Navigation_Shell**: The sidebar navigation and header breadcrumb defined in `layout.tsx` that appears on all authenticated pages.
- **AthleteProfileSchema**: The Pydantic response model in `activities.py` that defines which fields the Athlete_Profile_API returns.
- **AthleteProfileUpdate**: The Pydantic request model in `activities.py` that defines which fields the Athlete_Profile_API accepts for updates.

## Requirements

### Requirement 1: Rename Settings to Account

**User Story:** As a user, I want the navigation and page to say "Account" instead of "Settings", so that the label better reflects the page's purpose of managing my athlete profile and connected services.

#### Acceptance Criteria

1. THE Navigation_Shell SHALL display the label "Account" and the href `/account` in place of the former "Settings" entry.
2. WHEN a user navigates to `/account`, THE Account_Page SHALL render the redesigned account page with the title "Account".
3. WHEN a user navigates to the former path `/settings`, THE application SHALL redirect the user to `/account`.

### Requirement 2: Fix API Schema to Include Missing Fields

**User Story:** As a developer, I want the API response to include `weekly_training_hours` and `field_sources`, so that the frontend can display all profile data and source indicators.

#### Acceptance Criteria

1. THE AthleteProfileSchema SHALL include the field `weekly_training_hours` of type `float | None`.
2. THE AthleteProfileSchema SHALL include the field `field_sources` of type `dict[str, str]`.
3. THE AthleteProfileUpdate SHALL include the field `weekly_training_hours` of type `float | None`.
4. WHEN the Athlete_Profile_API returns an effective profile, THE response SHALL contain a `field_sources` entry for every profile field with a value of `"manual"`, `"garmin"`, or `"default"`.
5. WHEN the Athlete_Profile_API returns an effective profile, THE response SHALL contain the `weekly_training_hours` value from the effective profile.

### Requirement 3: Organize Profile Fields into Logical Sections

**User Story:** As a user, I want my athlete profile fields grouped into clear sections, so that I can quickly find and understand related settings.

#### Acceptance Criteria

1. THE Account_Page SHALL display profile fields organized into the following sections: "Training Preferences", "Endurance Thresholds", "Heart Rate", "Strength", and "Body".
2. THE "Training Preferences" section SHALL contain the fields: `weekly_training_hours` and `mobility_sessions_per_week_target`.
3. THE "Endurance Thresholds" section SHALL contain the fields: `ftp_watts`, `threshold_pace_sec_per_km`, and `swim_css_sec_per_100m`.
4. THE "Heart Rate" section SHALL contain the fields: `max_hr` and `resting_hr`.
5. THE "Strength" section SHALL contain the fields: `squat_1rm_kg`, `deadlift_1rm_kg`, `bench_1rm_kg`, and `overhead_press_1rm_kg`.
6. THE "Body" section SHALL contain the field: `weight_kg`.
7. Each section SHALL display a heading label that identifies the section name.

### Requirement 4: Display Field Source Indicators

**User Story:** As a user, I want to see whether each profile value was manually set, derived from Garmin data, or is a default, so that I understand what the AI coach is using and where it came from.

#### Acceptance Criteria

1. WHEN the `field_sources` entry for a field is `"manual"`, THE Account_Page SHALL display a visual indicator (e.g., badge or label) reading "Manual" next to that field.
2. WHEN the `field_sources` entry for a field is `"garmin"`, THE Account_Page SHALL display a visual indicator reading "Garmin" next to that field.
3. WHEN the `field_sources` entry for a field is `"default"`, THE Account_Page SHALL display a visual indicator reading "Default" next to that field.
4. Each source indicator SHALL use a distinct visual style (color or variant) so that the three source types are distinguishable at a glance.

### Requirement 5: Show Garmin-Derived Values as Context

**User Story:** As a user, I want to see the Garmin-derived value for a field even when I have a manual override, so that I can compare my manual entry against what Garmin computed and decide whether to keep or clear my override.

#### Acceptance Criteria

1. THE Athlete_Profile_API SHALL include a `garmin_values` field in the response containing the Garmin-derived value for each profile field (or `null` when no Garmin-derived value exists).
2. THE EffectiveAthleteProfile model SHALL include a `garmin_values` field of type `dict[str, float | int | None]`.
3. WHEN a field has `field_sources` value `"manual"` and a non-null `garmin_values` entry, THE Account_Page SHALL display the Garmin-derived value as secondary context text (e.g., "Garmin: 250W") below or beside the input.
4. WHEN a field has `field_sources` value `"garmin"`, THE Account_Page SHALL display the Garmin-derived value as the input's current value.
5. WHEN a field has no Garmin-derived value and no manual override, THE Account_Page SHALL display an empty input with a placeholder dash.

### Requirement 6: Pre-fill Garmin-Derived Data in Inputs

**User Story:** As a user, I want fields without manual overrides to show the Garmin-derived value pre-filled, so that I can see what the AI coach is using without having to look elsewhere.

#### Acceptance Criteria

1. WHEN a field has `field_sources` value `"garmin"`, THE Account_Page SHALL display the Garmin-derived value in the input field as the current value.
2. WHEN a user modifies a Garmin-pre-filled field and saves, THE Athlete_Profile_API SHALL store the new value as a manual override.
3. WHEN a user clears a manually overridden field (sets it to empty) and saves, THE Athlete_Profile_API SHALL remove the manual override so the effective value reverts to the Garmin-derived value.

### Requirement 7: Maintain Save Behavior and Feedback

**User Story:** As a user, I want to save my profile changes with clear feedback, so that I know my updates were persisted.

#### Acceptance Criteria

1. THE Account_Page SHALL provide a save action that submits all editable profile fields to the `PUT` Athlete_Profile_API endpoint.
2. WHEN the save action succeeds, THE Account_Page SHALL display a transient success message for at least 2 seconds.
3. WHEN the save action fails, THE Account_Page SHALL display an error message describing the failure.
4. WHILE a save request is in progress, THE Account_Page SHALL disable the save button and display a loading indicator.

### Requirement 8: Garmin Connection Section

**User Story:** As a user, I want the Garmin connection management to remain accessible on the Account page, so that I can connect, disconnect, and sync my Garmin account from the same place as my profile.

#### Acceptance Criteria

1. THE Account_Page SHALL display the Garmin connection card with connection status, email, and last sync time.
2. WHEN the user is not connected to Garmin, THE Account_Page SHALL display options to connect via credentials or token import.
3. WHEN the user is connected to Garmin, THE Account_Page SHALL display options to trigger a manual sync and to disconnect.

### Requirement 9: Responsive Layout

**User Story:** As a user, I want the Account page to work well on both desktop and mobile screens, so that I can manage my profile from any device.

#### Acceptance Criteria

1. THE Account_Page SHALL use a responsive layout that displays fields in a multi-column grid on screens wider than 640px and a single-column layout on narrower screens.
2. THE Account_Page SHALL use the existing design system (Tailwind CSS utility classes and shadcn/ui components) for all UI elements.
3. All interactive elements on the Account_Page SHALL have a minimum touch target size of 44×44 pixels.
