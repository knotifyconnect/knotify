-- Durable, privacy-minimal hourly product-activity rollups.
-- Rows contain route names and aggregate counters only; no message content,
-- form values, query strings, or free-form browser data are recorded.

create table if not exists public.user_activity_hourly (
  bucket_start timestamptz not null,
  user_id uuid not null references public.users(id) on delete cascade,
  session_key uuid not null,
  active_seconds integer not null default 0 check (active_seconds >= 0),
  page_views integer not null default 0 check (page_views >= 0),
  heartbeats integer not null default 0 check (heartbeats >= 0),
  exits integer not null default 0 check (exits >= 0),
  last_path text not null default '/' check (char_length(last_path) <= 160),
  device_type text not null default 'desktop' check (device_type in ('desktop', 'mobile', 'tablet')),
  is_backfill boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bucket_start, user_id, session_key),
  check (bucket_start = date_trunc('hour', bucket_start))
);

create index if not exists user_activity_hourly_recent_idx
  on public.user_activity_hourly (bucket_start desc);
create index if not exists user_activity_hourly_user_recent_idx
  on public.user_activity_hourly (user_id, bucket_start desc);

alter table public.user_activity_hourly enable row level security;

-- Only the service-role API writes or reads the operator rollup. Product users
-- never receive access to another member's activity rows through PostgREST.
revoke all on public.user_activity_hourly from anon, authenticated;

