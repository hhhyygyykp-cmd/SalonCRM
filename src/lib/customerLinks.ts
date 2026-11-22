import { daysSince } from './format'
import type { Customer } from '../types'

export function publicCrmBase() {
  const fromEnv = (import.meta.env.VITE_WALLET_PUBLIC_BASE_URL as string | undefined)?.replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export function customerWalletLink(token?: string | null) {
  if (!token) return ''
  return `${publicCrmBase()}/w/${token}`
}

export function customerUpdateLink(token?: string | null) {
  if (!token) return `${publicCrmBase()}/update`
  return `${publicCrmBase()}/update/${token}`
}

export const PROFILE_UPDATE_WHATSAPP = `أهلاً {{customer_name}} 💚

كمّلي بياناتك مع Belle من هنا:
{{update_link}}`


export function needsProfileUpdate(customer: Pick<Customer, 'profileUpdatedAt'>) {
  return !customer.profileUpdatedAt
}

export function hasAddedWallet(customer: Pick<Customer, 'walletAppleSerial' | 'walletGoogleObjectId'>) {
  return Boolean(customer.walletAppleSerial || customer.walletGoogleObjectId)
}

export function walletAddedLabel(customer: Pick<Customer, 'walletAppleSerial' | 'walletGoogleObjectId'>) {
  const apple = Boolean(customer.walletAppleSerial)
  const google = Boolean(customer.walletGoogleObjectId)
  if (apple && google) return 'Apple & Google'
  if (apple) return 'Apple Wallet'
  if (google) return 'Google Wallet'
  return 'Not yet'
}

export function fillCustomerPlaceholders(
  body: string,
  customer: Pick<Customer, 'fullName' | 'loyaltyTier' | 'walletToken' | 'lastVisitAt' | 'location'>,
  salonName: string,
) {
  const days = daysSince(customer.lastVisitAt)
  return body
    .replaceAll('{{customer_name}}', customer.fullName)
    .replaceAll('{{salon_name}}', salonName)
    .replaceAll('{{loyalty_tier}}', customer.loyaltyTier)
    .replaceAll('{{location}}', customer.location || '')
    .replaceAll('{{days_since_visit}}', days != null ? String(days) : '')
    .replaceAll('{{wallet_link}}', customerWalletLink(customer.walletToken))
    .replaceAll('{{update_link}}', customerUpdateLink(customer.walletToken))
}
