-- Message soft delete + per-user conversation archive.
-- Do not hard-delete message history or whole conversations.

alter table public.messages
add column if not exists deleted_at timestamptz,
add column if not exists deleted_by uuid references public.users(id) on delete set null;

create index if not exists messages_deleted_at_idx
on public.messages(deleted_at);

alter table public.conversation_participants
add column if not exists archived_at timestamptz;

create index if not exists conversation_participants_user_archived_idx
on public.conversation_participants(user_id, archived_at);
