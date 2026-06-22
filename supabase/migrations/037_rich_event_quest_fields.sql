-- Migration 037: rich detail fields for events and quests

-- ── Events ────────────────────────────────────────────────────────────────────
alter table events add column if not exists ends_at       timestamptz;
alter table events add column if not exists capacity      integer;
alter table events add column if not exists price_eur     integer;   -- 0 = free, null = not specified
alter table events add column if not exists event_type    text;      -- networking/social/sports/music/career/workshop/outdoor/party

-- Backfill event_type + price for seeded curated events
update events set event_type = 'career',     price_eur = 0,  ends_at = starts_at + interval '3 hours' where title = 'TUM x Industry Night'    and source = 'curated';
update events set event_type = 'social',     price_eur = 0,  ends_at = starts_at + interval '2 hours' where title = 'Cars & Coffee'            and source = 'curated';
update events set event_type = 'workshop',   price_eur = 0,  ends_at = starts_at + interval '3 hours' where title = 'Portfolio Night'           and source = 'curated';
update events set event_type = 'sports',     price_eur = 12, ends_at = starts_at + interval '3 hours' where title = 'Boulder & Brunch'          and source = 'curated';
update events set event_type = 'music',      price_eur = 8,  ends_at = starts_at + interval '6 hours' where title = 'Open Decks'               and source = 'curated';
update events set event_type = 'networking', price_eur = 0,  ends_at = starts_at + interval '3 hours' where title = 'International Mixer'       and source = 'curated';

-- ── Quests ────────────────────────────────────────────────────────────────────
alter table quests add column if not exists how_to           text;
alter table quests add column if not exists where_to_go      text;
alter table quests add column if not exists estimated_minutes integer;
alter table quests add column if not exists difficulty        text check (difficulty in ('easy','medium','hard'));
alter table quests add column if not exists partner_required  boolean not null default false;

-- Backfill all seeded quests with rich content
update quests set
  how_to           = 'Find someone on knotify you have never met in person. Send a short message — say who you are and suggest a 30-minute coffee. Keep it simple. Show up.',
  where_to_go      = 'Any knotify partner cafe works. Try Cafe Kowalski (Schwabing), Vits (Neuhausen), or Kaffeerösterei am Viktualienmarkt. Or pick your own spot.',
  estimated_minutes = 60,
  difficulty        = 'medium',
  partner_required  = true
where key = 'coffee_stranger';

update quests set
  how_to           = 'Think of two people in your knot who do not know each other but genuinely should. Write a short intro message — one or two lines explaining why. Send it to both at the same time.',
  where_to_go      = 'Do this on knotify or in a group message. No physical location needed.',
  estimated_minutes = 10,
  difficulty        = 'easy',
  partner_required  = false
where key = 'matchmaker';

update quests set
  how_to           = 'RSVP to any event listed on knotify this month. Go. Say hi to at least one person you did not already know.',
  where_to_go      = 'Check the Events section for upcoming meetups, workshops, and socials in Munich.',
  estimated_minutes = 120,
  difficulty        = 'easy',
  partner_required  = false
where key = 'show_up';

update quests set
  how_to           = 'Pick a Munich neighbourhood you have never properly explored. Walk for at least 30 minutes with no plan. Find something worth sharing — a cafe, a street, a building, anything.',
  where_to_go      = 'Good options: Haidhausen, Au, Neuhausen, Giesing, Maxvorstadt, Schwabing, Glockenbachviertel.',
  estimated_minutes = 90,
  difficulty        = 'easy',
  partner_required  = false
where key = 'urban_explorer';

update quests set
  how_to           = 'Find someone in your knot who speaks a language you are learning (or wants to practice yours). Agree to a 15-minute conversation — half in each language. Awkward is normal. Keep going.',
  where_to_go      = 'Can be in person at a cafe, in a library, or on a call. The language matters, the place does not.',
  estimated_minutes = 30,
  difficulty        = 'medium',
  partner_required  = true
where key = 'sprachpartner';

update quests set
  how_to           = 'Visit any knotify partner cafe. Order something. Mention knotify at the counter if it comes up naturally.',
  where_to_go      = 'Check the Cafes section for the current partner list with addresses and hours.',
  estimated_minutes = 30,
  difficulty        = 'easy',
  partner_required  = false
where key = 'cafe_regular';

update quests set
  how_to           = 'Find someone in your network who needs help. Review their CV properly (written feedback, not just a skim), share their profile with a real referral, or sit down and give them solid advice on something you actually know.',
  where_to_go      = 'Can be done remotely or over a coffee. The help has to be concrete — a quick reply does not count.',
  estimated_minutes = 45,
  difficulty        = 'medium',
  partner_required  = true
where key = 'pay_it_forward';

