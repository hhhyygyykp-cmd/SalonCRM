-- Gift-receiver WhatsApp copy (Arabic). Meta template name: gift_received / ar
insert into public.whatsapp_templates (
  id, name, whatsapp_template_name, language, category, trigger_days, description, body, active
) values (
  'wt7',
  'Gift received',
  'gift_received',
  'ar',
  'UTILITY',
  null,
  'Sent to the gift receiver when someone buys them a service',
  E'وصلتك هدية من شخص مُحب 💚\n\nيسعدنا في Belle نوصل لِك هديتك ونرتب تجربتك في الوقت اللي يناسبك ✨\n\nتواصلي معنا لاختيار موعدك.',
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
