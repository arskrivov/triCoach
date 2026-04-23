# Requirements Document

## Introduction

The AI Coach briefing system currently has several shortcomings: it feeds today's partial activity data (steps, calories) to the AI as if finalized, produces surface-level number recitations instead of actionable coaching, outputs only 3 recommendations without a guaranteed watchout item, treats all 7 days of data equally, and lacks a coherent triathlon-specific coaching philosophy. This feature enhances the briefing pipeline end-to-end — fixing data timing, upgrading prompt quality, enforcing a structured 4-recommendation output with a mandatory watchout, applying recency weighting, and grounding all advice in evidence-based triathlon coaching science.

## Glossary

- **Briefing_Pipeline**: The backend subsystem in `dashboard.py` that collects health and training data, builds an AI prompt, calls the LLM, parses the response, and returns a structured briefing object.
- **Daily_Digest**: The 7-day array of per-date health and training entries built by `_build_daily_prompt_digest` and sent to the AI model as context.
- **Prompt_Builder**: The `_build_ai_prompt` function that assembles the Daily_Digest, fitness metrics, goals, and today's planned workouts into the JSON payload sent to the AI model.
- **System_Prompt**: The instruction text passed to the OpenAI API as the `instructions` parameter in `_generate_briefing`, defining the AI's persona, analysis rules, and output format.
- **Heuristic_Fallback**: The `_heuristic_briefing` function that generates a rule-based briefing when the OpenAI API is unavailable.
- **Finalized_Metric**: A health metric whose value will not change further (e.g., yesterday's step count, last night's sleep score).
- **Partial_Metric**: A health metric that is still accumulating during the current day (e.g., today's step count at 10am).
- **Recency_Weight**: A multiplier applied to each day's data in the Daily_Digest indicating its relative importance, with yesterday weighted highest and older days progressively lower.
- **Recommendation**: A single actionable coaching item in the briefing output's `recommendations` array.
- **Watchout**: The `caution` field in the briefing output — a single warning about a metric combination that warrants the athlete's attention.
- **Cross_Discipline_Impact**: The effect of training in one discipline on performance or recovery in another (e.g., heavy squats reducing next-day run quality).
- **Coach_Briefing_Card**: The frontend component (`coach-briefing-card.tsx`) that renders the briefing's recommendations, sleep analysis, activity analysis, and watchout sections.

## Requirements

### Requirement 1: Correct Data Timing in the Daily Digest

**User Story:** As a triathlete, I want the AI coach to use finalized data for its analysis, so that recommendations are based on accurate numbers rather than today's partial counts.

#### Acceptance Criteria

1. WHEN the Prompt_Builder constructs the Daily_Digest entry for today's date, THE Briefing_Pipeline SHALL set `steps` to null in today's health object since today's step count is a Partial_Metric still accumulating.
2. WHEN the Prompt_Builder constructs the Daily_Digest entry for today's date, THE Briefing_Pipeline SHALL set `daily_calories` to null in today's health object since today's calorie count is a Partial_Metric still accumulating.
3. WHEN the Prompt_Builder constructs the Daily_Digest entry for today's date, THE Briefing_Pipeline SHALL include finalized overnight recovery metrics (sleep_score, sleep_hours, hrv_ms, resting_hr, readiness, stress, spo2, respiration) in today's health object since these are captured during sleep and do not change throughout the day.
4. WHEN the Prompt_Builder constructs the Daily_Digest entry for any date that is not today, THE Briefing_Pipeline SHALL include all health metrics (steps, daily_calories, sleep_score, sleep_hours, hrv_ms, resting_hr, readiness, stress, spo2, respiration) since past days have Finalized_Metrics.
5. WHEN the Prompt_Builder constructs the Daily_Digest, THE Briefing_Pipeline SHALL continue to include today's completed training sessions (activities) without modification since completed workout sessions are finalized events.

### Requirement 2: Include Today's Planned Workouts in the Prompt

**User Story:** As a triathlete, I want the AI coach to know what workouts I have scheduled today, so that its recommendations align with my training plan.

#### Acceptance Criteria

1. WHEN the Prompt_Builder assembles the AI prompt, THE Briefing_Pipeline SHALL include today's planned workouts (name, discipline, estimated duration, estimated TSS) in the prompt payload alongside the Daily_Digest.
2. WHEN no workouts are scheduled for today, THE Briefing_Pipeline SHALL include an empty planned workouts list in the prompt payload.
3. WHEN the System_Prompt instructs the AI model, THE System_Prompt SHALL direct the model to factor today's planned workouts into its recommendations (e.g., adjusting intensity advice based on what is scheduled).

### Requirement 3: Recency-Weighted Data in the Daily Digest

**User Story:** As a triathlete, I want the AI to weight recent days more heavily than older days, so that recommendations reflect my current state rather than stale data from a week ago.

#### Acceptance Criteria

1. WHEN the Prompt_Builder constructs the Daily_Digest, THE Briefing_Pipeline SHALL include a `recency_weight` field on each day's entry with yesterday assigned the highest weight and each preceding day assigned a progressively lower weight.
2. THE Briefing_Pipeline SHALL assign recency weights that sum to 1.0 across all 7 days, with yesterday receiving at least 0.25 of the total weight.
3. WHEN the System_Prompt instructs the AI model, THE System_Prompt SHALL direct the model to weight its analysis according to each day's `recency_weight` value, treating yesterday as the primary signal and data from 6-7 days ago as background context.

### Requirement 4: Structured Four-Recommendation Output

**User Story:** As a triathlete, I want exactly four focused recommendations with at least one about recovery, one about training, and one watchout, so that the briefing covers all dimensions of my daily plan without contradictions.

#### Acceptance Criteria

1. WHEN the System_Prompt instructs the AI model on output format, THE System_Prompt SHALL require exactly 4 items in the `recommendations` array.
2. WHEN the System_Prompt instructs the AI model on output format, THE System_Prompt SHALL require at least one recommendation to address sleep or recovery.
3. WHEN the System_Prompt instructs the AI model on output format, THE System_Prompt SHALL require at least one recommendation to address activities or training.
4. WHEN the System_Prompt instructs the AI model on output format, THE System_Prompt SHALL require the `caution` field to contain a single watchout sentence identifying a metric combination that warrants attention, rather than allowing null when metrics are soft.
5. WHEN the System_Prompt instructs the AI model, THE System_Prompt SHALL direct the model to ensure all 4 recommendations and the watchout are internally coherent — no recommendation contradicts another or the watchout (e.g., the model does not recommend high-intensity training while the watchout flags poor recovery).
6. WHEN the Briefing_Pipeline parses the AI response, THE Briefing_Pipeline SHALL accept exactly 4 recommendations and truncate or pad to 4 if the model returns a different count.
7. WHEN the Heuristic_Fallback generates a briefing, THE Heuristic_Fallback SHALL produce exactly 4 recommendations following the same category constraints (at least one recovery, one training) and a non-null `caution` field.

### Requirement 5: Insightful, Interpretive AI Content

**User Story:** As a triathlete, I want the AI coach to explain what my numbers mean and how they connect to each other, so that I understand the "why" behind each recommendation rather than just seeing a data dump.

#### Acceptance Criteria

1. WHEN the System_Prompt instructs the AI model on analysis style, THE System_Prompt SHALL direct the model to explain the physiological or performance significance of each cited metric rather than merely listing the number.
2. WHEN the System_Prompt instructs the AI model on analysis style, THE System_Prompt SHALL direct the model to connect related metrics across domains (e.g., linking poor sleep to recommended training intensity reduction, or linking high training load to elevated resting HR).
3. WHEN the System_Prompt instructs the AI model on analysis style, THE System_Prompt SHALL direct the model to state what the athlete should improve and why, grounding each recommendation in a specific data point from the Daily_Digest.
4. WHEN the System_Prompt instructs the AI model on analysis style, THE System_Prompt SHALL prohibit generic wellness filler (e.g., "stay hydrated", "listen to your body", "make sure to stretch") and require every sentence to reference athlete-specific data.

### Requirement 6: Triathlon-Specific Coaching Philosophy

**User Story:** As a triathlete, I want the AI coach to understand multi-sport training dynamics and base its advice on current performance and longevity science, so that the coaching is relevant to my sport and grounded in evidence.

#### Acceptance Criteria

1. WHEN the System_Prompt defines the AI persona, THE System_Prompt SHALL establish the model as a triathlon-focused coach covering swim, bike, run, strength, and mobility disciplines.
2. WHEN the System_Prompt defines the AI persona, THE System_Prompt SHALL direct the model to apply Cross_Discipline_Impact awareness — recognizing that heavy lower-body strength work affects subsequent run and bike sessions, that swim volume affects shoulder recovery for strength work, and that skipped mobility sessions increase injury risk.
3. WHEN the System_Prompt defines the AI persona, THE System_Prompt SHALL direct the model to ground advice in evidence-based performance and longevity science principles (e.g., zone 2 aerobic base building, HRV-guided intensity modulation, sleep architecture optimization, periodization principles).
4. WHEN the System_Prompt defines the AI persona, THE System_Prompt SHALL prohibit the model from producing generic advice that could apply to any fitness level or sport — every recommendation must be specific to the athlete's data and triathlon context.

### Requirement 7: Heuristic Fallback Alignment

**User Story:** As a triathlete without an OpenAI API key configured, I want the rule-based fallback briefing to follow the same structure and quality standards as the AI briefing, so that my experience is consistent regardless of AI availability.

#### Acceptance Criteria

1. WHEN the Heuristic_Fallback generates a briefing, THE Heuristic_Fallback SHALL produce exactly 4 recommendations in the `recommendations` array.
2. WHEN the Heuristic_Fallback generates a briefing, THE Heuristic_Fallback SHALL include at least one recommendation addressing sleep or recovery.
3. WHEN the Heuristic_Fallback generates a briefing, THE Heuristic_Fallback SHALL include at least one recommendation addressing activities or training.
4. WHEN the Heuristic_Fallback generates a briefing, THE Heuristic_Fallback SHALL always populate the `caution` field with a relevant watchout derived from the recovery and activity status, rather than returning null.
5. WHEN the Heuristic_Fallback generates a briefing, THE Heuristic_Fallback SHALL use yesterday's finalized data as the primary input for its recommendations, consistent with the data timing corrections in Requirement 1.

### Requirement 8: Briefing Response Parsing Robustness

**User Story:** As a triathlete, I want the system to handle unexpected AI output gracefully, so that I always see a well-structured briefing even if the model returns malformed data.

#### Acceptance Criteria

1. WHEN the Briefing_Pipeline parses the AI response and the `recommendations` array contains fewer than 4 items, THE Briefing_Pipeline SHALL pad the array with recommendations from the Heuristic_Fallback to reach exactly 4.
2. WHEN the Briefing_Pipeline parses the AI response and the `recommendations` array contains more than 4 items, THE Briefing_Pipeline SHALL truncate the array to the first 4 items.
3. WHEN the Briefing_Pipeline parses the AI response and the `caution` field is null or missing, THE Briefing_Pipeline SHALL substitute the caution value from the Heuristic_Fallback.
4. IF the AI response is not valid JSON, THEN THE Briefing_Pipeline SHALL return the Heuristic_Fallback briefing in its entirety.
