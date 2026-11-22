-- Prevent concurrent inbound webhooks from sending duplicate welcome replies.
-- The advisory lock serializes welcome decisions for one salon + phone.

create or replace function public.claim_whatsapp_welcome(
  p_salon_id uuid,
  p_customer_id text,
  p_phone text,
  p_preview text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_key text;
  v_claim_id text;
begin
  v_phone_key := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  if length(v_phone_key) < 8 then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_salon_id::text || ':' || v_phone_key));

  if exists (
    select 1
    from public.whatsapp_messages m
    where m.salon_id = p_salon_id
      and right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 9) = v_phone_key
      and m.trigger_type = 'Welcome auto reply'
      and m.status in ('Queued', 'Sent', 'Delivered', 'Read')
      and m.sent_at >= now() - interval '20 hours'
  ) then
    return null;
  end if;

  v_claim_id :=
    'wmw-' ||
    to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') ||
    '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 8);

  insert into public.whatsapp_messages (
    id,
    customer_id,
    template_id,
    phone,
    trigger_type,
    status,
    sent_by,
    sent_at,
    preview,
    send_mode,
    salon_id
  ) values (
    v_claim_id,
    p_customer_id,
    'wt9',
    p_phone,
    'Welcome auto reply',
    'Queued',
    'Automation',
    now(),
    p_preview,
    'text',
    p_salon_id
  );

  return v_claim_id;
end;
$$;

revoke all on function public.claim_whatsapp_welcome(uuid, text, text, text) from public;
grant execute on function public.claim_whatsapp_welcome(uuid, text, text, text) to service_role;
