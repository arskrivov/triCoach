# Bugfix Requirements Document

## Introduction

The AI Coach briefing on the Dashboard misattributes today's partial activity data as yesterday's completed data. When `_build_daily_prompt_digest` constructs the 7-day health digest for the AI prompt, it includes today's still-accumulating metrics (steps, daily calories) alongside finalized overnight recovery metrics (sleep score, HRV, resting HR, etc.) without any distinction. The AI model sees today's partial step count (e.g., 961 steps at 10am) and interprets it as a full day's low-activity reading, producing misleading advice like "counteract very low activity yesterday (961 steps)" when those steps are actually from today and still accumulating.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `_format_health_for_prompt` is called for today's date THEN the system includes today's partial `steps` count in the AI prompt digest as if it were a finalized daily total

1.2 WHEN `_format_health_for_prompt` is called for today's date THEN the system includes today's partial `daily_calories` count in the AI prompt digest as if it were a finalized daily total

1.3 WHEN the AI model receives the 7-day digest containing today's partial activity metrics THEN the system produces briefings that misattribute today's incomplete step/calorie data as yesterday's completed data (e.g., "very low activity yesterday (961 steps)" when 961 is today's in-progress count)

### Expected Behavior (Correct)

2.1 WHEN `_format_health_for_prompt` is called for today's date THEN the system SHALL exclude `steps` from today's health entry in the AI prompt digest (set to null) since the value is still accumulating

2.2 WHEN `_format_health_for_prompt` is called for today's date THEN the system SHALL exclude `daily_calories` from today's health entry in the AI prompt digest (set to null) since the value is still accumulating

2.3 WHEN `_format_health_for_prompt` is called for today's date THEN the system SHALL continue to include finalized overnight recovery metrics (sleep_score, sleep_hours, hrv_ms, resting_hr, readiness, stress, spo2, respiration) in today's health entry since these are captured during sleep and do not change throughout the day

2.4 WHEN the AI model receives the 7-day digest THEN the system SHALL produce briefings that correctly distinguish between yesterday's completed activity data and today's recovery-only data, preventing misattribution of partial metrics

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `_format_health_for_prompt` is called for any date that is NOT today THEN the system SHALL CONTINUE TO include all health metrics (steps, daily_calories, sleep_score, sleep_hours, hrv_ms, resting_hr, readiness, stress, spo2, respiration) in that date's health entry since past days have finalized values

3.2 WHEN `_build_daily_prompt_digest` is called THEN the system SHALL CONTINUE TO produce a 7-day digest with one entry per day, each containing `date`, `health`, and `training` keys

3.3 WHEN `_format_health_for_prompt` is called with `None` (no health data for a date) THEN the system SHALL CONTINUE TO return a dict with all health metric keys set to null

3.4 WHEN `_aggregate_training_for_prompt` is called THEN the system SHALL CONTINUE TO include today's training sessions (activities) in the digest without modification, since completed workout sessions are finalized events

3.5 WHEN the heuristic briefing fallback is used (no OpenAI key) THEN the system SHALL CONTINUE TO generate a briefing using `_heuristic_briefing` with the same recovery and activity overview data as before

3.6 WHEN `_today_data_signature` computes the cache signature THEN the system SHALL CONTINUE TO include all health fields (including steps and calories) in the signature so that briefing cache invalidation still works correctly when new data arrives
