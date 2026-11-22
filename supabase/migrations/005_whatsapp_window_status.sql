-- WhatsApp 24h window tracking + delivery status fields

alter table public.customers
  add column if not exists last_whatsapp_inbound_at timestamptz;

alter table public.whatsapp_messages
  add column if not exists read_at timestamptz,
  add column if not exists send_mode text,
  add column if not exists meta_error_code int,
  add column if not exists meta_error_subcode int,
  add column if not exists meta_error_type text;

create index if not exists messages_meta_id_idx
  on public.whatsapp_messages (meta_message_id)
  where meta_message_id is not null;

create index if not exists customers_whatsapp_phone_idx
  on public.customers (whatsapp_phone);
