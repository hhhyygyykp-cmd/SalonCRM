-- Track when a customer submitted the public “update my details” form.
alter table public.customers
  add column if not exists profile_updated_at timestamptz;

create index if not exists customers_profile_updated_at_idx
  on public.customers (profile_updated_at);
