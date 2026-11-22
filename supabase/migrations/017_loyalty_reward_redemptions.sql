-- Loyalty reward redemptions on visits (Gold / Premium free services)

alter table public.visits
  add column if not exists loyalty_reward_type text
  check (
    loyalty_reward_type is null
    or loyalty_reward_type in ('gold_mani_pedi', 'premium_monthly_service', 'premium_thousand_mani_pedi')
  );

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
    final_total, payment_method, notes, gift_purchase_id, gift_redeem_id, loyalty_reward_type
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
    nullif(p_visit->>'loyalty_reward_type', '')
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
