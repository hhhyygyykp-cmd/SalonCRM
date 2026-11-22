import XLSX from 'xlsx'
import fs from 'fs'

const path = 'C:/Users/97156_boe5y7m/Downloads/BELLE BEAUTY LOUNGE COSTUMER DETAILS.xlsx'
const wb = XLSX.readFile(path)
const out = {}

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  out[name] = rows
  console.log('---', name, 'rows', rows.length)
  rows.slice(0, 50).forEach((r, i) => console.log(i + 1, JSON.stringify(r)))
}

fs.writeFileSync('scripts/customers-raw.json', JSON.stringify(out, null, 2))
console.log('Wrote scripts/customers-raw.json')
