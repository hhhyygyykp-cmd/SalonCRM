-- The Phone Number ID already on file is for 0509801883.
-- +971 50 200 8228 was a display placeholder only — do not change the ID.

update public.salon_settings
set
  whatsapp = '+971 50 980 1883',
  phone = case
    when regexp_replace(coalesce(phone, ''), '\D', '', 'g') in ('971502008228', '0502008228', '502008228')
      then '+971 50 980 1883'
    else phone
  end,
  updated_at = now()
where id = 1;

update public.whatsapp_integrations
set
  display_phone_number = '+971 50 980 1883',
  updated_at = now()
where regexp_replace(coalesce(display_phone_number, ''), '\D', '', 'g') in ('971502008228', '0502008228', '502008228');
