export function phoneDigits(phone: string) {
  return phone.replace(/\D/g, '')
}

/** Meta / WhatsApp digits: 9715XXXXXXXX */
export function toWhatsAppDigits(raw: string) {
  let digits = phoneDigits(raw)
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('971')) return digits
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 9 && digits.startsWith('5')) return `971${digits}`
  if (digits.length >= 8 && digits.length <= 10) return `971${digits}`
  return digits
}

export function toStoredPhone(raw: string) {
  const digits = toWhatsAppDigits(raw)
  if (!digits) return raw.trim()
  return `+${digits}`
}

export function phoneKey(phone: string) {
  return toWhatsAppDigits(phone).slice(-9)
}

export function phonesMatch(a: string, b: string) {
  const ka = phoneKey(a)
  const kb = phoneKey(b)
  return Boolean(ka && kb && ka.length >= 8 && ka === kb)
}

/** Local UAE display — 05XXXXXXXX, never +971 */
export function formatLocalPhone(phone: string) {
  const raw = phone.trim()
  if (!raw) return ''
  let digits = phoneDigits(raw)
  if (!digits) return raw
  if (digits.startsWith('00971')) digits = digits.slice(2)
  if (digits.startsWith('971')) digits = digits.slice(3)
  if (digits.startsWith('0')) return digits
  if (digits.length >= 8 && digits.length <= 9) return `0${digits}`
  return digits
}

export const PHONE_PLACEHOLDER = '05XXXXXXXX'
