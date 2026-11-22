-- Multi-salon isolation: each owner/staff only sees their salon's data.
-- Belle keeps all existing rows. A second empty salon is seeded for a new admin.

create table if not exists public.salons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- Stable IDs so setup docs can reference them
insert into public.salons (id, name, slug) values
  ('a0000000-0000-4000-8000-000000000001', 'Belle Beauty Lounge', 'belle'),
  ('a0000000-0000-4000-8000-000000000002', 'New Salon', 'new-salon')
on conflict (id) do nothing;

-- Profiles must get salon_id BEFORE helper functions reference it
alter table public.profiles
  add column if not exists salon_id uuid references public.salons (id);

update public.profiles
set salon_id = 'a0000000-0000-4000-8000-000000000001'
where salon_id is null;

alter table public.profiles
  alter column salon_id set not null;

create index if not exists profiles_salon_idx on public.profiles (salon_id);

create or replace function public.current_salon_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.salon_id
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active'
  limit 1;
$$;

create or replace function public.same_salon(p_salon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_salon_id is not null and p_salon_id = public.current_salon_id();
$$;

-- Auto-stamp salon_id on insert when omitted
create or replace function public.set_row_salon_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.salon_id is null then
    new.salon_id := public.current_salon_id();
  end if;
  if new.salon_id is null then
    raise exception 'salon_id is required';
  end if;
  return new;
end;
$$;

-- Salon settings: one row per salon
alter table public.salon_settings
  add column if not exists salon_id uuid references public.salons (id);

update public.salon_settings
set salon_id = 'a0000000-0000-4000-8000-000000000001'
where id = 1 and salon_id is null;

alter table public.salon_settings drop constraint if exists salon_settings_pkey;
alter table public.salon_settings drop constraint if exists salon_settings_id_check;

alter table public.salon_settings
  alter column id drop default;

-- Keep legacy id column nullable for compatibility; salon_id becomes the key
alter table public.salon_settings
  alter column id drop not null;

alter table public.salon_settings
  alter column salon_id set not null;

alter table public.salon_settings
  add primary key (salon_id);

insert into public.salon_settings (
  salon_id, salon_name, phone, whatsapp, address, currency, timezone,
  reminder_days, automation_enabled, owner_name, owner_whatsapp, staff_document_reminder_days
) values (
  'a0000000-0000-4000-8000-000000000002',
  'New Salon',
  '',
  '',
  '',
  'AED',
  'Asia/Dubai',
  '{30,60,90}',
  false,
  'Owner',
  '',
  30
) on conflict (salon_id) do nothing;

-- Helper: add salon_id + backfill + trigger + index
-- Applied to each tenant table below.

alter table public.customers add column if not exists salon_id uuid references public.salons (id);
alter table public.services add column if not exists salon_id uuid references public.salons (id);
alter table public.vouchers add column if not exists salon_id uuid references public.salons (id);
alter table public.visits add column if not exists salon_id uuid references public.salons (id);
alter table public.expenses add column if not exists salon_id uuid references public.salons (id);
alter table public.whatsapp_templates add column if not exists salon_id uuid references public.salons (id);
alter table public.whatsapp_messages add column if not exists salon_id uuid references public.salons (id);

update public.customers set salon_id = 'a0000000-0000-4000-8000-000000000001' where salon_id is null;
update public.services set salon_id = 'a0000000-0000-4000-8000-000000000001' where salon_id is null;
update public.vouchers set salon_id = 'a0000000-0000-4000-8000-000000000001' where salon_id is null;
update public.visits set salon_id = 'a0000000-0000-4000-8000-000000000001' where salon_id is null;
update public.expenses set salon_id = 'a0000000-0000-4000-8000-000000000001' where salon_id is null;
update public.whatsapp_templates set salon_id = 'a0000000-0000-4000-8000-000000000001' where salon_id is null;
update public.whatsapp_messages set salon_id = 'a0000000-0000-4000-8000-000000000001' where salon_id is null;

alter table public.customers alter column salon_id set not null;
alter table public.services alter column salon_id set not null;
alter table public.vouchers alter column salon_id set not null;
alter table public.visits alter column salon_id set not null;
alter table public.expenses alter column salon_id set not null;
alter table public.whatsapp_templates alter column salon_id set not null;
alter table public.whatsapp_messages alter column salon_id set not null;

-- Phone / code uniqueness per salon
alter table public.customers drop constraint if exists customers_phone_key;
drop index if exists customers_phone_key;
create unique index if not exists customers_salon_phone_uidx on public.customers (salon_id, phone);

alter table public.vouchers drop constraint if exists vouchers_code_key;
drop index if exists vouchers_code_key;
create unique index if not exists vouchers_salon_code_uidx on public.vouchers (salon_id, code);

-- Templates: allow same logical ids (wt1…) per salon
alter table public.whatsapp_templates drop constraint if exists whatsapp_templates_pkey;
alter table public.whatsapp_templates add primary key (salon_id, id);

-- Seed empty-salon starter templates (copy Belle defaults)
insert into public.whatsapp_templates (
  salon_id, id, name, whatsapp_template_name, language, category, trigger_days, description, body, active
)
select
  'a0000000-0000-4000-8000-000000000002',
  t.id, t.name, t.whatsapp_template_name, t.language, t.category, t.trigger_days, t.description, t.body, t.active
from public.whatsapp_templates t
where t.salon_id = 'a0000000-0000-4000-8000-000000000001'
on conflict (salon_id, id) do nothing;

-- Optional tables (may exist from later migrations)
do $$
begin
  if to_regclass('public.gifts') is not null then
    execute 'alter table public.gifts add column if not exists salon_id uuid references public.salons (id)';
    execute 'update public.gifts set salon_id = ''a0000000-0000-4000-8000-000000000001'' where salon_id is null';
    execute 'alter table public.gifts alter column salon_id set not null';
  end if;
  if to_regclass('public.members') is not null then
    execute 'alter table public.members add column if not exists salon_id uuid references public.salons (id)';
    execute 'update public.members set salon_id = ''a0000000-0000-4000-8000-000000000001'' where salon_id is null';
    execute 'alter table public.members alter column salon_id set not null';
    execute 'alter table public.members drop constraint if exists members_phone_key';
    execute 'drop index if exists members_phone_key';
    execute 'create unique index if not exists members_salon_phone_uidx on public.members (salon_id, phone)';
  end if;
  if to_regclass('public.customer_memberships') is not null then
    execute 'alter table public.customer_memberships add column if not exists salon_id uuid references public.salons (id)';
    execute 'update public.customer_memberships set salon_id = ''a0000000-0000-4000-8000-000000000001'' where salon_id is null';
    execute 'alter table public.customer_memberships alter column salon_id set not null';
  end if;
  if to_regclass('public.membership_cycles') is not null then
    execute 'alter table public.membership_cycles add column if not exists salon_id uuid references public.salons (id)';
    execute 'update public.membership_cycles set salon_id = ''a0000000-0000-4000-8000-000000000001'' where salon_id is null';
    execute 'alter table public.membership_cycles alter column salon_id set not null';
  end if;
  if to_regclass('public.membership_usages') is not null then
    execute 'alter table public.membership_usages add column if not exists salon_id uuid references public.salons (id)';
    execute 'update public.membership_usages set salon_id = ''a0000000-0000-4000-8000-000000000001'' where salon_id is null';
    execute 'alter table public.membership_usages alter column salon_id set not null';
  end if;
  if to_regclass('public.whatsapp_conversations') is not null then
    execute 'alter table public.whatsapp_conversations add column if not exists salon_id uuid references public.salons (id)';
    execute 'update public.whatsapp_conversations set salon_id = ''a0000000-0000-4000-8000-000000000001'' where salon_id is null';
    execute 'alter table public.whatsapp_conversations alter column salon_id set not null';
  end if;
  if to_regclass('public.whatsapp_chat_messages') is not null then
    execute 'alter table public.whatsapp_chat_messages add column if not exists salon_id uuid references public.salons (id)';
    execute 'update public.whatsapp_chat_messages m set salon_id = c.salon_id from public.whatsapp_conversations c where m.conversation_id = c.id and m.salon_id is null';
    execute 'update public.whatsapp_chat_messages set salon_id = ''a0000000-0000-4000-8000-000000000001'' where salon_id is null';
    execute 'alter table public.whatsapp_chat_messages alter column salon_id set not null';
  end if;
  if to_regclass('public.whatsapp_integrations') is not null then
    execute 'alter table public.whatsapp_integrations add column if not exists salon_id uuid references public.salons (id)';
    execute 'update public.whatsapp_integrations set salon_id = ''a0000000-0000-4000-8000-000000000001'' where salon_id is null';
    execute 'alter table public.whatsapp_integrations alter column salon_id set not null';
    execute 'drop index if exists whatsapp_integrations_one_active';
    execute 'create unique index if not exists whatsapp_integrations_one_active on public.whatsapp_integrations (salon_id) where is_active = true';
  end if;
end $$;

-- Triggers to stamp salon_id
drop trigger if exists customers_set_salon on public.customers;
create trigger customers_set_salon before insert on public.customers
  for each row execute function public.set_row_salon_id();

drop trigger if exists services_set_salon on public.services;
create trigger services_set_salon before insert on public.services
  for each row execute function public.set_row_salon_id();

drop trigger if exists vouchers_set_salon on public.vouchers;
create trigger vouchers_set_salon before insert on public.vouchers
  for each row execute function public.set_row_salon_id();

drop trigger if exists visits_set_salon on public.visits;
create trigger visits_set_salon before insert on public.visits
  for each row execute function public.set_row_salon_id();

drop trigger if exists expenses_set_salon on public.expenses;
create trigger expenses_set_salon before insert on public.expenses
  for each row execute function public.set_row_salon_id();

drop trigger if exists whatsapp_templates_set_salon on public.whatsapp_templates;
create trigger whatsapp_templates_set_salon before insert on public.whatsapp_templates
  for each row execute function public.set_row_salon_id();

drop trigger if exists whatsapp_messages_set_salon on public.whatsapp_messages;
create trigger whatsapp_messages_set_salon before insert on public.whatsapp_messages
  for each row execute function public.set_row_salon_id();

drop trigger if exists profiles_set_salon on public.profiles;
create trigger profiles_set_salon before insert on public.profiles
  for each row execute function public.set_row_salon_id();

do $$
begin
  if to_regclass('public.gifts') is not null then
    execute 'drop trigger if exists gifts_set_salon on public.gifts';
    execute 'create trigger gifts_set_salon before insert on public.gifts for each row execute function public.set_row_salon_id()';
  end if;
  if to_regclass('public.members') is not null then
    execute 'drop trigger if exists members_set_salon on public.members';
    execute 'create trigger members_set_salon before insert on public.members for each row execute function public.set_row_salon_id()';
  end if;
  if to_regclass('public.customer_memberships') is not null then
    execute 'drop trigger if exists customer_memberships_set_salon on public.customer_memberships';
    execute 'create trigger customer_memberships_set_salon before insert on public.customer_memberships for each row execute function public.set_row_salon_id()';
  end if;
  if to_regclass('public.membership_cycles') is not null then
    execute 'drop trigger if exists membership_cycles_set_salon on public.membership_cycles';
    execute 'create trigger membership_cycles_set_salon before insert on public.membership_cycles for each row execute function public.set_row_salon_id()';
  end if;
  if to_regclass('public.membership_usages') is not null then
    execute 'drop trigger if exists membership_usages_set_salon on public.membership_usages';
    execute 'create trigger membership_usages_set_salon before insert on public.membership_usages for each row execute function public.set_row_salon_id()';
  end if;
  if to_regclass('public.whatsapp_conversations') is not null then
    execute 'drop trigger if exists whatsapp_conversations_set_salon on public.whatsapp_conversations';
    execute 'create trigger whatsapp_conversations_set_salon before insert on public.whatsapp_conversations for each row execute function public.set_row_salon_id()';
  end if;
  if to_regclass('public.whatsapp_chat_messages') is not null then
    execute 'drop trigger if exists whatsapp_chat_messages_set_salon on public.whatsapp_chat_messages';
    execute 'create trigger whatsapp_chat_messages_set_salon before insert on public.whatsapp_chat_messages for each row execute function public.set_row_salon_id()';
  end if;
  if to_regclass('public.whatsapp_integrations') is not null then
    execute 'drop trigger if exists whatsapp_integrations_set_salon on public.whatsapp_integrations';
    execute 'create trigger whatsapp_integrations_set_salon before insert on public.whatsapp_integrations for each row execute function public.set_row_salon_id()';
  end if;
end $$;

-- Signup: allow salon_id in user metadata; default Belle for backward compatibility
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_role text := lower(coalesce(new.raw_user_meta_data->>'role', 'staff'));
  meta_salon uuid;
begin
  if meta_role not in ('owner', 'staff') then
    meta_role := 'staff';
  end if;

  begin
    meta_salon := nullif(new.raw_user_meta_data->>'salon_id', '')::uuid;
  exception when others then
    meta_salon := null;
  end;

  if meta_salon is null or not exists (select 1 from public.salons s where s.id = meta_salon) then
    meta_salon := 'a0000000-0000-4000-8000-000000000001';
  end if;

  insert into public.profiles (id, name, email, role, status, salon_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    meta_role,
    'active',
    meta_salon
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- RLS: replace shared policies with salon-scoped ones
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.same_salon(salon_id));

drop policy if exists profiles_update_owner on public.profiles;
create policy profiles_update_owner on public.profiles for update to authenticated
  using (public.is_owner() and public.same_salon(salon_id))
  with check (public.is_owner() and public.same_salon(salon_id));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and salon_id = (select p.salon_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists profiles_insert_owner on public.profiles;
create policy profiles_insert_owner on public.profiles for insert to authenticated
  with check (public.is_owner() and public.same_salon(salon_id));

drop policy if exists settings_select on public.salon_settings;
create policy settings_select on public.salon_settings for select to authenticated
  using (public.same_salon(salon_id));

drop policy if exists settings_update on public.salon_settings;
create policy settings_update on public.salon_settings for all to authenticated
  using (public.is_owner() and public.same_salon(salon_id))
  with check (public.is_owner() and public.same_salon(salon_id));

drop policy if exists customers_all on public.customers;
create policy customers_all on public.customers for all to authenticated
  using (public.is_staff_user() and public.same_salon(salon_id))
  with check (public.is_staff_user() and public.same_salon(salon_id));

drop policy if exists services_all on public.services;
create policy services_all on public.services for all to authenticated
  using (public.is_staff_user() and public.same_salon(salon_id))
  with check (public.is_staff_user() and public.same_salon(salon_id));

drop policy if exists visits_all on public.visits;
create policy visits_all on public.visits for all to authenticated
  using (public.is_staff_user() and public.same_salon(salon_id))
  with check (public.is_staff_user() and public.same_salon(salon_id));

drop policy if exists templates_all on public.whatsapp_templates;
create policy templates_all on public.whatsapp_templates for all to authenticated
  using (public.is_staff_user() and public.same_salon(salon_id))
  with check (public.is_staff_user() and public.same_salon(salon_id));

drop policy if exists messages_all on public.whatsapp_messages;
create policy messages_all on public.whatsapp_messages for all to authenticated
  using (public.is_staff_user() and public.same_salon(salon_id))
  with check (public.is_staff_user() and public.same_salon(salon_id));

drop policy if exists vouchers_select on public.vouchers;
drop policy if exists vouchers_insert on public.vouchers;
drop policy if exists vouchers_update on public.vouchers;
create policy vouchers_select on public.vouchers for select to authenticated
  using (public.is_staff_user() and public.same_salon(salon_id));
create policy vouchers_insert on public.vouchers for insert to authenticated
  with check (public.is_owner() and public.same_salon(salon_id));
create policy vouchers_update on public.vouchers for update to authenticated
  using (public.is_staff_user() and public.same_salon(salon_id))
  with check (public.is_staff_user() and public.same_salon(salon_id));

drop policy if exists expenses_owner on public.expenses;
create policy expenses_owner on public.expenses for all to authenticated
  using (public.is_owner() and public.same_salon(salon_id))
  with check (public.is_owner() and public.same_salon(salon_id));

-- Optional table policies
do $$
begin
  if to_regclass('public.gifts') is not null then
    execute 'drop policy if exists gifts_select on public.gifts';
    execute 'drop policy if exists gifts_insert on public.gifts';
    execute 'drop policy if exists gifts_update on public.gifts';
    execute 'drop policy if exists gifts_delete on public.gifts';
    execute 'create policy gifts_select on public.gifts for select to authenticated using (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy gifts_insert on public.gifts for insert to authenticated with check (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy gifts_update on public.gifts for update to authenticated using (public.is_staff_user() and public.same_salon(salon_id)) with check (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy gifts_delete on public.gifts for delete to authenticated using (public.is_owner() and public.same_salon(salon_id))';
  end if;

  if to_regclass('public.members') is not null then
    execute 'drop policy if exists members_select on public.members';
    execute 'drop policy if exists members_insert on public.members';
    execute 'drop policy if exists members_update on public.members';
    execute 'drop policy if exists members_delete on public.members';
    execute 'create policy members_select on public.members for select to authenticated using (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy members_insert on public.members for insert to authenticated with check (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy members_update on public.members for update to authenticated using (public.is_staff_user() and public.same_salon(salon_id)) with check (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy members_delete on public.members for delete to authenticated using (public.is_owner() and public.same_salon(salon_id))';
  end if;

  if to_regclass('public.customer_memberships') is not null then
    execute 'drop policy if exists customer_memberships_select on public.customer_memberships';
    execute 'drop policy if exists customer_memberships_insert on public.customer_memberships';
    execute 'drop policy if exists customer_memberships_update on public.customer_memberships';
    execute 'drop policy if exists customer_memberships_delete on public.customer_memberships';
    execute 'create policy customer_memberships_select on public.customer_memberships for select to authenticated using (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy customer_memberships_insert on public.customer_memberships for insert to authenticated with check (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy customer_memberships_update on public.customer_memberships for update to authenticated using (public.is_staff_user() and public.same_salon(salon_id)) with check (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy customer_memberships_delete on public.customer_memberships for delete to authenticated using (public.is_staff_user() and public.same_salon(salon_id))';
  end if;

  if to_regclass('public.membership_cycles') is not null then
    execute 'drop policy if exists membership_cycles_select on public.membership_cycles';
    execute 'drop policy if exists membership_cycles_insert on public.membership_cycles';
    execute 'drop policy if exists membership_cycles_update on public.membership_cycles';
    execute 'drop policy if exists membership_cycles_delete on public.membership_cycles';
    execute 'create policy membership_cycles_select on public.membership_cycles for select to authenticated using (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy membership_cycles_insert on public.membership_cycles for insert to authenticated with check (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy membership_cycles_update on public.membership_cycles for update to authenticated using (public.is_staff_user() and public.same_salon(salon_id)) with check (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy membership_cycles_delete on public.membership_cycles for delete to authenticated using (public.is_staff_user() and public.same_salon(salon_id))';
  end if;

  if to_regclass('public.membership_usages') is not null then
    execute 'drop policy if exists membership_usages_select on public.membership_usages';
    execute 'drop policy if exists membership_usages_insert on public.membership_usages';
    execute 'drop policy if exists membership_usages_update on public.membership_usages';
    execute 'drop policy if exists membership_usages_delete on public.membership_usages';
    execute 'create policy membership_usages_select on public.membership_usages for select to authenticated using (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy membership_usages_insert on public.membership_usages for insert to authenticated with check (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy membership_usages_update on public.membership_usages for update to authenticated using (public.is_staff_user() and public.same_salon(salon_id)) with check (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy membership_usages_delete on public.membership_usages for delete to authenticated using (public.is_staff_user() and public.same_salon(salon_id))';
  end if;

  if to_regclass('public.whatsapp_conversations') is not null then
    execute 'drop policy if exists whatsapp_conversations_all on public.whatsapp_conversations';
    execute 'create policy whatsapp_conversations_all on public.whatsapp_conversations for all to authenticated using (public.is_staff_user() and public.same_salon(salon_id)) with check (public.is_staff_user() and public.same_salon(salon_id))';
  end if;

  if to_regclass('public.whatsapp_chat_messages') is not null then
    execute 'drop policy if exists whatsapp_chat_messages_all on public.whatsapp_chat_messages';
    execute 'create policy whatsapp_chat_messages_all on public.whatsapp_chat_messages for all to authenticated using (public.is_staff_user() and public.same_salon(salon_id)) with check (public.is_staff_user() and public.same_salon(salon_id))';
  end if;

  if to_regclass('public.whatsapp_integrations') is not null then
    execute 'drop policy if exists whatsapp_integrations_select on public.whatsapp_integrations';
    execute 'create policy whatsapp_integrations_select on public.whatsapp_integrations for select to authenticated using (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'drop policy if exists whatsapp_integrations_owner on public.whatsapp_integrations';
    execute 'create policy whatsapp_integrations_owner on public.whatsapp_integrations for all to authenticated using (public.is_owner() and public.same_salon(salon_id)) with check (public.is_owner() and public.same_salon(salon_id))';
  end if;
end $$;

-- Visit save: ensure customer belongs to caller salon (preserves 017 behavior)
create or replace function public.complete_visit(
  p_visit jsonb,
  p_customer_id text,
  p_lifetime_spend numeric,
  p_total_visits int,
  p_last_visit_at timestamptz,
  p_last_services text[],
  p_loyalty_tier text,
  p_voucher_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.visits%rowtype;
  v_salon uuid := public.current_salon_id();
begin
  if auth.uid() is null or not public.is_staff_user() then
    raise exception 'Not authorized';
  end if;

  if not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.salon_id = v_salon
  ) then
    raise exception 'Customer not found';
  end if;

  insert into public.visits (
    id, customer_id, staff_id, visit_date, services, subtotal, discount,
    voucher_id, voucher_code, voucher_discount, delivery_fee, customer_location,
    final_total, payment_method, notes, gift_purchase_id, gift_redeem_id, loyalty_reward_type,
    salon_id
  ) values (
    p_visit->>'id',
    p_customer_id,
    (p_visit->>'staff_id')::uuid,
    (p_visit->>'visit_date')::timestamptz,
    coalesce(p_visit->'services', '[]'::jsonb),
    coalesce((p_visit->>'subtotal')::numeric, 0),
    coalesce((p_visit->>'discount')::numeric, 0),
    nullif(p_visit->>'voucher_id', ''),
    nullif(p_visit->>'voucher_code', ''),
    case when p_visit ? 'voucher_discount' and nullif(p_visit->>'voucher_discount', '') is not null
      then (p_visit->>'voucher_discount')::numeric else null end,
    coalesce((p_visit->>'delivery_fee')::numeric, 0),
    nullif(p_visit->>'customer_location', ''),
    coalesce((p_visit->>'final_total')::numeric, 0),
    nullif(p_visit->>'payment_method', ''),
    nullif(p_visit->>'notes', ''),
    nullif(p_visit->>'gift_purchase_id', ''),
    nullif(p_visit->>'gift_redeem_id', ''),
    nullif(p_visit->>'loyalty_reward_type', ''),
    v_salon
  )
  returning * into v_row;

  update public.customers
  set
    lifetime_spend = p_lifetime_spend,
    total_visits = p_total_visits,
    last_visit_at = p_last_visit_at,
    last_services = coalesce(p_last_services, '{}'),
    loyalty_tier = p_loyalty_tier,
    updated_at = now()
  where id = p_customer_id and salon_id = v_salon;

  if p_voucher_id is not null and length(trim(p_voucher_id)) > 0 then
    update public.vouchers
    set used_count = used_count + 1
    where id = p_voucher_id and salon_id = v_salon;
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.complete_visit from public;
grant execute on function public.complete_visit to authenticated;

comment on table public.salons is
  'Tenant salons. Belle = a0000000-0000-4000-8000-000000000001; empty admin salon = a0000000-0000-4000-8000-000000000002';
