-- In-CRM WhatsApp inbox: conversations + threaded messages (inbound + outbound)
-- Uses the existing Cloud API number. Does not require embedded signup.

create table if not exists public.whatsapp_conversations (
  id text primary key,
  phone text not null,
  phone_key text not null unique,
  customer_id text references public.customers (id) on delete set null,
  contact_name text,
  last_message_at timestamptz not null default now(),
  last_message_preview text not null default '',
  last_direction text not null default 'outbound' check (last_direction in ('inbound', 'outbound')),
  last_inbound_at timestamptz,
  unread_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_chat_messages (
  id text primary key,
  conversation_id text not null references public.whatsapp_conversations (id) on delete cascade,
  customer_id text references public.customers (id) on delete set null,
  staff_id uuid references public.profiles (id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null default 'text',
  body text not null default '',
  status text,
  send_mode text,
  template_id text,
  trigger_type text,
  sent_by text,
  meta_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_chat_messages_meta_id_uidx
  on public.whatsapp_chat_messages (meta_message_id)
  where meta_message_id is not null;

create index if not exists whatsapp_conversations_last_msg_idx
  on public.whatsapp_conversations (last_message_at desc);

create index if not exists whatsapp_conversations_customer_idx
  on public.whatsapp_conversations (customer_id);

create index if not exists whatsapp_chat_messages_conv_idx
  on public.whatsapp_chat_messages (conversation_id, created_at);

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_chat_messages enable row level security;

drop policy if exists whatsapp_conversations_all on public.whatsapp_conversations;
create policy whatsapp_conversations_all on public.whatsapp_conversations
  for all to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

drop policy if exists whatsapp_chat_messages_all on public.whatsapp_chat_messages;
create policy whatsapp_chat_messages_all on public.whatsapp_chat_messages
  for all to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

alter table public.whatsapp_conversations replica identity full;
alter table public.whatsapp_chat_messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.whatsapp_conversations;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.whatsapp_chat_messages;
exception
  when duplicate_object then null;
end $$;

-- Seed threads from existing outbound log so staff see history immediately
insert into public.whatsapp_conversations (
  id, phone, phone_key, customer_id, contact_name,
  last_message_at, last_message_preview, last_direction, unread_count
)
select distinct on (right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 9))
  'wc' || right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 9),
  regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'),
  right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 9),
  m.customer_id,
  c.full_name,
  m.sent_at,
  left(coalesce(m.preview, ''), 280),
  'outbound',
  0
from public.whatsapp_messages m
left join public.customers c on c.id = m.customer_id
where length(right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 9)) >= 8
order by right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 9), m.sent_at desc
on conflict (id) do nothing;

insert into public.whatsapp_chat_messages (
  id, conversation_id, customer_id, staff_id, direction, message_type, body,
  status, send_mode, template_id, trigger_type, sent_by, meta_message_id, error_message, created_at
)
select
  'wmc-' || m.id,
  'wc' || right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 9),
  m.customer_id,
  m.staff_id,
  'outbound',
  case when m.send_mode = 'template' then 'template' else 'text' end,
  coalesce(m.preview, ''),
  m.status,
  m.send_mode,
  m.template_id,
  m.trigger_type,
  m.sent_by,
  m.meta_message_id,
  m.error_message,
  m.sent_at
from public.whatsapp_messages m
where length(right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 9)) >= 8
  and exists (
    select 1 from public.whatsapp_conversations c
    where c.id = 'wc' || right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 9)
  )
on conflict (id) do nothing;
