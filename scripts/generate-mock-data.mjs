import XLSX from 'xlsx'
import fs from 'fs'

const path = 'C:/Users/97156_boe5y7m/Downloads/BELLE BEAUTY LOUNGE COSTUMER DETAILS.xlsx'
const wb = XLSX.readFile(path)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }).slice(1)

function normalizePhone(raw) {
  if (raw == null) return null
  let digits = String(raw).replace(/\D/g, '')
  if (digits.startsWith('9710') && digits.length >= 12) digits = '971' + digits.slice(4)
  if (digits.startsWith('05') && digits.length === 10) digits = '971' + digits.slice(1)
  if (digits.startsWith('5') && digits.length === 9) digits = '971' + digits
  if (!digits.startsWith('971')) digits = '971' + digits
  return '+' + digits
}

function cleanName(name) {
  return String(name ?? 'Guest').replace(/\s+/g, ' ').trim()
}

const now = new Date().toISOString()
const seenPhones = new Set()
const customers = []

rows.forEach((row) => {
  const phoneRaw = row[0]
  const nameRaw = row[1]
  const locationRaw = row[2]
  if (phoneRaw == null && !nameRaw) return

  const phone = normalizePhone(phoneRaw)
  if (!phone || phone.length < 12) return
  if (seenPhones.has(phone)) return
  seenPhones.add(phone)

  const fullName = cleanName(nameRaw)
  const location = cleanName(locationRaw || '')
  const id = `c${customers.length + 1}`

  customers.push({
    id,
    fullName,
    phone,
    whatsappPhone: phone,
    notes: location ? `Area: ${location}` : undefined,
    location: location || undefined,
    loyaltyTier: 'Regular',
    lifetimeSpend: 0,
    totalVisits: 0,
    lastServices: [],
    createdBy: 'u1',
    createdAt: now,
    updatedAt: now,
  })
})

const locations = [...new Set(customers.map((c) => c.location).filter(Boolean))].sort()

