-- Harden data safety: atomic visit save + restrict destructive deletes
-- Safe to re-run (drops policies first)

-- Atomic visit + customer loyalty/spend (+ optional voucher use)
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
begin
  if auth.uid() is null or not public.is_staff_user() then
    raise exception 'Not authorized';
  end if;

  if not exists (select 1 from public.customers c where c.id = p_customer_id) then
    raise exception 'Customer not found';
  end if;

  insert into public.visits (
    id, customer_id, staff_id, visit_date, services, subtotal, discount,
    voucher_id, voucher_code, voucher_discount, delivery_fee, customer_location,
    final_total, payment_method, notes
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
    nullif(p_visit->>'notes', '')
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
  where id = p_customer_id;

  if p_voucher_id is not null and length(trim(p_voucher_id)) > 0 then
    update public.vouchers
    set used_count = used_count + 1
    where id = p_voucher_id;
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.complete_visit from public;
grant execute on function public.complete_visit to authenticated;

-- Customers: staff can read/write, only owner can delete
drop policy if exists customers_all on public.customers;
drop policy if exists customers_select on public.customers;
drop policy if exists customers_insert on public.customers;
drop policy if exists customers_update on public.customers;
drop policy if exists customers_delete on public.customers;
create policy customers_select on public.customers for select to authenticated
  using (public.is_staff_user());
create policy customers_insert on public.customers for insert to authenticated
  with check (public.is_staff_user());
create policy customers_update on public.customers for update to authenticated
  using (public.is_staff_user()) with check (public.is_staff_user());
create policy customers_delete on public.customers for delete to authenticated
  using (public.is_owner());

-- Visits: no deletes (history must remain)
drop policy if exists visits_all on public.visits;
drop policy if exists visits_select on public.visits;
drop policy if exists visits_insert on public.visits;
drop policy if exists visits_update on public.visits;
create policy visits_select on public.visits for select to authenticated
  using (public.is_staff_user());
create policy visits_insert on public.visits for insert to authenticated
  with check (public.is_staff_user());
create policy visits_update on public.visits for update to authenticated
  using (public.is_staff_user()) with check (public.is_staff_user());

-- Services: staff manage, only owner can delete
drop policy if exists services_all on public.services;
drop policy if exists services_select on public.services;
drop policy if exists services_insert on public.services;
drop policy if exists services_update on public.services;
drop policy if exists services_delete on public.services;
create policy services_select on public.services for select to authenticated
  using (public.is_staff_user());
create policy services_insert on public.services for insert to authenticated
  with check (public.is_staff_user());
create policy services_update on public.services for update to authenticated
  using (public.is_staff_user()) with check (public.is_staff_user());
create policy services_delete on public.services for delete to authenticated
  using (public.is_owner());
