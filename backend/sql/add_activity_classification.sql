alter table activities
  add column if not exists garmin_type_key text,
  add column if not exists garmin_event_type text;
