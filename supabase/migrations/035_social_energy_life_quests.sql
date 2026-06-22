-- Migration 035: social_energy on users + additional life/social quests

-- Social energy preference controls how much the OS nudges the user.
alter table users add column if not exists social_energy text default 'selective'
  check (social_energy in ('active', 'selective', 'gentle'));

-- Additional life quests (honour system, admin-managed via DB).
-- These complement the career/network quests with fun, real-life Munich experiences.
insert into quests (key, title, description, points, category, icon) values
  ('welcome_newcomer', 'Welcome wagon',    'Welcome a newcomer to Munich. Show them it is not so cold after all.', 20, 'give',    'hand-heart'),
  ('study_buddy',      'Study buddy',      'Study, work, or co-work with someone from knotify for at least an hour.', 15, 'social', 'book-open'),
  ('campus_guide',     'Campus guide',     'Give someone new a tour of your campus, workplace, or favourite spots.', 20, 'give',    'map-pin'),
  ('hidden_gem',       'Hidden gem',       'Discover a hidden Munich spot through your knot and share it back.', 15, 'explore', 'gem'),
  ('night_out',        'Night out',        'Go out in Munich with someone from knotify. Show up, it counts.', 15, 'social',  'moon'),
  ('professor_hours',  'Office hours',     'Visit a professor or mentor''s office hours and have a real conversation.', 20, 'explore', 'graduation-cap'),
  ('first_referral',   'Pay it forward',   'Give someone a referral or help them land an interview.', 30, 'give',    'briefcase'),
  ('language_swap',    'Language swap',    'Have a real conversation in a language you are learning with someone from your knot.', 15, 'social', 'languages')
on conflict (key) do nothing;
