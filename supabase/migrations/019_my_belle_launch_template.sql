-- My Belle launch (Arabic, no variables). Meta name: my_belle_launch / ar
insert into public.whatsapp_templates (
  id, name, whatsapp_template_name, language, category, trigger_days, description, body, active
) values (
  'wt8',
  'My Belle launch',
  'my_belle_launch',
  'ar',
  'MARKETING',
  null,
  'Sent to customers you already served — introduce My Belle and ask them to complete their details',
  E'بيل أقرب لِك 💚\n\nيسعدنا نعرّفك على My Belle ✨\n\nمساحتك الخاصة مع Belle، صممناها عشان تكون حجوزاتك، مزاياك وهداياك كلها في مكان واحد.\n\nفعّلي حسابك الآن وكمّلي بياناتك عشان تبدأ تجربتك معنا.',
  true
)
on conflict (id) do update set
  name = excluded.name,
  whatsapp_template_name = excluded.whatsapp_template_name,
  language = excluded.language,
  category = excluded.category,
  description = excluded.description,
  body = excluded.body,
  active = true;
