-- Switch Belle's public WhatsApp to the 360dialog Coexistence number.
-- 050 980 1883 (old Cloud API) and 050 200 8228 (display-only) are retired.

update public.salon_settings
set
  whatsapp = '+971 56 140 4016',
  phone = case
    when regexp_replace(coalesce(phone, ''), '\D', '', 'g') in ('971509801883', '509801883', '971502008228', '502008228')
      then '+971 56 140 4016'
    else phone
  end,
  updated_at = now()
where salon_id = 'a0000000-0000-4000-8000-000000000001'
   or id = 1;

update public.whatsapp_integrations
set
  display_phone_number = '+971 56 140 4016',
  updated_at = now()
where regexp_replace(coalesce(display_phone_number, ''), '\D', '', 'g') in (
  '971509801883',
  '509801883',
  '971502008228',
  '502008228'
);
