-- Unify customer + visit location spellings to official Belle area list
-- Generated 2026-08-28T10:46:06.191Z
-- Safe to re-run.

begin;

create temporary table _area_aliases (
  raw text primary key,
  canonical text
) on commit drop;

insert into _area_aliases (raw, canonical) values
  ('gift sender', null),
  ('gift purchase', null),
  ('gift receiver', null),
  ('no location', null),
  ('unknown', null),
  ('zackir', 'Zakher'),
  ('zakir', 'Zakher'),
  ('ramlat zakher', 'Ramlat Zakher'),
  ('al dhaher', 'Al Dahir'),
  ('al dahir', 'Al Dahir'),
  ('ain al faydha', 'Al Foah'),
  ('ain alfaydha', 'Al Foah'),
  ('al foah', 'Al Foah'),
  ('al foah / ain alfaydha', 'Al Foah'),
  ('al aamerah', 'Al Ameriya'),
  ('al ameriya', 'Al Ameriya'),
  ('al ameria', 'Al Ameriya'),
  ('al salamat', 'Al Salamat'),
  ('al sarooj', 'Al Sarooj'),
  ('sarooj', 'Al Sarooj'),
  ('falaj hazza', 'Falaj Hazza'),
  ('al maqam', 'Al Maqam'),
  ('mezyad', 'Mezyad'),
  ('nahil', 'Nahel'),
  ('niema', 'Ne''mah'),
  ('nimah', 'Ne''mah'),
  ('ne''mah', 'Ne''mah'),
  ('al hili', 'Al Hili'),
  ('hili', 'Al Hili'),
  ('al bateen', 'Al Bateen'),
  ('al towayya', 'Al Towayya'),
  ('al yahar', 'Al Yahar'),
  ('al khabisi', 'Al Khabisi'),
  ('shiab al ashkhar', 'Shiab Al Ashkhar'),
  ('shiab al ashkar', 'Shiab Al Ashkhar'),
  ('um ghafa', 'Um Ghafa'),
  ('um ghafah', 'Um Ghafa'),
  ('sweihan', 'Sweihan'),
  ('remah', 'Remah'),
  ('al agabiyya', 'Al Agabiyya'),
  ('al agabiyaa', 'Al Agabiyya'),
  ('central district', 'Al Ain Central District'),
  ('al ain central district', 'Al Ain Central District'),
  ('zakher', 'Zakher'),
  ('al grayyeh', 'Al Grayyeh'),
  ('al jahili', 'Al Jahili'),
  ('al jimi', 'Al Jimi'),
  ('al khalidiya', 'Al Khalidiya'),
  ('al khrair', 'Al Khrair'),
  ('al kuwaitat', 'Al Kuwaitat'),
  ('al markhaniya', 'Al Markhaniya'),
  ('al masoudi', 'Al Masoudi'),
  ('al mraijeb', 'Al Mraijeb'),
  ('al muwaiji', 'Al Muwaiji'),
  ('al mutaredh', 'Al Mutaredh'),
  ('al mutawa''a', 'Al Mutawa''a'),
  ('al nayadat', 'Al Nayadat'),
  ('al qattara', 'Al Qattara'),
  ('al ruwaikah', 'Al Ruwaikah'),
  ('al shuaibah', 'Al Shuaibah'),
  ('asharej', 'Asharej'),
  ('oud al touba', 'Oud Al Touba'),
  ('al faqa', 'Al Faqa'),
  ('al hayer', 'Al Hayer'),
  ('al wagan', 'Al Wagan');

-- Legacy alias spellings
update public.customers c
set location = a.canonical, updated_at = now()
from _area_aliases a
where c.location is not null and lower(trim(c.location)) = a.raw;

update public.visits v
set customer_location = a.canonical
from _area_aliases a
where v.customer_location is not null and lower(trim(v.customer_location)) = a.raw;