const file = `import type {
  Customer,
  LoyaltyTierConfig,
  SalonSettings,
  ServiceItem,
  StaffUser,
  Visit,
  WhatsAppMessage,
  WhatsAppTemplate,
} from '../types'

/** Belle Beauty Lounge — real customers from spreadsheet. Visits/spend start empty until recorded. */
export const salonSettings: SalonSettings = {
  salonName: 'Belle Beauty Lounge',
  phone: '+971 50 200 8228',
  whatsapp: '+971 50 200 8228',
  address: 'Al Ain, United Arab Emirates',
  currency: 'AED',
  timezone: 'Asia/Dubai',
  reminderDays: [30, 60, 90],
  automationEnabled: true,
}

/** Demo staff accounts for sign-in only (UI phase). */
export const staff: StaffUser[] = [
  { id: 'u1', name: 'Admin', email: 'admin@bellebeauty.ae', role: 'admin', status: 'active', phone: '+971502008228' },
  { id: 'u2', name: 'Staff', email: 'staff@bellebeauty.ae', role: 'staff', status: 'active', phone: '+971502008228' },
]

export const loyaltyTiers: LoyaltyTierConfig[] = [
  { id: 't1', name: 'Regular', minimumSpend: 0, maximumSpend: 1999, benefits: 'Standard booking priority', badgeStyle: 'regular' },
  { id: 't2', name: 'Gold', minimumSpend: 2000, maximumSpend: 4999, benefits: '5% seasonal discount, birthday treat', badgeStyle: 'gold' },
  { id: 't3', name: 'Premium', minimumSpend: 5000, maximumSpend: null, benefits: '10% discount, priority slots, complimentary drink', badgeStyle: 'premium' },
]

export const services: ServiceItem[] = [
  { id: 's1', name: 'Haircut', category: 'Hair', defaultPrice: 120, description: 'Wash, cut & style', active: true },
  { id: 's2', name: 'Blow Dry', category: 'Hair', defaultPrice: 90, active: true },
  { id: 's3', name: 'Hair Coloring', category: 'Hair', defaultPrice: 350, active: true },
  { id: 's4', name: 'Highlights', category: 'Hair', defaultPrice: 450, active: true },
  { id: 's5', name: 'Keratin', category: 'Treatment', defaultPrice: 800, active: true },
  { id: 's6', name: 'Hair Treatment', category: 'Treatment', defaultPrice: 150, active: true },
  { id: 's7', name: 'Manicure', category: 'Nails', defaultPrice: 100, active: true },
  { id: 's8', name: 'Pedicure', category: 'Nails', defaultPrice: 130, active: true },
  { id: 's9', name: 'Gel Nails', category: 'Nails', defaultPrice: 180, active: true },
  { id: 's10', name: 'Facial', category: 'Facial', defaultPrice: 250, active: true },
  { id: 's11', name: 'Makeup', category: 'Makeup', defaultPrice: 300, active: true },
  { id: 's12', name: 'Eyebrow Threading', category: 'Eyebrows', defaultPrice: 40, active: true },
  { id: 's13', name: 'Full Legs Waxing', category: 'Waxing', defaultPrice: 160, active: true },
  { id: 's14', name: 'Relaxation Massage', category: 'Massage', defaultPrice: 280, active: true },
  { id: 's15', name: 'Bridal Trial', category: 'Makeup', defaultPrice: 500, active: false },
]

export const customers: Customer[] = ${JSON.stringify(customers, null, 2)}

export const visits: Visit[] = []

export const whatsappTemplates: WhatsAppTemplate[] = [
  {
    id: 'wt1',
    name: '30-Day Reminder',
    whatsappTemplateName: 'reminder_30_day',
    language: 'en',
    category: 'MARKETING',
    triggerDays: 30,
    description: 'Win-back message after 30 days inactive',
    body: 'Hi {{customer_name}}, we miss you at {{salon_name}} 💕\\nIt has been a while since your last visit.\\nWe would love to welcome you back.',
    active: true,
  },
  {
    id: 'wt2',
    name: '60-Day Reminder',
    whatsappTemplateName: 'reminder_60_day',
    language: 'en',
    category: 'MARKETING',
    triggerDays: 60,
    description: 'Follow-up after 60 days inactive',
    body: "Hi {{customer_name}}, it's been {{days_since_visit}} days since your last visit to {{salon_name}}.\\nWe would love to see you again soon.",
    active: true,
  },
  {
    id: 'wt3',
    name: '90-Day Reminder',
    whatsappTemplateName: 'reminder_90_day',
    language: 'en',
    category: 'MARKETING',
    triggerDays: 90,
    description: 'Final retention nudge after 90 days',
    body: 'Hi {{customer_name}}, it has been {{days_since_visit}} days since we saw you at {{salon_name}}.\\nYour favourite chair is waiting for you.',
    active: true,
  },
  {
    id: 'wt4',
    name: 'Premium Customer Message',
    whatsappTemplateName: 'premium_thanks',
    language: 'en',
    category: 'UTILITY',
    description: 'Appreciation message for Premium clients',
    body: 'Hi {{customer_name}}, thank you for being one of our Premium customers. 💕\\nWe appreciate your continued support.',
    active: true,
  },
]

export const whatsappMessages: WhatsAppMessage[] = []

export const revenueByMonth: { month: string; revenue: number }[] = []
export const visitsByMonth: { month: string; visits: number }[] = []
export const newCustomersByMonth: { month: string; count: number }[] = []
export const popularServices: { name: string; count: number }[] = []

export const customerLocations = ${JSON.stringify(locations, null, 2)} as const

export function formatAED(amount: number) {
  return \`AED \${amount.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}\`
}

export function daysSince(date?: string) {
  if (!date) return null
  const ms = Date.now() - new Date(date).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function getStaffName(id: string) {
  return staff.find((s) => s.id === id)?.name ?? '—'
}

export function getCustomer(id: string) {
  return customers.find((c) => c.id === id)
}
`

fs.writeFileSync('src/data/mockData.ts', file)
console.log('Real customers:', customers.length)
console.log('Locations:', locations.length)
