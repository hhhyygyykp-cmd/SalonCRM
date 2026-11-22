import type { ServiceItem } from '../types'

export const SERVICE_CATEGORY_ORDER = [
  'Packages',
  'Nails — Classic',
  'Nails — Gel',
  'Nails — Extension',
  'Hair — Blowdry',
  'Hair — Wavy',
  'Hair — Style',
  'Hair — Cuts',
  'Hair Treatment',
  'Wax',
  'Halawa',
  'Massage',
  'Face',
  'Little Princess',
  'Add-ons',
  'Nails — Packages',
  'Other',
]

export function orderedServiceCategories(services: Pick<ServiceItem, 'category'>[]) {
  const present = [...new Set(services.map((s) => s.category).filter(Boolean))]
  const ranked = SERVICE_CATEGORY_ORDER.filter((c) => present.includes(c))
  const extra = present.filter((c) => !SERVICE_CATEGORY_ORDER.includes(c)).sort((a, b) => a.localeCompare(b))
  return [...ranked, ...extra]
}

export function servicesInCategory(services: ServiceItem[], category: string) {
  return services.filter((s) => s.category === category)
}
