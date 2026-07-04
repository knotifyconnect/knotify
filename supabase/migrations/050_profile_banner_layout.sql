-- Profile personalization: banner image + customizable widget layout.
-- banner_url mirrors avatar_url (a URL or a data: URL string).
-- profile_layout is an ordered list of { id, visible } widget configs.
alter table users add column if not exists banner_url text;
alter table users add column if not exists profile_layout jsonb;
