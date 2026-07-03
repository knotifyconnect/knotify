-- Migration 047: quest countersignatures.
-- Partner quests can be countersigned by the connection you did them with.
-- A signature is another human vouching in ink: it renders as their
-- handwritten name on the requester's journal card.

create table if not exists quest_signatures (
  id uuid primary key default gen_random_uuid(),
  quest_key text not null,
  requester_id uuid not null references users(id) on delete cascade,
  signer_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'signed', 'declined')),
  created_at timestamptz not null default now(),
  signed_at timestamptz,
  unique (quest_key, requester_id),
  check (requester_id <> signer_id)
);

create index if not exists quest_signatures_signer_idx on quest_signatures(signer_id, status);
create index if not exists quest_signatures_requester_idx on quest_signatures(requester_id);

-- API accesses this through the service role; block direct client access.
alter table quest_signatures enable row level security;
