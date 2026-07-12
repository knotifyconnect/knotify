-- Durable admin-managed cafe, restaurant, and bar listings.

alter table public.cafes
  add column if not exists venue_type text not null default 'cafe',
  add column if not exists area text,
  add column if not exists description text,
  add column if not exists is_partnered boolean not null default false,
  add column if not exists deal_title text,
  add column if not exists deal_details text,
  add column if not exists deal_code text,
  add column if not exists deal_code_enabled boolean not null default false,
  add column if not exists featured_priority integer not null default 0,
  add column if not exists archived_at timestamptz;

update public.cafes
set is_partnered = true
where nullif(btrim(perk_text), '') is not null
  and is_partnered = false;

alter table public.cafes
  drop constraint if exists cafes_venue_type_check,
  add constraint cafes_venue_type_check
    check (venue_type in ('cafe', 'restaurant', 'bar')),
  drop constraint if exists cafes_featured_priority_check,
  add constraint cafes_featured_priority_check
    check (featured_priority >= 0),
  drop constraint if exists cafes_deal_code_visibility_check,
  add constraint cafes_deal_code_visibility_check
    check (
      deal_code_enabled = false
      or (is_partnered = true and nullif(btrim(deal_code), '') is not null)
    );

create index if not exists cafes_listing_order_idx
  on public.cafes (is_active, archived_at, is_partnered desc, featured_priority desc, name);

alter table public.cafes enable row level security;
alter table public.cafe_checkins enable row level security;
alter table public.meetings enable row level security;

drop policy if exists cafes_select_visible_or_admin on public.cafes;
create policy cafes_select_visible_or_admin on public.cafes
for select to authenticated
using (
  (is_active = true and archived_at is null)
  or exists (
    select 1 from public.users
    where users.auth_id = auth.uid() and users.is_admin = true
  )
);

drop policy if exists cafes_insert_admin on public.cafes;
create policy cafes_insert_admin on public.cafes
for insert to authenticated
with check (
  exists (
    select 1 from public.users
    where users.auth_id = auth.uid() and users.is_admin = true
  )
);

drop policy if exists cafes_update_admin on public.cafes;
create policy cafes_update_admin on public.cafes
for update to authenticated
using (
  exists (
    select 1 from public.users
    where users.auth_id = auth.uid() and users.is_admin = true
  )
)
with check (
  exists (
    select 1 from public.users
    where users.auth_id = auth.uid() and users.is_admin = true
  )
);

drop policy if exists cafes_delete_admin on public.cafes;
create policy cafes_delete_admin on public.cafes
for delete to authenticated
using (
  exists (
    select 1 from public.users
    where users.auth_id = auth.uid() and users.is_admin = true
  )
);

drop policy if exists cafe_checkins_select_owner on public.cafe_checkins;
create policy cafe_checkins_select_owner on public.cafe_checkins
for select to authenticated
using (
  user_id = (select id from public.users where auth_id = auth.uid())
);

drop policy if exists meetings_select_participant on public.meetings;
create policy meetings_select_participant on public.meetings
for select to authenticated
using (
  initiator_id = (select id from public.users where auth_id = auth.uid())
  or invitee_id = (select id from public.users where auth_id = auth.uid())
);
