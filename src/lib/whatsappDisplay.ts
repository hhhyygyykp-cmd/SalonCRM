/** Live 360dialog Coexistence number. Older 050 200 8228 / 050 980 1883 lines are retired. */
export const BUSINESS_WHATSAPP_DISPLAY = '0561404016'
export const BUSINESS_WHATSAPP_E164 = '+971561404016'

const RETIRED_DIGITS = new Set(['971502008228', '971509801883'])

function waDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `971${digits.slice(1)}`
  if (digits.length === 9 && digits.startsWith('5')) digits = `971${digits}`
  return digits
}

export function isDecorWhatsAppNumber(raw?: string | null): boolean {
  const d = waDigits(raw || '')
  return RETIRED_DIGITS.has(d) || d.endsWith('502008228') || d.endsWith('509801883')
}

export function displayBusinessWhatsApp(raw?: string | null): string {
  if (!raw || isDecorWhatsAppNumber(raw)) return BUSINESS_WHATSAPP_DISPLAY
  const digits = waDigits(raw)
  if (digits.startsWith('971') && digits.length >= 12) return `0${digits.slice(3)}`
  return String(raw).replace(/^\+971\s*/, '').replace(/^971/, '')
}
