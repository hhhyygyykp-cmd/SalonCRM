import fs from 'fs'

const text = fs.readFileSync('src/data/mockData.ts', 'utf8')
const svcMatch = text.match(/export const services: ServiceItem\[\] = (\[[\s\S]*?\])\s*\n\s*\nexport const customers/)
const custMatch = text.match(/export const customers: Customer\[\] = (\[[\s\S]*?\])\s*\n\s*\nexport const visits/)
if (!svcMatch || !custMatch) {
  console.error('parse fail', !!svcMatch, !!custMatch)
  process.exit(1)
}

const services = eval(svcMatch[1])
const customers = eval(custMatch[1])

function esc(s) {
  return String(s ?? '').replace(/'/g, "''")
}

let sql = '-- Auto-generated seed: services + customers\n'

for (const s of services) {
  const desc = s.description ? `'${esc(s.description)}'` : 'null'
  sql += `insert into public.services (id,name,category,default_price,description,active) values ('${esc(s.id)}','${esc(s.name)}','${esc(s.category)}',${s.defaultPrice},${desc},${s.active}) on conflict (id) do nothing;\n`
}

sql += '\n'

for (const c of customers) {
  const arr = '{' + (c.lastServices || []).map((x) => `"${esc(x)}"`).join(',') + '}'
  const email = c.email ? `'${esc(c.email)}'` : 'null'
  const notes = c.notes ? `'${esc(c.notes)}'` : 'null'
  const location = c.location ? `'${esc(c.location)}'` : 'null'
  sql += `insert into public.customers (id,full_name,phone,whatsapp_phone,email,notes,location,loyalty_tier,lifetime_spend,total_visits,last_services,created_at,updated_at) values ('${esc(c.id)}','${esc(c.fullName)}','${esc(c.phone)}','${esc(c.whatsappPhone)}',${email},${notes},${location},'${esc(c.loyaltyTier)}',${c.lifetimeSpend},${c.totalVisits},'${arr}','${esc(c.createdAt)}','${esc(c.updatedAt)}') on conflict (id) do nothing;\n`
}

fs.mkdirSync('supabase/migrations', { recursive: true })
fs.writeFileSync('supabase/migrations/002_seed_services_customers.sql', sql)
console.log(`Wrote services=${services.length} customers=${customers.length}`)