-- Official list casing (e.g. al salamat → Al Salamat)
update public.customers set location = 'Al Agabiyya', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Agabiyya') and location is distinct from 'Al Agabiyya';
update public.visits set customer_location = 'Al Agabiyya'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Agabiyya') and customer_location is distinct from 'Al Agabiyya';
update public.customers set location = 'Al Ain Central District', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Ain Central District') and location is distinct from 'Al Ain Central District';
update public.visits set customer_location = 'Al Ain Central District'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Ain Central District') and customer_location is distinct from 'Al Ain Central District';
update public.customers set location = 'Al Ain Industrial Area', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Ain Industrial Area') and location is distinct from 'Al Ain Industrial Area';
update public.visits set customer_location = 'Al Ain Industrial Area'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Ain Industrial Area') and customer_location is distinct from 'Al Ain Industrial Area';
update public.customers set location = 'Al Ameriya', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Ameriya') and location is distinct from 'Al Ameriya';
update public.visits set customer_location = 'Al Ameriya'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Ameriya') and customer_location is distinct from 'Al Ameriya';
update public.customers set location = 'Al Bateen', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Bateen') and location is distinct from 'Al Bateen';
update public.visits set customer_location = 'Al Bateen'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Bateen') and customer_location is distinct from 'Al Bateen';
update public.customers set location = 'Al Dahir', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Dahir') and location is distinct from 'Al Dahir';
update public.visits set customer_location = 'Al Dahir'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Dahir') and customer_location is distinct from 'Al Dahir';
update public.customers set location = 'Al Foah', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Foah') and location is distinct from 'Al Foah';
update public.visits set customer_location = 'Al Foah'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Foah') and customer_location is distinct from 'Al Foah';
update public.customers set location = 'Al Grayyeh', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Grayyeh') and location is distinct from 'Al Grayyeh';
update public.visits set customer_location = 'Al Grayyeh'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Grayyeh') and customer_location is distinct from 'Al Grayyeh';
update public.customers set location = 'Al Hili', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Hili') and location is distinct from 'Al Hili';
update public.visits set customer_location = 'Al Hili'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Hili') and customer_location is distinct from 'Al Hili';
update public.customers set location = 'Al Jahili', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Jahili') and location is distinct from 'Al Jahili';
update public.visits set customer_location = 'Al Jahili'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Jahili') and customer_location is distinct from 'Al Jahili';
update public.customers set location = 'Al Jimi', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Jimi') and location is distinct from 'Al Jimi';
update public.visits set customer_location = 'Al Jimi'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Jimi') and customer_location is distinct from 'Al Jimi';
update public.customers set location = 'Al Khabisi', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Khabisi') and location is distinct from 'Al Khabisi';
update public.visits set customer_location = 'Al Khabisi'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Khabisi') and customer_location is distinct from 'Al Khabisi';
update public.customers set location = 'Al Khalidiya', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Khalidiya') and location is distinct from 'Al Khalidiya';
update public.visits set customer_location = 'Al Khalidiya'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Khalidiya') and customer_location is distinct from 'Al Khalidiya';
update public.customers set location = 'Al Khrair', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Khrair') and location is distinct from 'Al Khrair';
update public.visits set customer_location = 'Al Khrair'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Khrair') and customer_location is distinct from 'Al Khrair';
update public.customers set location = 'Al Kuwaitat', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Kuwaitat') and location is distinct from 'Al Kuwaitat';
update public.visits set customer_location = 'Al Kuwaitat'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Kuwaitat') and customer_location is distinct from 'Al Kuwaitat';
update public.customers set location = 'Al Maqam', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Maqam') and location is distinct from 'Al Maqam';
update public.visits set customer_location = 'Al Maqam'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Maqam') and customer_location is distinct from 'Al Maqam';
update public.customers set location = 'Al Markhaniya', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Markhaniya') and location is distinct from 'Al Markhaniya';
update public.visits set customer_location = 'Al Markhaniya'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Markhaniya') and customer_location is distinct from 'Al Markhaniya';
update public.customers set location = 'Al Masoudi', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Masoudi') and location is distinct from 'Al Masoudi';
update public.visits set customer_location = 'Al Masoudi'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Masoudi') and customer_location is distinct from 'Al Masoudi';
update public.customers set location = 'Al Mraijeb', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Mraijeb') and location is distinct from 'Al Mraijeb';
update public.visits set customer_location = 'Al Mraijeb'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Mraijeb') and customer_location is distinct from 'Al Mraijeb';
update public.customers set location = 'Al Muwaiji', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Muwaiji') and location is distinct from 'Al Muwaiji';
update public.visits set customer_location = 'Al Muwaiji'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Muwaiji') and customer_location is distinct from 'Al Muwaiji';
update public.customers set location = 'Al Mutaredh', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Mutaredh') and location is distinct from 'Al Mutaredh';
update public.visits set customer_location = 'Al Mutaredh'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Mutaredh') and customer_location is distinct from 'Al Mutaredh';
update public.customers set location = 'Al Mutawa''a', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Mutawa''a') and location is distinct from 'Al Mutawa''a';
update public.visits set customer_location = 'Al Mutawa''a'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Mutawa''a') and customer_location is distinct from 'Al Mutawa''a';
update public.customers set location = 'Al Nayadat', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Nayadat') and location is distinct from 'Al Nayadat';
update public.visits set customer_location = 'Al Nayadat'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Nayadat') and customer_location is distinct from 'Al Nayadat';
update public.customers set location = 'Al Qattara', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Qattara') and location is distinct from 'Al Qattara';
update public.visits set customer_location = 'Al Qattara'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Qattara') and customer_location is distinct from 'Al Qattara';
update public.customers set location = 'Al Ruwaikah', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Ruwaikah') and location is distinct from 'Al Ruwaikah';
update public.visits set customer_location = 'Al Ruwaikah'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Ruwaikah') and customer_location is distinct from 'Al Ruwaikah';
update public.customers set location = 'Al Salamat', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Salamat') and location is distinct from 'Al Salamat';
update public.visits set customer_location = 'Al Salamat'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Salamat') and customer_location is distinct from 'Al Salamat';
update public.customers set location = 'Al Sarooj', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Sarooj') and location is distinct from 'Al Sarooj';
update public.visits set customer_location = 'Al Sarooj'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Sarooj') and customer_location is distinct from 'Al Sarooj';
update public.customers set location = 'Al Shuaibah', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Shuaibah') and location is distinct from 'Al Shuaibah';
update public.visits set customer_location = 'Al Shuaibah'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Shuaibah') and customer_location is distinct from 'Al Shuaibah';
update public.customers set location = 'Al Towayya', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Towayya') and location is distinct from 'Al Towayya';
update public.visits set customer_location = 'Al Towayya'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Towayya') and customer_location is distinct from 'Al Towayya';
update public.customers set location = 'Al Yahar', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Yahar') and location is distinct from 'Al Yahar';
update public.visits set customer_location = 'Al Yahar'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Yahar') and customer_location is distinct from 'Al Yahar';
update public.customers set location = 'Asharej', updated_at = now()
where location is not null and lower(trim(location)) = lower('Asharej') and location is distinct from 'Asharej';
update public.visits set customer_location = 'Asharej'
where customer_location is not null and lower(trim(customer_location)) = lower('Asharej') and customer_location is distinct from 'Asharej';
update public.customers set location = 'Falaj Hazza', updated_at = now()
where location is not null and lower(trim(location)) = lower('Falaj Hazza') and location is distinct from 'Falaj Hazza';
update public.visits set customer_location = 'Falaj Hazza'
where customer_location is not null and lower(trim(customer_location)) = lower('Falaj Hazza') and customer_location is distinct from 'Falaj Hazza';
update public.customers set location = 'Ne''mah', updated_at = now()
where location is not null and lower(trim(location)) = lower('Ne''mah') and location is distinct from 'Ne''mah';
update public.visits set customer_location = 'Ne''mah'
where customer_location is not null and lower(trim(customer_location)) = lower('Ne''mah') and customer_location is distinct from 'Ne''mah';
update public.customers set location = 'Oud Al Touba', updated_at = now()
where location is not null and lower(trim(location)) = lower('Oud Al Touba') and location is distinct from 'Oud Al Touba';
update public.visits set customer_location = 'Oud Al Touba'
where customer_location is not null and lower(trim(customer_location)) = lower('Oud Al Touba') and customer_location is distinct from 'Oud Al Touba';
update public.customers set location = 'Ramlat Zakher', updated_at = now()
where location is not null and lower(trim(location)) = lower('Ramlat Zakher') and location is distinct from 'Ramlat Zakher';
update public.visits set customer_location = 'Ramlat Zakher'
where customer_location is not null and lower(trim(customer_location)) = lower('Ramlat Zakher') and customer_location is distinct from 'Ramlat Zakher';
update public.customers set location = 'Shiab Al Ashkhar', updated_at = now()
where location is not null and lower(trim(location)) = lower('Shiab Al Ashkhar') and location is distinct from 'Shiab Al Ashkhar';
update public.visits set customer_location = 'Shiab Al Ashkhar'
where customer_location is not null and lower(trim(customer_location)) = lower('Shiab Al Ashkhar') and customer_location is distinct from 'Shiab Al Ashkhar';
update public.customers set location = 'Zakher', updated_at = now()
where location is not null and lower(trim(location)) = lower('Zakher') and location is distinct from 'Zakher';
update public.visits set customer_location = 'Zakher'
where customer_location is not null and lower(trim(customer_location)) = lower('Zakher') and customer_location is distinct from 'Zakher';
update public.customers set location = 'Al Faqa', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Faqa') and location is distinct from 'Al Faqa';
update public.visits set customer_location = 'Al Faqa'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Faqa') and customer_location is distinct from 'Al Faqa';
update public.customers set location = 'Al Hayer', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Hayer') and location is distinct from 'Al Hayer';
update public.visits set customer_location = 'Al Hayer'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Hayer') and customer_location is distinct from 'Al Hayer';
update public.customers set location = 'Al Wagan', updated_at = now()
where location is not null and lower(trim(location)) = lower('Al Wagan') and location is distinct from 'Al Wagan';
update public.visits set customer_location = 'Al Wagan'
where customer_location is not null and lower(trim(customer_location)) = lower('Al Wagan') and customer_location is distinct from 'Al Wagan';
update public.customers set location = 'Mezyad', updated_at = now()
where location is not null and lower(trim(location)) = lower('Mezyad') and location is distinct from 'Mezyad';
update public.visits set customer_location = 'Mezyad'
where customer_location is not null and lower(trim(customer_location)) = lower('Mezyad') and customer_location is distinct from 'Mezyad';
update public.customers set location = 'Nahel', updated_at = now()
where location is not null and lower(trim(location)) = lower('Nahel') and location is distinct from 'Nahel';
update public.visits set customer_location = 'Nahel'
where customer_location is not null and lower(trim(customer_location)) = lower('Nahel') and customer_location is distinct from 'Nahel';
update public.customers set location = 'Remah', updated_at = now()
where location is not null and lower(trim(location)) = lower('Remah') and location is distinct from 'Remah';
update public.visits set customer_location = 'Remah'
where customer_location is not null and lower(trim(customer_location)) = lower('Remah') and customer_location is distinct from 'Remah';
update public.customers set location = 'Sweihan', updated_at = now()
where location is not null and lower(trim(location)) = lower('Sweihan') and location is distinct from 'Sweihan';
update public.visits set customer_location = 'Sweihan'
where customer_location is not null and lower(trim(customer_location)) = lower('Sweihan') and customer_location is distinct from 'Sweihan';
update public.customers set location = 'Um Ghafa', updated_at = now()
where location is not null and lower(trim(location)) = lower('Um Ghafa') and location is distinct from 'Um Ghafa';
update public.visits set customer_location = 'Um Ghafa'
where customer_location is not null and lower(trim(customer_location)) = lower('Um Ghafa') and customer_location is distinct from 'Um Ghafa';

