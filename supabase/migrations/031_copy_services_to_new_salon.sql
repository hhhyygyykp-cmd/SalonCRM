-- Copy Belle's service menu (categories + prices) into the empty second salon.
-- New ids are prefixed so they don't collide with Belle's primary keys.

insert into public.services (id, name, category, default_price, description, active, salon_id)
select
  'ns_' || s.id,
  s.name,
  s.category,
  s.default_price,
  s.description,
  s.active,
  'a0000000-0000-4000-8000-000000000002'
from public.services s
where s.salon_id = 'a0000000-0000-4000-8000-000000000001'
  and not exists (
    select 1
    from public.services existing
    where existing.salon_id = 'a0000000-0000-4000-8000-000000000002'
      and existing.name = s.name
      and existing.category = s.category
  )
on conflict (id) do nothing;
