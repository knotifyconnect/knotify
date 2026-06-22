-- Migration 036: photo evidence for quest completions + image on updates

-- Quest completion can carry a photo proof URL.
alter table user_quests add column if not exists photo_url text;
alter table user_quests add column if not exists share_to_feed boolean not null default false;

-- Updates can carry an optional image.
alter table updates add column if not exists image_url text;
