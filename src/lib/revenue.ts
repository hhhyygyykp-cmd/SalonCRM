import type { CustomerMembership, Visit } from '../types'

export function ymdOf(value: string) {
  return String(value || '').slice(0, 10)
}

export function localYmd(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function monthStartYmd(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`
}

export function inYmdRange(ymd: string, from?: string, to?: string) {
  if (!ymd) return false
  if (from && ymd < from) return false
  if (to && ymd > to) return false
  return true
}

export function visitRevenue(visits: Visit[], from?: string, to?: string) {
  return visits
    .filter((v) => inYmdRange(ymdOf(v.visitDate), from, to))
    .reduce((sum, v) => sum + (Number(v.finalTotal) || 0), 0)
}

/** Full package price on purchase date. Gifted packages are paid on the sender visit, so skip them here. */
export function packageRevenue(memberships: CustomerMembership[], from?: string, to?: string) {
  return memberships
    .filter((m) => inYmdRange(ymdOf(m.purchaseDate), from, to))
    .filter((m) => !String(m.notes || '').startsWith('[gift]'))
    .reduce((sum, m) => sum + (Number(m.price) || 0), 0)
}

export function salonRevenue(visits: Visit[], memberships: CustomerMembership[], from?: string, to?: string) {
  return visitRevenue(visits, from, to) + packageRevenue(memberships, from, to)
}

export function customerPackageSpend(memberships: CustomerMembership[], customerId: string) {
  return memberships
    .filter((m) => m.customerId === customerId)
    .filter((m) => !String(m.notes || '').startsWith('[gift]'))
    .reduce((sum, m) => sum + (Number(m.price) || 0), 0)
}

export function customerLifetimeSpend(visits: Visit[], memberships: CustomerMembership[], customerId: string) {
  const visitSpend = visits
    .filter((v) => v.customerId === customerId)
    .reduce((sum, v) => sum + (Number(v.finalTotal) || 0), 0)
  return visitSpend + customerPackageSpend(memberships, customerId)
}

export function monthLabel(ymd: string) {
  return new Date(`${ymd}T00:00:00`).toLocaleString('en-GB', { month: 'short' })
}
