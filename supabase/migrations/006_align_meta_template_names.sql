-- Restore CRM Meta template names to the real templates created in Meta Manager.
-- Language must be en_US for English (US).

update public.whatsapp_templates set whatsapp_template_name = 'reminder_30_day', language = 'en_US' where id = 'wt1';
update public.whatsapp_templates set whatsapp_template_name = 'reminder_60_day', language = 'en_US' where id = 'wt2';
update public.whatsapp_templates set whatsapp_template_name = 'reminder_90_day', language = 'en_US' where id = 'wt3';
update public.whatsapp_templates set whatsapp_template_name = 'premium_thanks', language = 'en_US' where id = 'wt4';
update public.whatsapp_templates set whatsapp_template_name = 'staff_document_expiry', language = 'en_US' where id = 'wt5';
update public.whatsapp_templates set whatsapp_template_name = 'post_visit_thanks', language = 'en_US' where id = 'wt6';
