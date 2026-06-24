-- 044_ask_targeting.sql — targeted, answerable asks.
--
-- An ask can be aimed at:
--   'everyone'  — anyone in the community
--   'interest'  — people who share an interest (audience_value = the interest)
--   'persona'   — people of a persona (audience_value = student|professional|…)
-- audience_value is null for 'everyone'.

alter table user_asks add column if not exists audience_type  text not null default 'everyone';
alter table user_asks add column if not exists audience_value text;

create index if not exists user_asks_open_idx on user_asks (status, created_at desc);

-- Last time the user looked at their "asks for you" feed — drives the unread badge.
alter table users add column if not exists asks_seen_at timestamptz;
