-- Remove unused English templates and their logged messages
delete from public.whatsapp_chat_messages
where template_id in ('wt4', 'wt5')
   or trigger_type in ('Staff Document Reminder', 'Premium Customer Message');

delete from public.whatsapp_messages
where template_id in ('wt4', 'wt5')
   or trigger_type in ('Staff Document Reminder');

delete from public.whatsapp_templates
where id in ('wt4', 'wt5');
