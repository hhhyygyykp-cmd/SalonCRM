-- Public token metadata only (never the access token). Supports the
-- "WhatsApp Embedded Signup Configuration With 60 Expiration Token" template.

alter table public.whatsapp_integrations
  add column if not exists token_expires_at timestamptz,
  add column if not exists token_status text not null default 'unknown'
    check (token_status in ('valid', 'expiring', 'expired', 'unknown')),
  add column if not exists last_token_refresh_at timestamptz;

alter table public.whatsapp_integration_secrets
  add column if not exists last_refreshed_at timestamptz;
