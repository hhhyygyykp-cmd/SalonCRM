-- Belle Beauty Lounge CRM — initial schema
-- Apply in Supabase SQL editor or via supabase db push

create extension if not exists "pgcrypto";

-- Profiles first (helpers below reference this table)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('owner', 'staff')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  phone text,
  job_title text,
  nationality text,
  join_date date,
  salary numeric(12,2),
  last_salary_paid_at timestamptz,
  notes text,
  passport jsonb default '{}'::jsonb,
  visa jsonb default '{}'::jsonb,
  emirates_id jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helpers (must come after profiles exists)
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'owner' and p.status = 'active'
  );
$$;

create or replace function public.is_staff_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  );
$$;

-- Salon settings (single row)
create table if not exists public.salon_settings (
  id int primary key default 1 check (id = 1),
  salon_name text not null,
  phone text not null,
  whatsapp text not null,
  address text not null,
  currency text not null default 'AED',
  timezone text not null default 'Asia/Dubai',
  reminder_days int[] not null default '{30,60,90}',
  automation_enabled boolean not null default true,
  owner_name text not null default 'Owner',
  owner_whatsapp text not null,
  staff_document_reminder_days int not null default 30,
  whatsapp_phone_number_id text,
  whatsapp_business_account_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id text primary key,
  full_name text not null,
  phone text not null unique,
  whatsapp_phone text not null,
  email text,
  birthday date,
  notes text,
  location text,
  preferred_staff_id uuid references public.profiles (id),
  loyalty_tier text not null default 'Regular' check (loyalty_tier in ('Regular', 'Gold', 'Premium')),
  lifetime_spend numeric(12,2) not null default 0,
  total_visits int not null default 0,
  last_visit_at timestamptz,
  last_services text[] not null default '{}',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id text primary key,
  name text not null,
  category text not null,
  default_price numeric(12,2) not null,
  description text,
  active boolean not null default true
);

