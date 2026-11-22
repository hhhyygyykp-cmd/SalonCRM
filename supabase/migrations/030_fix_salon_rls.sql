-- Repair: 004 created unscoped policies (customers_select, visits_select, …).
-- 029 only replaced customers_all, so the old policies still OR-open every salon.
-- Drop every known unscoped policy and keep salon-scoped ones only.

-- Ensure helpers exist (029 may have created them)
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

revoke all on function public.current_salon_id() from public;
revoke all on function public.same_salon(uuid) from public;
grant execute on function public.current_salon_id() to authenticated;
grant execute on function public.same_salon(uuid) to authenticated;

-- Customers
drop policy if exists customers_all on public.customers;
drop policy if exists customers_select on public.customers;
drop policy if exists customers_insert on public.customers;
drop policy if exists customers_update on public.customers;
drop policy if exists customers_delete on public.customers;
create policy customers_select on public.customers for select to authenticated
  using (public.is_staff_user() and public.same_salon(salon_id));
create policy customers_insert on public.customers for insert to authenticated
  with check (public.is_staff_user() and public.same_salon(salon_id));
create policy customers_update on public.customers for update to authenticated
  using (public.is_staff_user() and public.same_salon(salon_id))
  with check (public.is_staff_user() and public.same_salon(salon_id));
create policy customers_delete on public.customers for delete to authenticated
  using (public.is_owner() and public.same_salon(salon_id));

-- Visits
drop policy if exists visits_all on public.visits;
drop policy if exists visits_select on public.visits;
drop policy if exists visits_insert on public.visits;
drop policy if exists visits_update on public.visits;
drop policy if exists visits_delete on public.visits;
create policy visits_select on public.visits for select to authenticated
  using (public.is_staff_user() and public.same_salon(salon_id));
create policy visits_insert on public.visits for insert to authenticated
  with check (public.is_staff_user() and public.same_salon(salon_id));
create policy visits_update on public.visits for update to authenticated
  using (public.is_staff_user() and public.same_salon(salon_id))
  with check (public.is_staff_user() and public.same_salon(salon_id));

-- Services
drop policy if exists services_all on public.services;
drop policy if exists services_select on public.services;
drop policy if exists services_insert on public.services;
drop policy if exists services_update on public.services;
drop policy if exists services_delete on public.services;
create policy services_select on public.services for select to authenticated
  using (public.is_staff_user() and public.same_salon(salon_id));
create policy services_insert on public.services for insert to authenticated
  with check (public.is_staff_user() and public.same_salon(salon_id));
create policy services_update on public.services for update to authenticated
  using (public.is_staff_user() and public.same_salon(salon_id))
  with check (public.is_staff_user() and public.same_salon(salon_id));
create policy services_delete on public.services for delete to authenticated
  using (public.is_owner() and public.same_salon(salon_id));

-- Profiles
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_owner on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_insert_owner on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.same_salon(salon_id));
create policy profiles_update_owner on public.profiles for update to authenticated
  using (public.is_owner() and public.same_salon(salon_id))
  with check (public.is_owner() and public.same_salon(salon_id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and salon_id = (select p.salon_id from public.profiles p where p.id = auth.uid())
  );
create policy profiles_insert_owner on public.profiles for insert to authenticated
  with check (public.is_owner() and public.same_salon(salon_id));

-- Settings
drop policy if exists settings_select on public.salon_settings;
drop policy if exists settings_update on public.salon_settings;
create policy settings_select on public.salon_settings for select to authenticated
  using (public.same_salon(salon_id));
create policy settings_update on public.salon_settings for all to authenticated
  using (public.is_owner() and public.same_salon(salon_id))
  with check (public.is_owner() and public.same_salon(salon_id));

-- Templates / messages / vouchers / expenses
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
drop policy if exists vouchers_delete on public.vouchers;
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

-- Optional tables
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
    execute 'drop policy if exists whatsapp_integrations_owner on public.whatsapp_integrations';
    execute 'create policy whatsapp_integrations_select on public.whatsapp_integrations for select to authenticated using (public.is_staff_user() and public.same_salon(salon_id))';
    execute 'create policy whatsapp_integrations_owner on public.whatsapp_integrations for all to authenticated using (public.is_owner() and public.same_salon(salon_id)) with check (public.is_owner() and public.same_salon(salon_id))';
  end if;
end $$;
