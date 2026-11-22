import areaData from '../data/official-areas.json'

export const AL_AIN_CITY_AREAS = areaData.city as readonly string[]
export const AL_AIN_OUTLYING_AREAS = areaData.outlying as readonly string[]
export const OFFICIAL_AREAS = [...AL_AIN_CITY_AREAS, ...AL_AIN_OUTLYING_AREAS]

const AREA_ALIASES: Record<string, string> = areaData.aliases
const NON_AREA_VALUES = new Set(areaData.nonArea.map((v) => normalizeAreaKey(v)))

function normalizeAreaKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/['’]/g, "'")
}

/** Gift purchases are not customer areas — clear on import and in the CRM. */
export function isNonAreaLocation(value?: string | null) {
  if (!value?.trim()) return true
  return NON_AREA_VALUES.has(normalizeAreaKey(value))
}

export function canonicalArea(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const key = normalizeAreaKey(trimmed)
  if (NON_AREA_VALUES.has(key)) return ''
  const official = OFFICIAL_AREAS.find((area) => normalizeAreaKey(area) === key)
  if (official) return official
  return AREA_ALIASES[key] ?? trimmed
}

export function isOfficialArea(value: string) {
  const key = normalizeAreaKey(value)
  return OFFICIAL_AREAS.some((area) => normalizeAreaKey(area) === key)
}

/** Unified display label for customer/visit areas. */
export function formatCustomerArea(value?: string | null) {
  if (!value?.trim()) return undefined
  const canonical = canonicalArea(value)
  return canonical || undefined
}

/** Normalize a visit/customer area from spreadsheet text; undefined when not a real area. */
export function normalizeCustomerLocation(value?: string | null): string | undefined {
  return formatCustomerArea(value)
}

/** Pick first real area from slash-separated spreadsheet locations (e.g. "Al Salamat / Gift Sender"). */
export function pickCustomerLocation(lastLoc?: string | null, locationsSeen?: string | null) {
  const parts = String(locationsSeen || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
  if (lastLoc?.trim()) parts.unshift(lastLoc.trim())
  for (const part of parts) {
    const loc = normalizeCustomerLocation(part)
    if (loc) return loc
  }
  return normalizeCustomerLocation(lastLoc)
}
