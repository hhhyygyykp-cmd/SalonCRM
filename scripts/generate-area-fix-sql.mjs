import fs from 'fs'
import path from 'path'

const data = JSON.parse(fs.readFileSync(path.resolve('src/data/official-areas.json'), 'utf8'))
const official = [...data.city, ...data.outlying]

function escSql(s) {
  return s.replace(/'/g, "''")
}

let sql = `-- Unify customer + visit location spellings to official Belle area list
-- Generated ${new Date().toISOString()}
-- Safe to re-run.

begin;

create temporary table _area_aliases (
  raw text primary key,
  canonical text
) on commit drop;

insert into _area_aliases (raw, canonical) values\n`

const aliasRows = []
for (const raw of data.nonArea) {
  aliasRows.push(`  ('${escSql(raw.toLowerCase())}', null)`)
}
for (const [raw, canonical] of Object.entries(data.aliases)) {
  aliasRows.push(`  ('${escSql(raw.toLowerCase())}', '${escSql(canonical)}')`)
}
sql += aliasRows.join(',\n') + ';\n\n'

sql += `-- Legacy alias spellings\n`
sql += `update public.customers c
set location = a.canonical, updated_at = now()
from _area_aliases a
where c.location is not null and lower(trim(c.location)) = a.raw;\n\n`

sql += `update public.visits v
set customer_location = a.canonical
from _area_aliases a
where v.customer_location is not null and lower(trim(v.customer_location)) = a.raw;\n\n`

sql += `-- Official list casing (e.g. al salamat → Al Salamat)\n`
for (const name of official) {
  sql += `update public.customers set location = '${escSql(name)}', updated_at = now()
where location is not null and lower(trim(location)) = lower('${escSql(name)}') and location is distinct from '${escSql(name)}';\n`
  sql += `update public.visits set customer_location = '${escSql(name)}'
where customer_location is not null and lower(trim(customer_location)) = lower('${escSql(name)}') and customer_location is distinct from '${escSql(name)}';\n`
}

sql += `\n-- Clear non-area labels left on customers\n`
sql += `update public.customers
set location = null, updated_at = now()
where location is not null and lower(trim(location)) in (${data.nonArea.map((v) => `'${escSql(v.toLowerCase())}'`).join(', ')});\n\n`

sql += `update public.visits
set customer_location = null
where customer_location is not null and lower(trim(customer_location)) in (${data.nonArea.map((v) => `'${escSql(v.toLowerCase())}'`).join(', ')});\n\n`

sql += `-- Backfill customer area from latest visit\n`
sql += `update public.customers c
set location = sub.loc, updated_at = now()
from (
  select distinct on (v.customer_id)
    v.customer_id,
    v.customer_location as loc
  from public.visits v
  where v.customer_location is not null
    and trim(v.customer_location) <> ''
    and lower(trim(v.customer_location)) not in (${data.nonArea.map((v) => `'${escSql(v.toLowerCase())}'`).join(', ')})
  order by v.customer_id, v.visit_date desc, v.created_at desc
) sub
where c.id = sub.customer_id
  and (
    c.location is null
    or trim(c.location) = ''
    or lower(trim(c.location)) in (${data.nonArea.map((v) => `'${escSql(v.toLowerCase())}'`).join(', ')})
  );\n\n`

sql += `commit;\n\n`
sql += `select
  (select count(*) from public.customers where lower(trim(location)) in (${data.nonArea.map((v) => `'${escSql(v.toLowerCase())}'`).join(', ')})) as customers_non_area,
  (select count(*) from public.visits where lower(trim(customer_location)) in (${data.nonArea.map((v) => `'${escSql(v.toLowerCase())}'`).join(', ')})) as visits_non_area,
  (select count(distinct location) from public.customers where location is not null) as distinct_customer_areas;\n`

const outMigration = path.resolve('supabase/migrations/027_normalize_imported_areas.sql')
const outScript = path.resolve('scripts/fix-imported-areas.sql')
fs.writeFileSync(outMigration, sql)
fs.writeFileSync(outScript, sql)
console.log(`Wrote ${outMigration}`)
console.log(`Wrote ${outScript}`)
