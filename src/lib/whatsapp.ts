const WINDOW_MS = 24 * 60 * 60 * 1000

/** True when the customer messaged the business WhatsApp within the last 24 hours. */
export function isWhatsAppWindowOpen(lastInboundAt?: string | null): boolean {
  if (!lastInboundAt) return false
  const t = Date.parse(lastInboundAt)
  if (Number.isNaN(t)) return false
  return Date.now() - t < WINDOW_MS
}

export function whatsappWindowLabel(lastInboundAt?: string | null): string {
  return isWhatsAppWindowOpen(lastInboundAt) ? 'Open 24h window' : 'Needs template'
}

export function whatsappWindowRemaining(lastInboundAt?: string | null): string | null {
  if (!isWhatsAppWindowOpen(lastInboundAt)) return null
  const t = Date.parse(lastInboundAt!)
  const left = WINDOW_MS - (Date.now() - t)
  const hours = Math.floor(left / (60 * 60 * 1000))
  const minutes = Math.floor((left % (60 * 60 * 1000)) / (60 * 1000))
  if (hours > 0) return `${hours}h ${minutes}m left to reply with free text`
  return `${minutes}m left to reply with free text`
}
