import { NO_PARAM_WHATSAPP_TEMPLATES } from '../data/whatsappCatalog'
import { daysSince } from './format'
import type { Customer, WhatsAppTemplate } from '../types'

export { NO_PARAM_WHATSAPP_TEMPLATES }

const WALLET_BUTTON_TEMPLATES = new Set(['my_belle_card_ready', 'service_feedback_wallet'])

export type WhatsAppSendContext = {
  customer: Pick<Customer, 'fullName' | 'loyaltyTier' | 'walletToken' | 'lastVisitAt'>
  salonName: string
  walletLink: string
  ownerName?: string
  staffName?: string
  documentType?: string
  expiryDate?: string
  daysRemaining?: string
  /** Booking templates: {{1}} service, {{2}} date, {{3}} time, {{4}} amount */
  serviceName?: string
  bookingDate?: string
  bookingTime?: string
  bookingAmount?: string
  /** Dynamic URL button suffix (payment / booking links) */
  buttonUrl?: string
  /** Approved template body, used to detect templates with no parameters. */
  templateBody?: string
}

function bodyParams(texts: string[]) {
  return [
    {
      type: 'body' as const,
      parameters: texts.map((text) => ({ type: 'text' as const, text: text || '—' })),
    },
  ]
}

function urlButton(index: string, urlSuffix: string) {
  return {
    type: 'button' as const,
    sub_type: 'url' as const,
    index,
    parameters: [{ type: 'text' as const, text: urlSuffix }],
  }
}

/** Build Meta template body (and optional dynamic URL button) parameters. */
export function buildTemplateComponents(
  metaName: string | undefined,
  ctx: WhatsAppSendContext,
): Array<Record<string, unknown>> | undefined {
  if (!metaName || NO_PARAM_WHATSAPP_TEMPLATES.has(metaName)) {
    return undefined
  }
  if (WALLET_BUTTON_TEMPLATES.has(metaName)) {
    return ctx.customer.walletToken ? [urlButton('0', ctx.customer.walletToken)] : undefined
  }
  if (ctx.templateBody && !/\{\{\d+\}\}/.test(ctx.templateBody)) {
    return undefined
  }

  const firstName = ctx.customer.fullName.trim().split(/\s+/)[0] || ctx.customer.fullName
  const salon = ctx.salonName || 'Belle Beauty Lounge'
  const days = String(daysSince(ctx.customer.lastVisitAt) ?? 0)

  if (metaName === 'booking_payment_request') {
    const comps: Array<Record<string, unknown>> = bodyParams([
      ctx.serviceName || 'خدمة Belle',
      ctx.bookingDate || '—',
      ctx.bookingTime || '—',
      ctx.bookingAmount || '—',
    ])
    if (ctx.buttonUrl) comps.push(urlButton('0', ctx.buttonUrl))
    return comps
  }
  if (metaName === 'booking_confirmed') {
    return bodyParams([ctx.serviceName || 'خدمة Belle', ctx.bookingDate || '—', ctx.bookingTime || '—'])
  }
  if (metaName === 'appointment_reminder_one_hour') {
    return bodyParams([ctx.serviceName || 'خدمة Belle', ctx.bookingTime || '—'])
  }

  let texts: string[] = []
  switch (metaName) {
    case 'post_visit_thanks':
      texts = [salon, firstName, ctx.customer.loyaltyTier || 'Regular', ctx.walletLink || salon]
      break
    case 'visit_thanks':
      texts = [salon, firstName, ctx.customer.loyaltyTier || 'Regular']
      break
    case 'reminder_30_day':
      texts = [firstName, salon]
      break
    case 'reminder_60_day':
    case 'reminder_90_day':
      texts = [firstName, days, salon]
      break
    default: {
      const count = [...(ctx.templateBody || '').matchAll(/\{\{(\d+)\}\}/g)].reduce(
        (highest, match) => Math.max(highest, Number(match[1] || 0)),
        0,
      )
      const genericValues = [firstName, salon, days]
      texts = Array.from({ length: count }, (_, index) => genericValues[index] || '—')
      break
    }
  }

  return texts.length ? bodyParams(texts) : undefined
}

export function templateLanguage(tpl?: Pick<WhatsAppTemplate, 'language'> | null): string {
  const lang = (tpl?.language || 'ar').trim()
  return lang || 'ar'
}