create table if not exists public.vouchers (
  id text primary key,
  code text not null unique,
  name text not null,
  type text not null check (type in ('fixed', 'percent')),
  value numeric(12,2) not null,
  min_spend numeric(12,2),
  max_uses int,
  used_count int not null default 0,
  expires_at date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.visits (
  id text primary key,
  customer_id text not null references public.customers (id) on delete cascade,
  staff_id uuid not null references public.profiles (id),
  visit_date timestamptz not null,
  services jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null,
  discount numeric(12,2) not null default 0,
  voucher_id text references public.vouchers (id),
  voucher_code text,
  voucher_discount numeric(12,2),
  delivery_fee numeric(12,2) not null default 0,
  customer_location text,
  final_total numeric(12,2) not null,
  payment_method text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id text primary key,
  title text not null,
  category text not null,
  amount numeric(12,2) not null,
  expense_date date not null,
  payment_method text,
  vendor text,
  notes text,
  staff_id uuid references public.profiles (id),
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_templates (
  id text primary key,
  name text not null,
  whatsapp_template_name text not null,
  language text not null default 'en',
  category text not null,
  trigger_days int,
  description text not null default '',
  body text not null,
  active boolean not null default true
);

create table if not exists public.whatsapp_messages (
  id text primary key,
  customer_id text references public.customers (id) on delete set null,
  staff_id uuid references public.profiles (id),
  template_id text,
  phone text not null,
  trigger_type text not null,
  status text not null,
  sent_by text,
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  error_message text,
  preview text,
  meta_message_id text
);

create index customers_phone_idx on public.customers (phone);
create index visits_customer_idx on public.visits (customer_id);
create index visits_date_idx on public.visits (visit_date desc);
create index messages_sent_idx on public.whatsapp_messages (sent_at desc);

-- Auto profile stub (role must be lowercase owner|staff)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_role text := lower(coalesce(new.raw_user_meta_data->>'role', 'staff'));
begin
  if meta_role not in ('owner', 'staff') then
    meta_role := 'staff';
  end if;

  insert into public.profiles (id, name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    meta_role,
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.salon_settings enable row level security;
alter table public.customers enable row level security;
alter table public.services enable row level security;
alter table public.vouchers enable row level security;
alter table public.visits enable row level security;
alter table public.expenses enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_messages enable row level security;

-- Profiles
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_staff_user());
create policy profiles_update_owner on public.profiles for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

-- Settings: all staff read; owner write
create policy settings_select on public.salon_settings for select to authenticated
  using (public.is_staff_user());
create policy settings_update on public.salon_settings for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Customers / services / visits / messages / templates: staff R/W
create policy customers_all on public.customers for all to authenticated
  using (public.is_staff_user()) with check (public.is_staff_user());
create policy services_all on public.services for all to authenticated
  using (public.is_staff_user()) with check (public.is_staff_user());
create policy visits_all on public.visits for all to authenticated
  using (public.is_staff_user()) with check (public.is_staff_user());
create policy templates_all on public.whatsapp_templates for all to authenticated
  using (public.is_staff_user()) with check (public.is_staff_user());
create policy messages_all on public.whatsapp_messages for all to authenticated
  using (public.is_staff_user()) with check (public.is_staff_user());

-- Vouchers: staff can read/apply (update used_count); owner create/disable
create policy vouchers_select on public.vouchers for select to authenticated
  using (public.is_staff_user());
create policy vouchers_insert on public.vouchers for insert to authenticated
  with check (public.is_owner());
create policy vouchers_update on public.vouchers for update to authenticated
  using (public.is_staff_user()) with check (public.is_staff_user());

-- Expenses: owner only
create policy expenses_owner on public.expenses for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Seed settings row
insert into public.salon_settings (
  id, salon_name, phone, whatsapp, address, currency, timezone,
  reminder_days, automation_enabled, owner_name, owner_whatsapp, staff_document_reminder_days
) values (
  1,
  'Belle Beauty Lounge',
  '+971 50 200 8228',
  '+971 50 200 8228',
  'Al Ain, United Arab Emirates',
  'AED',
  'Asia/Dubai',
  '{30,60,90}',
  true,
  'Owner',
  '+971502008228',
  30
) on conflict (id) do nothing;

-- Default WhatsApp templates
insert into public.whatsapp_templates (id, name, whatsapp_template_name, language, category, trigger_days, description, body, active) values
('wt1', '30-Day Reminder', 'reminder_30_day', 'en', 'MARKETING', 30, 'Win-back message after 30 days inactive',
 'Hi {{customer_name}}, we miss you at {{salon_name}}
It has been a while since your last visit.
We would love to welcome you back.', true),
('wt2', '60-Day Reminder', 'reminder_60_day', 'en', 'MARKETING', 60, 'Follow-up after 60 days inactive',
 'Hi {{customer_name}}, it''s been {{days_since_visit}} days since your last visit to {{salon_name}}.
We would love to see you again soon.', true),
('wt3', '90-Day Reminder', 'reminder_90_day', 'en', 'MARKETING', 90, 'Final retention nudge after 90 days',
 'Hi {{customer_name}}, it has been {{days_since_visit}} days since we saw you at {{salon_name}}.
Your favourite chair is waiting for you.', true),
('wt4', 'Premium Customer Message', 'premium_thanks', 'en', 'UTILITY', null, 'Appreciation message for Premium clients',
 'Hi {{customer_name}}, thank you for being one of our Premium customers.
We appreciate your continued support.', true),
('wt5', 'Staff Document Expiry', 'staff_document_expiry', 'en', 'UTILITY', 30, 'Owner reminder when passport, visa, or Emirates ID is near expiry',
 'Hi {{owner_name}}, reminder from {{salon_name}}:
{{staff_name}} — {{document_type}} expires on {{expiry_date}} ({{days_remaining}} days left).
Please renew in time.', true)
on conflict (id) do nothing;
