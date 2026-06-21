-- Admin-managed honour quests + curated (real Munich) events.

-- Honour-system quests become DB rows so admin can create, schedule and retire them.
-- (Auto-verified quests stay in code because they need verification logic.)
create table if not exists quests (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  title text not null,
  description text,
  points integer not null default 10,
  category text not null default 'social',
  icon text not null default 'sparkles',
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists quests_active_idx on quests(active);

-- Seed the existing real-life quests so nothing is lost and admin can edit them.
insert into quests (key, title, description, points, category, icon) values
  ('coffee_stranger', 'Coffee with a stranger', 'Meet someone new from knotify for a real coffee.', 30, 'social', 'coffee'),
  ('matchmaker',      'Matchmaker',             'Introduce two people in your network to each other.', 25, 'social', 'heart-handshake'),
  ('show_up',         'Show up',                'Go to a meetup or event. Say yes and actually go.', 25, 'social', 'party'),
  ('urban_explorer',  'Urban explorer',         'Explore a Munich neighbourhood you have never been to.', 15, 'explore', 'map'),
  ('sprachpartner',   'Sprachpartner',          'Hold a full conversation in German (or a language you are learning).', 20, 'explore', 'languages'),
  ('cafe_regular',    'Cafe regular',           'Visit one of the knotify partner cafes.', 15, 'explore', 'croissant'),
  ('pay_it_forward',  'Pay it forward',         'Help someone. Review a CV, share a referral, give real advice.', 30, 'give', 'gift')
on conflict (key) do nothing;

-- Curated events: events can be peer-created or admin-curated from Munich sources.
-- source + url + host_label support curated/ingested events without a user host.
alter table events add column if not exists source text not null default 'peer';
alter table events add column if not exists url text;
alter table events add column if not exists host_label text;
alter table events alter column host_id drop not null;
create index if not exists events_source_idx on events(source);
