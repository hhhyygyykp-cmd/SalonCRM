-- Add remaining Green Oasis menu items (visit catalog). Subscriptions stay in Memberships.

insert into public.services (id, name, category, default_price, description, active) values
  ('s69', 'Ombre', 'Nails — Classic', 50, null, true),
  ('s70', 'Gel ombre', 'Nails — Gel', 80, null, true),
  ('s71', 'Trim', 'Hair — Cuts', 30, null, true),
  ('s72', 'Restyle', 'Hair — Cuts', 60, null, true),
  ('s73', 'Hair cut style', 'Hair — Cuts', 120, null, true),
  ('s74', 'Hair cut straight', 'Hair — Cuts', 50, null, true),
  ('s75', 'Organic hair treatment', 'Hair Treatment', 100, 'Aloe vera / Ometic / Banana / Henna · per session', true),
  ('s76', 'Coffee scalp scrub', 'Hair Treatment', 120, null, true),
  ('s77', 'L''Oreal professional hair treatment', 'Hair Treatment', 190, 'Per session', true),
  ('s78', 'Princess manicure', 'Little Princess', 40, null, true),
  ('s79', 'Princess pedicure', 'Little Princess', 50, null, true),
  ('s80', 'Princess mani & pedi', 'Little Princess', 85, null, true),
  ('s81', 'Cut & buff', 'Little Princess', 30, null, true),
  ('s82', 'Kids nail polish', 'Little Princess', 10, null, true),
  ('s83', 'Kids blow dry', 'Little Princess', 30, null, true),
  ('s84', 'Kids hair cut', 'Little Princess', 40, null, true),
  ('s85', 'Kids hair style', 'Little Princess', 50, null, true),
  ('s86', 'Paraffin wax — hands', 'Add-ons', 25, null, true),
  ('s87', 'Paraffin wax — feet', 'Add-ons', 35, null, true),
  ('s88', 'Foot scrub', 'Add-ons', 30, null, true),
  ('s89', 'Nail repair', 'Add-ons', 10, null, true),
  ('s90', 'Gel strengthening', 'Add-ons', 25, null, true),
  ('s91', 'Luxury massage', 'Massage', 230, null, true),
  ('s92', 'Wood therapy / maderotherapy', 'Massage', 210, null, true),
  ('s93', 'Wax — Chest', 'Wax', 70, null, true)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  default_price = excluded.default_price,
  description = excluded.description,
  active = excluded.active;
