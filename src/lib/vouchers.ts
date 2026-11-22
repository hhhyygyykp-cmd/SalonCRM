import type { Voucher } from '../types'

export function calcVoucherDiscount(
  voucher: Voucher | undefined,
  subtotal: number,
  opts?: { ignoreUsage?: boolean; ignoreActive?: boolean },
) {
  if (!voucher) return 0
  if (!opts?.ignoreActive && !voucher.active) return 0
  if (voucher.minSpend && subtotal < voucher.minSpend) return 0
  if (!opts?.ignoreUsage && voucher.maxUses != null && voucher.usedCount >= voucher.maxUses) return 0
  if (voucher.expiresAt) {
    const end = new Date(voucher.expiresAt)
    end.setHours(23, 59, 59, 999)
    if (Date.now() > end.getTime()) return 0
  }
  if (voucher.type === 'percent') {
    return Math.min(subtotal, Math.round((subtotal * voucher.value) / 100))
  }
  return Math.min(subtotal, voucher.value)
}

export function voucherStatus(voucher: Voucher) {
  if (!voucher.active) return 'disabled'
  if (voucher.maxUses != null && voucher.usedCount >= voucher.maxUses) return 'used up'
  if (voucher.expiresAt) {
    const end = new Date(voucher.expiresAt)
    end.setHours(23, 59, 59, 999)
    if (Date.now() > end.getTime()) return 'expired'
  }
  return 'active'
}
