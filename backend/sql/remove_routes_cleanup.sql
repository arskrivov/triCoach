-- Supabase cleanup for the removed routes feature.
-- Run once in Supabase SQL Editor after deploying the app changes.

begin;

alter table if exists workouts
  drop column if exists route_id;

drop table if exists route_segment_popularity;
drop table if exists cycling_prohibited_areas;
drop table if exists routes;

commit;