create or replace function public.record_user_activity_hourly(
  p_user_id uuid,
  p_session_key uuid,
  p_observed_at timestamptz,
  p_active_seconds integer,
  p_page_views integer,
  p_active boolean,
  p_last_path text,
  p_device_type text
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.user_activity_hourly (
    bucket_start, user_id, session_key, active_seconds, page_views,
    heartbeats, exits, last_path, device_type, is_backfill, last_seen_at, updated_at
  ) values (
    date_trunc('hour', p_observed_at), p_user_id, p_session_key,
    greatest(coalesce(p_active_seconds, 0), 0),
    greatest(coalesce(p_page_views, 0), 0),
    case when p_active then 1 else 0 end,
    case when p_active then 0 else 1 end,
    left(coalesce(nullif(p_last_path, ''), '/'), 160),
    case when p_device_type in ('desktop', 'mobile', 'tablet') then p_device_type else 'desktop' end,
    false,
    p_observed_at,
    p_observed_at
  )
  on conflict (bucket_start, user_id, session_key) do update set
    active_seconds = public.user_activity_hourly.active_seconds + excluded.active_seconds,
    page_views = public.user_activity_hourly.page_views + excluded.page_views,
    heartbeats = public.user_activity_hourly.heartbeats + excluded.heartbeats,
    exits = public.user_activity_hourly.exits + excluded.exits,
    last_path = excluded.last_path,
    device_type = excluded.device_type,
    last_seen_at = greatest(public.user_activity_hourly.last_seen_at, excluded.last_seen_at),
    updated_at = excluded.updated_at;
$$;

revoke all on function public.record_user_activity_hourly(uuid, uuid, timestamptz, integer, integer, boolean, text, text) from public;
grant execute on function public.record_user_activity_hourly(uuid, uuid, timestamptz, integer, integer, boolean, text, text) to service_role;

-- Preserve the useful historical signal that already exists. Legacy session
-- rows do not contain per-heartbeat timestamps, so they are placed in their
-- opening hour and explicitly marked as estimates for the admin UI.
insert into public.user_activity_hourly (
  bucket_start, user_id, session_key, active_seconds, page_views, heartbeats,
  exits, last_path, device_type, is_backfill, last_seen_at, created_at, updated_at
)
select
  date_trunc('hour', started_at), user_id, session_key, active_seconds,
  page_views, 0, case when is_active then 0 else 1 end, last_path,
  device_type, true, last_seen_at, created_at, updated_at
from public.user_activity_sessions
on conflict (bucket_start, user_id, session_key) do nothing;

-- Aggregate inside PostgreSQL so a year view returns a few dozen compact
-- buckets instead of transferring every user-hour row through the API.
drop function if exists public.get_admin_activity_analytics(timestamptz, timestamptz, timestamptz, text, text);

create or replace function public.get_admin_activity_analytics(
  p_previous_start timestamptz,
  p_previous_end timestamptz,
  p_current_start timestamptz,
  p_end timestamptz,
  p_resolution text,
  p_timezone text default 'Europe/Berlin'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_resolution not in ('hour', 'day', 'month') then
    raise exception 'Unsupported activity resolution';
  end if;

  with scoped as (
    select *, bucket_start at time zone p_timezone as local_bucket
    from public.user_activity_hourly
    where bucket_start >= p_previous_start and bucket_start <= p_end
  ), current_rows as (
    select * from scoped where bucket_start >= p_current_start
  ), previous_rows as (
    select * from scoped where bucket_start < p_previous_end
  ), point_rows as (
    select
      case p_resolution
        when 'hour' then to_char(date_trunc('hour', local_bucket), 'YYYY-MM-DD"T"HH24')
        when 'month' then to_char(date_trunc('month', local_bucket), 'YYYY-MM')
        else to_char(date_trunc('day', local_bucket), 'YYYY-MM-DD')
      end as key,
      count(distinct user_id)::integer as active_users,
      count(distinct user_id::text || ':' || session_key::text)::integer as sessions,
      round(coalesce(sum(active_seconds), 0)::numeric / 60)::integer as active_minutes,
      coalesce(sum(page_views), 0)::integer as page_views,
      coalesce(sum(heartbeats), 0)::integer as heartbeats,
      coalesce(sum(exits), 0)::integer as exits
    from current_rows group by 1
  ), time_rows as (
    select
      extract(hour from local_bucket)::integer as hour,
      count(distinct user_id)::integer as active_users,
      count(distinct user_id::text || ':' || session_key::text)::integer as sessions,
      round(coalesce(sum(active_seconds), 0)::numeric / 60)::integer as active_minutes,
      coalesce(sum(page_views), 0)::integer as page_views,
      coalesce(sum(heartbeats), 0)::integer as heartbeats,
      coalesce(sum(exits), 0)::integer as exits
    from current_rows group by 1
  ), weekday_rows as (
    select
      extract(dow from local_bucket)::integer as day,
      count(distinct user_id)::integer as active_users,
      count(distinct user_id::text || ':' || session_key::text)::integer as sessions,
      round(coalesce(sum(active_seconds), 0)::numeric / 60)::integer as active_minutes,
      coalesce(sum(page_views), 0)::integer as page_views,
      coalesce(sum(heartbeats), 0)::integer as heartbeats,
      coalesce(sum(exits), 0)::integer as exits
    from current_rows group by 1
  ), device_rows as (
    select device_type as label, count(distinct user_id::text || ':' || session_key::text)::integer as count
    from current_rows group by device_type order by count desc
  ), section_rows as (
    select section as label, count(distinct user_id::text || ':' || session_key::text)::integer as count
    from (
      select user_id, session_key,
        case
          when last_path in ('/', '/home') then 'Home'
          when last_path = '/map' then 'Your Knot'
          when last_path = '/discover' then 'Discover'
          when last_path in ('/jobs', '/gigs') then 'Jobs & Gigs'
          when last_path = '/cafes' or last_path like '/cafes/%' then 'Cafés'
          when last_path = '/messages' then 'Messages'
          when last_path = '/events' then 'Events'
          when last_path = '/quests' then 'Quests'
          when last_path = '/settings' then 'Settings'
          when last_path = '/asks' then 'Asks'
          when last_path = '/profile' or last_path like '/profile/%' then 'Profile'
          else 'Knotify'
        end as section
      from current_rows
    ) sections
    group by section order by count desc limit 8
  )
  select jsonb_build_object(
    'source', case when coalesce((select bool_or(is_backfill) from scoped), false) then 'mixed' else 'hourly' end,
    'current', (select jsonb_build_object(
      'activeUsers', count(distinct user_id),
      'sessions', count(distinct user_id::text || ':' || session_key::text),
      'activeMinutes', round(coalesce(sum(active_seconds), 0)::numeric / 60),
      'pageViews', coalesce(sum(page_views), 0),
      'heartbeats', coalesce(sum(heartbeats), 0),
      'exits', coalesce(sum(exits), 0)
    ) from current_rows),
    'previous', (select jsonb_build_object(
      'activeUsers', count(distinct user_id),
      'sessions', count(distinct user_id::text || ':' || session_key::text),
      'activeMinutes', round(coalesce(sum(active_seconds), 0)::numeric / 60),
      'pageViews', coalesce(sum(page_views), 0),
      'heartbeats', coalesce(sum(heartbeats), 0),
      'exits', coalesce(sum(exits), 0)
    ) from previous_rows),
    'points', coalesce((select jsonb_agg(to_jsonb(point_rows) order by key) from point_rows), '[]'::jsonb),
    'timeOfDay', coalesce((select jsonb_agg(to_jsonb(time_rows) order by hour) from time_rows), '[]'::jsonb),
    'weekdays', coalesce((select jsonb_agg(to_jsonb(weekday_rows) order by day) from weekday_rows), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(to_jsonb(device_rows)) from device_rows), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(section_rows)) from section_rows), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_activity_analytics(timestamptz, timestamptz, timestamptz, timestamptz, text, text) from public;
grant execute on function public.get_admin_activity_analytics(timestamptz, timestamptz, timestamptz, timestamptz, text, text) to service_role;
