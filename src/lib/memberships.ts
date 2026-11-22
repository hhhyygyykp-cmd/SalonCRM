import type { CycleStatus, CustomerMembership, MembershipCycle, MembershipProduct } from '../types'

export const MEMBERSHIP_PRODUCTS: MembershipProduct[] = [
  {
    id: 'pkg_nail_annual',
    name: 'Annual Nail Subscription',
    price: 1500,
    validityMonths: 12,
    model: 'monthly_cycle',
    totalSessions: 12,
    serviceName: 'Classic Mani & Pedi',
  },
  {
    id: 'pkg_organic_hair',
    name: 'Organic Hair Treatment',
    price: 420,
    validityMonths: 4,
    model: 'session_balance',
    totalSessions: 5,
    serviceName: 'Organic Hair Treatment',
  },
  {
    id: 'pkg_loreal_hair',
    name: "L'Oreal Professional Hair Treatment",
    price: 850,
    validityMonths: 4,
    model: 'session_balance',
    totalSessions: 5,
    serviceName: "L'Oreal Professional Hair Treatment",
  },
  {
    id: 'pkg_massage',
    name: 'Massage Package',
    price: 800,
    validityMonths: 6,
    model: 'session_balance',
    totalSessions: 5,
    serviceName: 'Massage',
  },
]

export const PACKAGE_SERVICE_CATEGORY = 'Packages'

export function getMembershipProduct(id: string) {
  return MEMBERSHIP_PRODUCTS.find((p) => p.id === id)
}

export function isMembershipPackageService(serviceId: string) {
  return Boolean(getMembershipProduct(serviceId))
}

export function membershipPackageServices(): Array<{
  id: string
  name: string
  category: string
  defaultPrice: number
  description: string
  active: boolean
}> {
  return MEMBERSHIP_PRODUCTS.map((p) => ({
    id: p.id,
    name: p.name,
    category: PACKAGE_SERVICE_CATEGORY,
    defaultPrice: p.price,
    description:
      p.model === 'monthly_cycle'
        ? `${p.validityMonths} months · ${p.serviceName}`
        : `${p.totalSessions} sessions / ${p.validityMonths} months · ${p.serviceName}`,
    active: true,
  }))
}

export function todayYmd(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function ymdToUtc(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

export function addMonthsYmd(ymd: string, months: number) {
  const dt = ymdToUtc(ymd)
  dt.setUTCMonth(dt.getUTCMonth() + months)
  return dt.toISOString().slice(0, 10)
}

export function addDaysYmd(ymd: string, days: number) {
  const dt = ymdToUtc(ymd)
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function formatDay(ymd?: string) {
  if (!ymd) return '—'
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function buildMonthlyCycles(activationDate: string, membershipId: string, count = 12): Omit<MembershipCycle, 'id'>[] {
  return Array.from({ length: count }, (_, i) => {
    const startDate = addMonthsYmd(activationDate, i)
    const endDate = addDaysYmd(addMonthsYmd(activationDate, i + 1), -1)
    return {
      membershipId,
      cycleIndex: i + 1,
      startDate,
      endDate,
      status: 'Upcoming' as CycleStatus,
    }
  })
}

export function expiryFromActivation(activationDate: string, validityMonths: number) {
  return addDaysYmd(addMonthsYmd(activationDate, validityMonths), -1)
}

export function refreshCycleStatuses(cycles: MembershipCycle[], today = todayYmd()): MembershipCycle[] {
  return cycles.map((cycle) => {
    if (cycle.status === 'Used') return cycle
    if (today > cycle.endDate) return { ...cycle, status: 'Expired' }
    if (today >= cycle.startDate && today <= cycle.endDate) return { ...cycle, status: 'Available' }
    if (today < cycle.startDate) return { ...cycle, status: 'Upcoming' }
    return cycle
  })
}

export function deriveMembershipStatus(membership: CustomerMembership, today = todayYmd()) {
  if (membership.status === 'Frozen') return 'Frozen' as const
  if (!membership.activationDate) return 'Pending' as const

  if (membership.model === 'session_balance') {
    if (membership.usedSessions >= membership.totalSessions) return 'Completed' as const
    if (membership.expiryDate && today > membership.expiryDate) return 'Expired' as const
    return 'Active' as const
  }

  const cycles = refreshCycleStatuses(membership.cycles, today)
  const allUsed = cycles.length > 0 && cycles.every((c) => c.status === 'Used')
  if (allUsed) return 'Completed' as const
  if (membership.expiryDate && today > membership.expiryDate) return 'Expired' as const
  return 'Active' as const
}

export function currentUsableCycle(membership: CustomerMembership, today = todayYmd()) {
  return refreshCycleStatuses(membership.cycles, today).find((c) => c.status === 'Available')
}

export function remainingSessions(membership: CustomerMembership) {
  if (membership.model === 'session_balance') {
    return Math.max(0, membership.totalSessions - membership.usedSessions)
  }
  return refreshCycleStatuses(membership.cycles).filter((c) => c.status === 'Available' || c.status === 'Upcoming').length
}

export function canRecordUsage(membership: CustomerMembership, today = todayYmd()) {
  const status = deriveMembershipStatus(membership, today)
  if (status !== 'Active') return false
  if (membership.model === 'session_balance') {
    return remainingSessions(membership) > 0 && (!membership.expiryDate || today <= membership.expiryDate)
  }
  return Boolean(currentUsableCycle(membership, today))
}

export function canDeleteMembership(membership: CustomerMembership) {
  if (membership.usedSessions > 0) return false
  if (membership.usages.length > 0) return false
  if (membership.cycles.some((c) => c.status === 'Used' || c.usedAt)) return false
  return true
}

export function membershipBalanceLabel(membership: CustomerMembership) {
  if (membership.model === 'monthly_cycle') {
    const cycle = currentUsableCycle(membership)
    if (cycle) return `Month ${cycle.cycleIndex}: Available`
    const status = deriveMembershipStatus(membership)
    if (status === 'Completed') return 'All 12 months used'
    if (status === 'Expired') return 'Expired — unused months do not carry forward'
    if (status === 'Pending') return 'Not activated'
    if (status === 'Frozen') return 'Frozen'
    return 'No session available this month'
  }
  return `${remainingSessions(membership)} of ${membership.totalSessions} remaining`
}

export function withLiveMembership(membership: CustomerMembership): CustomerMembership {
  const cycles = refreshCycleStatuses(membership.cycles)
  return {
    ...membership,
    cycles,
    status: deriveMembershipStatus({ ...membership, cycles }),
  }
}
