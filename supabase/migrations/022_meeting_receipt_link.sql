-- Link backend-owned coffee receipt messages to meeting rows.
-- This gives Supabase Realtime a deterministic meeting UPDATE after the receipt message exists.

alter table public.meetings
add column if not exists last_receipt_message_id uuid references public.messages(id) on delete set null;

create index if not exists meetings_last_receipt_message_id_idx
on public.meetings(last_receipt_message_id);
