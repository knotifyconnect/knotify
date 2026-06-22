-- Home Hub enrichment:
--   1. events get an optional cover image (host upload or curated URL)
--   2. seed curated Munich events (real images, rolling future dates) so the
--      hub is never empty for new users
--   3. a richer curated side-quest set
-- Idempotent: safe to run multiple times.

-- 1. Event cover image -------------------------------------------------------
alter table events add column if not exists image_url text;

-- 2. Curated Munich events ---------------------------------------------------
-- source='curated' rows have no host_id; host_label + url + image_url drive the card.
-- Dates are rolling (now() + interval) so they are upcoming whenever this is applied.
-- We key off title+source to stay idempotent without a dedicated unique constraint.
insert into events (title, description, location, starts_at, interests, source, url, host_label, image_url)
select v.title, v.description, v.location, v.starts_at, v.interests, 'curated', v.url, v.host_label, v.image_url
from (values
  (
    'TUM x Industry Night',
    'Meet 9 Munich companies hiring students and new grads. Short talks, then open networking.',
    'Garching · TUM',
    now() + interval '4 days' + interval '18 hours',
    array['startups','ai','careers'],
    'https://www.tum.de/',
    'TUM',
    'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=900&q=70&auto=format&fit=crop'
  ),
  (
    'Cars & Coffee',
    'Sunday morning meet for car people. Bring your ride or just come for the coffee.',
    'Englischer Garten',
    now() + interval '6 days' + interval '9 hours',
    array['cars','coffee'],
    null,
    'Munich Car Club',
    'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=900&q=70&auto=format&fit=crop'
  ),
  (
    'Portfolio Night',
    'Designers share work in progress and get live feedback. Bring 3 pieces.',
    'Werk1 · Ostbahnhof',
    now() + interval '3 days' + interval '19 hours',
    array['design','startups'],
    null,
    'Munich Design',
    'https://images.unsplash.com/photo-1558403194-611308249627?w=900&q=70&auto=format&fit=crop'
  ),
  (
    'Boulder & Brunch',
    'Beginner-friendly climbing session followed by brunch nearby.',
    'Boulderwelt München Ost',
    now() + interval '5 days' + interval '10 hours',
    array['climbing','sports'],
    null,
    'Climbing MUC',
    'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=900&q=70&auto=format&fit=crop'
  ),
  (
    'Open Decks',
    'Electronic music night with an open booth. Sign up to play a set.',
    'Blitz Club',
    now() + interval '8 days' + interval '22 hours',
    array['music','electronic music'],
    null,
    'Blitz',
    'https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=900&q=70&auto=format&fit=crop'
  ),
  (
    'International Mixer',
    'For newcomers to Munich. Meet other internationals, swap tips, make friends.',
    'Garching',
    now() + interval '2 days' + interval '18 hours' + interval '30 minutes',
    array['internationals','social'],
    null,
    'knotify',
    'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=900&q=70&auto=format&fit=crop'
  )
) as v(title, description, location, starts_at, interests, url, host_label, image_url)
where not exists (
  select 1 from events e where e.title = v.title and e.source = 'curated'
);

-- 3. Richer curated honour quests -------------------------------------------
insert into quests (key, title, description, points, category, icon) values
  ('intro_two',        'Make an introduction',   'Introduce two people in your knot who should know each other.', 25, 'give',    'heart-handshake'),
  ('host_study',       'Host a study spot',      'Host a study session at a partner cafe and invite your knot.',  20, 'social',  'coffee'),
  ('verify_skill',     'Vouch for someone',      'Verify a peer''s skill so their profile carries real weight.',  15, 'give',    'badge-check'),
  ('attend_event',     'Show up IRL',            'RSVP and actually attend a knotify event this month.',          20, 'social',  'party'),
  ('welcome_newcomer', 'Welcome a newcomer',     'Help a new international with one concrete thing this week.',    20, 'give',    'hand-heart'),
  ('reconnect',        'Rekindle a tie',         'Reach out to someone you have not spoken to in over a month.',   15, 'network', 'flame')
on conflict (key) do nothing;
