-- Belle subscription packages as giftable services (visit picker + gifts.service_id FK)

insert into public.services (id, name, category, default_price, description, active) values
  ('pkg_nail_annual', 'Annual Nail Subscription', 'Packages', 1500, '12 months · Classic Mani & Pedi', true),
  ('pkg_organic_hair', 'Organic Hair Treatment', 'Packages', 420, '5 sessions / 4 months', true),
  ('pkg_loreal_hair', 'L''Oreal Professional Hair Treatment', 'Packages', 850, '5 sessions / 4 months', true),
  ('pkg_massage', 'Massage Package', 'Packages', 800, '5 sessions / 6 months', true)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  default_price = excluded.default_price,
  description = excluded.description,
  active = excluded.active;
