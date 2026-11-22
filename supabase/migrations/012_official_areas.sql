-- Clear old free-text areas for customers who have never visited.
-- Customers with at least one visit keep their stored area unchanged.

update public.customers c
set location = null, updated_at = now()
where not exists (select 1 from public.visits v where v.customer_id = c.id)
  and c.location is not null
  and lower(trim(c.location)) not in (
    'al agabiyya',
    'al ain central district',
    'al ain industrial area',
    'al ameriya',
    'al bateen',
    'al dahir',
    'al foah',
    'al grayyeh',
    'al hili',
    'al jahili',
    'al jimi',
    'al khabisi',
    'al khalidiya',
    'al khrair',
    'al kuwaitat',
    'al maqam',
    'al markhaniya',
    'al masoudi',
    'al mraijeb',
    'al muwaiji',
    'al mutaredh',
    'al mutawa''a',
    'al nayadat',
    'al qattara',
    'al ruwaikah',
    'al salamat',
    'al sarooj',
    'al shuaibah',
    'al towayya',
    'al yahar',
    'asharej',
    'falaj hazza',
    'ne''mah',
    'oud al touba',
    'ramlat zakher',
    'shiab al ashkhar',
    'zakher',
    'al faqa',
    'al hayer',
    'al wagan',
    'mezyad',
    'nahel',
    'remah',
    'sweihan',
    'um ghafa'
  );
