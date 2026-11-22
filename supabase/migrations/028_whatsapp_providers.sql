-- Additive only: support Meta + future 360dialog side-by-side.
-- Does not change is_active, tokens, WABA IDs, phone number IDs, or coexistence flags.

alter table public.whatsapp_integrations
  add column if not exists provider text not null default 'meta';

alter table public.whatsapp_integrations
  drop constraint if exists whatsapp_integrations_provider_check;

alter table public.whatsapp_integrations
  add constraint whatsapp_integrations_provider_check
  check (provider in ('meta', '360dialog'));

alter table public.whatsapp_integrations
  add column if not exists provider_account_id text;

-- Existing rows keep provider = meta (column default). Do not touch is_active.

comment on column public.whatsapp_integrations.provider is
  'API provider for this connection: meta (Cloud API) or 360dialog. Resolved per integration, not globally.';

comment on column public.whatsapp_integrations.provider_account_id is
  'Optional partner/account id (e.g. 360dialog client id). Not an API key.';

-- Optional origin for inbox messages. Existing rows stay NULL (no backfill).
alter table public.whatsapp_chat_messages
  add column if not exists origin text;

alter table public.whatsapp_chat_messages
  drop constraint if exists whatsapp_chat_messages_origin_check;

alter table public.whatsapp_chat_messages
  add constraint whatsapp_chat_messages_origin_check
  check (origin is null or origin in ('customer', 'crm', 'business_app', 'automation'));

comment on column public.whatsapp_chat_messages.origin is
  'Who produced the message: customer, crm (staff in Belle CRM), business_app (WhatsApp Business App echo), automation. NULL = unknown/legacy.';
