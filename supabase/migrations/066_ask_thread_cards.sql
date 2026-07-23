-- Let an explicitly targeted Ask appear as a durable card in each recipient's
-- direct message thread. The message row keeps existing unread/realtime
-- semantics while the typed fields let clients render a safe, clickable card.

begin;

alter table public.messages
  add column if not exists message_kind text not null default 'text',
  add column if not exists ask_id uuid references public.user_asks(id) on delete set null;

alter table public.messages
  drop constraint if exists messages_message_kind_check;

alter table public.messages
  add constraint messages_message_kind_check
  check (message_kind in ('text', 'ask'));

create unique index if not exists messages_ask_thread_unique
  on public.messages (conversation_id, ask_id)
  where message_kind = 'ask' and ask_id is not null;

create index if not exists messages_ask_id_idx
  on public.messages (ask_id)
  where ask_id is not null;

commit;
