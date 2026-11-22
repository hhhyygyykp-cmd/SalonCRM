-- Loyalty wallet tokens + post-visit thank-you template

alter table public.customers
  add column if not exists wallet_token uuid unique default gen_random_uuid(),
  add column if not exists wallet_apple_serial text,
  add column if not exists wallet_google_object_id text;

update public.customers
set wallet_token = gen_random_uuid()
where wallet_token is null;

alter table public.customers
  alter column wallet_token set not null,
  alter column wallet_token set default gen_random_uuid();

create index if not exists customers_wallet_token_idx on public.customers (wallet_token);

insert into public.whatsapp_templates (
  id, name, whatsapp_template_name, language, category, trigger_days, description, body, active
) values (
  'wt6',
  'Post-visit thank you',
  'post_visit_thanks',
  'en',
  'UTILITY',
  null,
  'Sent automatically after each visit with loyalty wallet link',
  'Thanks for choosing {{salon_name}}, {{customer_name}}.
Your loyalty tier is {{loyalty_tier}}.
Add your card to Apple or Google Wallet: {{wallet_link}}',
  true
)
on conflict (id) do update set
  name = excluded.name,
  whatsapp_template_name = excluded.whatsapp_template_name,
  description = excluded.description,
  body = excluded.body,
  active = excluded.active;
