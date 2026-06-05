-- Per-user chat clearing point.
-- archived_at hides the chat from the list.
-- cleared_at hides old messages before/at the user's delete-chat time.

alter table public.conversation_participants
add column if not exists cleared_at timestamptz;

create index if not exists conversation_participants_user_cleared_idx
on public.conversation_participants(user_id, cleared_at);