update quests set
  how_to           = 'Introduce two people in your knot who have never met. Write a proper intro — one sentence about each person and a specific reason they should connect. Send it to both.',
  where_to_go      = 'Done via knotify or a shared message. No location needed.',
  estimated_minutes = 10,
  difficulty        = 'easy',
  partner_required  = false
where key = 'intro_two';

update quests set
  how_to           = 'Organise a study or co-work session at a partner cafe. Post it on knotify and invite at least two people from your knot. Show up and actually study.',
  where_to_go      = 'Book a table at a knotify partner cafe — they know us and will hold a corner for the group.',
  estimated_minutes = 120,
  difficulty        = 'medium',
  partner_required  = true
where key = 'host_study';

update quests set
  how_to           = 'Go to a connection''s profile. Find a skill you have actually seen them use or demonstrate. Click Verify. Only vouch for things you have witnessed yourself.',
  where_to_go      = 'Done entirely on knotify. Takes about two minutes.',
  estimated_minutes = 5,
  difficulty        = 'easy',
  partner_required  = false
where key = 'verify_skill';

update quests set
  how_to           = 'RSVP to a knotify event this month. Go. Photo at the venue counts as evidence.',
  where_to_go      = 'Check the Events section for upcoming events in Munich.',
  estimated_minutes = 120,
  difficulty        = 'easy',
  partner_required  = false
where key = 'attend_event';

update quests set
  how_to           = 'Find someone on knotify who just arrived in Munich. Message them with something concretely useful — a neighbourhood recommendation, an explanation of how something works, an offer to show them around for 30 minutes.',
  where_to_go      = 'The welcome can happen anywhere — in person or online. Real help matters more than the location.',
  estimated_minutes = 60,
  difficulty        = 'easy',
  partner_required  = true
where key = 'welcome_newcomer';

update quests set
  how_to           = 'Find someone in your knot you have not spoken to in over a month. Send them a real message — not a one-liner. Reference something specific you remember from your last conversation.',
  where_to_go      = 'Entirely on knotify or wherever you normally talk.',
  estimated_minutes = 10,
  difficulty        = 'easy',
  partner_required  = false
where key = 'reconnect';

-- New quests from migration 035 (life quests)
update quests set
  how_to           = 'Find a newcomer on knotify — someone in their first month in Munich. Reach out and help them with one concrete thing this week.',
  where_to_go      = 'Help can be IRL (showing around, grabbing a coffee) or online (answering questions).',
  estimated_minutes = 60,
  difficulty        = 'easy',
  partner_required  = true
where key = 'welcome_newcomer';

update quests set
  how_to           = 'Find someone from your knot to study or co-work with. Agree on a time and place. Actually go and work, not just chat.',
  where_to_go      = 'University library, a partner cafe, or any quiet spot you both like.',
  estimated_minutes = 120,
  difficulty        = 'easy',
  partner_required  = true
where key = 'study_buddy';

update quests set
  how_to           = 'Show someone new around your campus, your workplace, or your favourite spots in the city. Even 20 minutes of a real local perspective counts.',
  where_to_go      = 'Anywhere in Munich. The best guides share what is not on any map.',
  estimated_minutes = 60,
  difficulty        = 'easy',
  partner_required  = true
where key = 'campus_guide';

update quests set
  how_to           = 'Discover a Munich spot someone in your knot recommended. Go there. Take a photo. Share it back.',
  where_to_go      = 'Ask your connections for a hidden gem recommendation first — that is part of the quest.',
  estimated_minutes = 60,
  difficulty        = 'easy',
  partner_required  = false
where key = 'hidden_gem';

update quests set
  how_to           = 'Go out in Munich with at least one person from knotify. A bar, club, concert, dinner — anything social, in the evening.',
  where_to_go      = 'Anywhere in Munich. Coordinate via knotify first so it counts as a shared experience.',
  estimated_minutes = 180,
  difficulty        = 'medium',
  partner_required  = true
where key = 'night_out';

update quests set
  how_to           = 'Go to a professor or mentor office hours and have a genuine conversation — not just a quick admin question. Come prepared with something real to discuss.',
  where_to_go      = 'Your university department or a professional mentor from your knot.',
  estimated_minutes = 45,
  difficulty        = 'medium',
  partner_required  = false
where key = 'professor_hours';

update quests set
  how_to           = 'Give someone a real referral — actively introduce them to a hiring manager or company you have a connection with. Put your name on it.',
  where_to_go      = 'Entirely via message or email. Only refer people you would genuinely vouch for.',
  estimated_minutes = 20,
  difficulty        = 'hard',
  partner_required  = true
where key = 'first_referral';

update quests set
  how_to           = 'Have a back-and-forth conversation in a language you are learning with someone from your knot. At least 15 minutes, mixing languages is fine.',
  where_to_go      = 'In person at a cafe or library, or on a call. The conversation matters, not the location.',
  estimated_minutes = 30,
  difficulty        = 'medium',
  partner_required  = true
where key = 'language_swap';
