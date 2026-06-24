-- 040_app_settings.sql — global key/value settings for runtime config.
-- beta_open: when false, only admin users and approved beta_signups can access the API.

create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Default: beta is open (all confirmed email users can access the app).
insert into app_settings (key, value) values ('beta_open', 'true') on conflict do nothing;
