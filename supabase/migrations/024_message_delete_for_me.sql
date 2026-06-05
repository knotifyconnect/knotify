-- Per-user message hiding for "Delete for me".
-- Global soft delete remains messages.deleted_at / deleted_by for "Delete for everyone".

create table if not exists public.message_deletions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_deletions_user_idx
on public.message_deletions(user_id, deleted_at desc);

alter table public.message_deletions enable row level security;

drop policy if exists message_deletions_select_self on public.message_deletions;
create policy message_deletions_select_self on public.message_deletions
for select to authenticated
using (user_id = auth.uid());

drop policy if exists message_deletions_insert_self on public.message_deletions;
create policy message_deletions_insert_self on public.message_deletions
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists message_deletions_delete_self on public.message_deletions;
create policy message_deletions_delete_self on public.message_deletions
for delete to authenticated
using (user_id = auth.uid());
