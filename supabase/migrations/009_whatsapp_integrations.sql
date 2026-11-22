-- WhatsApp Cloud API / Business App Coexistence connections.
-- Metadata is readable by staff. Access tokens stay in a service-role-only table.

create table if not exists public.whatsapp_integrations (
  id uuid primary key default gen_random_uuid(),
  business_id text,
  waba_id text not null,
  phone_number_id text not null unique,
  display_phone_number text,
  display_name text,
  connection_type text not null default 'cloud_api'
    check (connection_type in ('coexistence', 'cloud_api')),
  coexistence_enabled boolean not null default false,
  status text not null default 'connected'
    check (status in ('connected', 'pending', 'error', 'disconnected')),
  is_active boolean not null default false,
  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  meta_event text,
  notes text
);

create unique index if not exists whatsapp_integrations_one_active
  on public.whatsapp_integrations (is_active)
  where is_active = true;

create table if not exists public.whatsapp_integration_secrets (
  integration_id uuid primary key references public.whatsapp_integrations (id) on delete cascade,
  access_token text not null,
  token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_integrations enable row level security;
alter table public.whatsapp_integration_secrets enable row level security;

drop policy if exists whatsapp_integrations_select on public.whatsapp_integrations;
create policy whatsapp_integrations_select on public.whatsapp_integrations
  for select to authenticated
  using (public.is_staff_user());

-- No client policies on secrets — service role only (edge functions).

-- Snapshot the current Cloud API number as an inactive row so connecting
-- Coexistence never deletes it. Token remains in WHATSAPP_TOKEN secret.
insert into public.whatsapp_integrations (
  business_id,
  waba_id,
  phone_number_id,
  display_phone_number,
  display_name,
  connection_type,
  coexistence_enabled,
  status,
  is_active,
  notes
)
select
  null,
  s.whatsapp_business_account_id,
  s.whatsapp_phone_number_id,
  s.whatsapp,
  s.salon_name,
  'cloud_api',
  false,
  'connected',
  false,
  'Existing Cloud API number snapshotted before Coexistence onboarding. Not deregistered.'
from public.salon_settings s
where s.id = 1
  and coalesce(s.whatsapp_phone_number_id, '') <> ''
  and coalesce(s.whatsapp_business_account_id, '') <> ''
on conflict (phone_number_id) do nothing;