-- Clear non-area labels left on customers
update public.customers
set location = null, updated_at = now()
where location is not null and lower(trim(location)) in ('gift sender', 'gift purchase', 'gift receiver', 'no location', 'unknown');

update public.visits
set customer_location = null
where customer_location is not null and lower(trim(customer_location)) in ('gift sender', 'gift purchase', 'gift receiver', 'no location', 'unknown');

-- Backfill customer area from latest visit
update public.customers c
set location = sub.loc, updated_at = now()
from (
  select distinct on (v.customer_id)
    v.customer_id,
    v.customer_location as loc
  from public.visits v
  where v.customer_location is not null
    and trim(v.customer_location) <> ''
    and lower(trim(v.customer_location)) not in ('gift sender', 'gift purchase', 'gift receiver', 'no location', 'unknown')
  order by v.customer_id, v.visit_date desc, v.created_at desc
) sub
where c.id = sub.customer_id
  and (
    c.location is null
    or trim(c.location) = ''
    or lower(trim(c.location)) in ('gift sender', 'gift purchase', 'gift receiver', 'no location', 'unknown')
  );

commit;

select
  (select count(*) from public.customers where lower(trim(location)) in ('gift sender', 'gift purchase', 'gift receiver', 'no location', 'unknown')) as customers_non_area,
  (select count(*) from public.visits where lower(trim(customer_location)) in ('gift sender', 'gift purchase', 'gift receiver', 'no location', 'unknown')) as visits_non_area,
  (select count(distinct location) from public.customers where location is not null) as distinct_customer_areas;
