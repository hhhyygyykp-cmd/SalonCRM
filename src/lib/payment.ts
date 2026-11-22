import { PAYMENT_METHODS, type PaymentMethod } from '../types'

export function parsePaymentMethods(value?: string | null): PaymentMethod[] {
  if (!value?.trim()) return []
  const parts = value
    .split(/\s*[+,/&]\s*|\s+and\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
  return PAYMENT_METHODS.filter((method) =>
    parts.some((part) => part.toLowerCase() === method.toLowerCase()),
  )
}

export function formatPaymentMethods(methods: PaymentMethod[]): string {
  return PAYMENT_METHODS.filter((method) => methods.includes(method)).join(' + ')
}

export function togglePaymentMethod(current: PaymentMethod[], method: PaymentMethod): PaymentMethod[] {
  const next = current.includes(method) ? current.filter((item) => item !== method) : [...current, method]
  return PAYMENT_METHODS.filter((item) => next.includes(item))
}
