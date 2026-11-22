import type { Customer, LoyaltyRewardType, LoyaltyTier, LoyaltyTierConfig, ServiceItem, Visit } from '../types'
import { daysSince } from './format'

/** Lifetime spend bands (AED): Regular &lt; 1,500 · Gold 1,500–2,999 · Premium 3,000+ */
export const defaultLoyaltyTiers: LoyaltyTierConfig[] = [
  {
    id: 't1',
    name: 'Regular',
    minimumSpend: 0,
    maximumSpend: 1499,
    benefits: 'Standard booking · no loyalty gifts yet',
    badgeStyle: 'regular',
  },
  {
    id: 't2',
    name: 'Gold',
    minimumSpend: 1500,
    maximumSpend: 2999,
    benefits:
      '30% birthday discount · 1 free manicure & pedicure · after each extra AED 1,000: 1 free Classic Mani & Pedi · 5% discount for life · free gift services still pay delivery',
    badgeStyle: 'gold',
  },
  {
    id: 't3',
    name: 'Premium',
    minimumSpend: 3000,
    maximumSpend: null,
    benefits:
      'Any 1 service free every 30 days · 50% birthday discount · 5% discount for life · after each AED 1,000: 1 free manicure & pedicure (valid 30 days) · free gift services still pay delivery',
    badgeStyle: 'premium',
  },
]

export const LOYALTY_DELIVERY_NOTE =
  'Free gift / loyalty services: customer still pays delivery (AED 30 or 50). Delivery is never free with gift redemptions.'

export function calcLoyaltyTier(lifetimeSpend: number, tiers: LoyaltyTierConfig[] = defaultLoyaltyTiers): LoyaltyTier {
  const sorted = [...tiers].sort((a, b) => b.minimumSpend - a.minimumSpend)
  for (const t of sorted) {
    if (lifetimeSpend >= t.minimumSpend) return t.name
  }
  return 'Regular'
}

/** Completed AED 1,000 lifetime-spend bands (0–999 → 0, 1,000–1,999 → 1, …). */
export function thousandSpendBands(lifetimeSpend: number): number {
  return Math.floor(Math.max(0, lifetimeSpend) / 1000)
}

/**
 * Gold/Premium crossed another AED 1,000 of lifetime spend (2,000, 3,000, 4,000, …).
 * Regular at AED 1,000 does not qualify. Reaching Gold at 1,500 uses the Gold upgrade message instead.
 */
export function earnedNewThousandReward(
  previousSpend: number,
  nextSpend: number,
  tier: LoyaltyTier,
): boolean {
  if (tier !== 'Gold' && tier !== 'Premium') return false
  const nextBands = thousandSpendBands(nextSpend)
  return nextBands > thousandSpendBands(previousSpend) && nextBands >= 2
}

/** Free Classic Mani & Pedi earned from AED 1,000 spend bands (Gold from 2,000, Premium from 3,000). */
export function premiumThousandRewardsEarned(lifetimeSpend: number): number {
  if (lifetimeSpend < 2000) return 0
  if (lifetimeSpend < 3000) return Math.max(0, thousandSpendBands(lifetimeSpend) - 1)
  return thousandSpendBands(lifetimeSpend)
}

export function getTierConfig(tier: LoyaltyTier, tiers: LoyaltyTierConfig[] = defaultLoyaltyTiers): LoyaltyTierConfig {
  return tiers.find((t) => t.name === tier) ?? tiers[0]
}

export function findClassicManiPedi(services: Pick<ServiceItem, 'id' | 'name'>[]) {
  return (
    services.find((s) => s.id === 's1') ||
    services.find((s) => /classic/i.test(s.name) && /mani/i.test(s.name) && /pedi/i.test(s.name))
  )
}

export type LoyaltyRewardOption = {
  type: LoyaltyRewardType
  label: string
  detail: string
  locksToManiPedi: boolean
}

export function loyaltyRewardLabel(type?: LoyaltyRewardType) {
  if (type === 'gold_mani_pedi') return 'Gold: free Classic Mani & Pedi'
  if (type === 'premium_monthly_service') return 'Premium: any 1 service free'
  if (type === 'premium_thousand_mani_pedi') return 'AED 1,000 spend: free Classic Mani & Pedi'
  return ''
}

export function nextTierProgress(spend: number, tier: LoyaltyTier) {
  const sorted = [...defaultLoyaltyTiers].sort((a, b) => a.minimumSpend - b.minimumSpend)
  const current = getTierConfig(tier, sorted)
  const next = sorted.find((t) => t.minimumSpend > current.minimumSpend)
  if (!next) {
    return {
      nextName: null as string | null,
      remaining: 0,
      progress: 1,
      floor: current.minimumSpend,
      ceiling: Math.max(spend, current.minimumSpend + 1000),
    }
  }
  const floor = current.minimumSpend
  const ceiling = next.minimumSpend
  const progress = Math.min(1, Math.max(0, (spend - floor) / (ceiling - floor)))
  return {
    nextName: next.name as LoyaltyTier,
    remaining: Math.max(0, ceiling - spend),
    progress,
    floor,
    ceiling,
  }
}

export function nextSpendReward(spend: number, tier: LoyaltyTier) {
  const toNextTier = nextTierProgress(spend, tier)
  if (toNextTier.nextName) {
    return {
      amountToGo: toNextTier.remaining,
      progress: toNextTier.progress,
      headline: `${formatAedWhole(toNextTier.remaining)} to go`,
      explanation: `Keep visiting Belle to reach ${toNextTier.nextName} at ${formatAedWhole(toNextTier.ceiling)} lifetime spend.`,
    }
  }
  const nextThousand = (Math.floor(Math.max(0, spend) / 1000) + 1) * 1000
  const remaining = Math.max(0, nextThousand - spend)
  return {
    amountToGo: remaining,
    progress: remaining === 0 ? 1 : (1000 - remaining) / 1000,
    headline: remaining === 0 ? 'Reward ready' : `${formatAedWhole(remaining)} to go`,
    explanation: 'A free Classic Mani & Pedi after each extra AED 1,000 spent.',
  }
}

function formatAedWhole(amount: number) {
  return `AED ${Math.round(amount).toLocaleString('en-AE')}`
}

export function customerPerkLines(tier: LoyaltyTier): string[] {
  if (tier === 'Gold') {
    return [
      '5% off every visit',
      '30% off on your birthday',
      '1 free Classic Mani & Pedi',
      'Free Classic Mani & Pedi after each extra AED 1,000',
    ]
  }
  if (tier === 'Premium') {
    return [
      '5% off every visit',
      '50% off on your birthday',
      '1 free service every 30 days',
      'Free Classic Mani & Pedi after each AED 1,000',
    ]
  }
  return ['Collect spend toward Gold', 'Gold starts at AED 1,500 lifetime spend']
}

export function availableLoyaltyRewardsFromHistory(
  loyaltyTier: LoyaltyTier,
  lifetimeSpend: number,
  redemptions: { type: LoyaltyRewardType; visitDate: string }[],
  waitDays = 30,
): LoyaltyRewardOption[] {
  const used = (type: LoyaltyRewardType) => redemptions.filter((r) => r.type === type)
  const rewards: LoyaltyRewardOption[] = []

  if (loyaltyTier === 'Gold' && used('gold_mani_pedi').length === 0) {
    rewards.push({
      type: 'gold_mani_pedi',
      label: 'Free Classic Mani & Pedi',
      detail: 'Your one-time Gold gift — ask staff to redeem it',
      locksToManiPedi: true,
    })
  }

  if (loyaltyTier === 'Premium') {
    const lastMonthly = used('premium_monthly_service').sort(
      (a, b) => +new Date(b.visitDate) - +new Date(a.visitDate),
    )[0]
    const elapsed = lastMonthly ? daysSince(lastMonthly.visitDate) : null
    if (elapsed == null || elapsed >= waitDays) {
      rewards.push({
        type: 'premium_monthly_service',
        label: 'Any 1 service free',
        detail: 'Your Premium monthly gift — ask staff to redeem it',
        locksToManiPedi: false,
      })
    }
  }

  if (loyaltyTier === 'Gold' || loyaltyTier === 'Premium') {
    const remaining = Math.max(
      0,
      premiumThousandRewardsEarned(lifetimeSpend) - used('premium_thousand_mani_pedi').length,
    )
    if (remaining > 0) {
      rewards.push({
        type: 'premium_thousand_mani_pedi',
        label: remaining === 1 ? 'AED 1,000 spend reward' : `AED 1,000 spend reward × ${remaining}`,
        detail: 'Earned after each extra AED 1,000 — ask staff to redeem it',
        locksToManiPedi: true,
      })
    }
  }

  return rewards
}

export function availableLoyaltyRewards(
  customer: Customer,
  visits: Visit[],
  waitDays = 30,
): LoyaltyRewardOption[] {
  const mine = visits.filter((v) => v.customerId === customer.id && v.loyaltyRewardType)
  const used = (type: LoyaltyRewardType) => mine.filter((v) => v.loyaltyRewardType === type)
  const rewards: LoyaltyRewardOption[] = []

  if (customer.loyaltyTier === 'Gold' && used('gold_mani_pedi').length === 0) {
    rewards.push({
      type: 'gold_mani_pedi',
      label: 'Gold: free Classic Mani & Pedi',
      detail: 'One-time Gold reward',
      locksToManiPedi: true,
    })
  }

  if (customer.loyaltyTier === 'Premium') {
    const lastMonthly = used('premium_monthly_service').sort(
      (a, b) => +new Date(b.visitDate) - +new Date(a.visitDate),
    )[0]
    const elapsed = lastMonthly ? daysSince(lastMonthly.visitDate) : null
    if (elapsed == null || elapsed >= waitDays) {
      rewards.push({
        type: 'premium_monthly_service',
        label: 'Premium: any 1 service free',
        detail: 'Once every 30 days',
        locksToManiPedi: false,
      })
    }
  }

  if (customer.loyaltyTier === 'Gold' || customer.loyaltyTier === 'Premium') {
    const remaining = Math.max(
      0,
      premiumThousandRewardsEarned(customer.lifetimeSpend) - used('premium_thousand_mani_pedi').length,
    )
    if (remaining > 0) {
      rewards.push({
        type: 'premium_thousand_mani_pedi',
        label: `${customer.loyaltyTier}: AED 1,000 spend reward (${remaining} left)`,
        detail: 'Earned after each extra AED 1,000 · redeem within 30 days',
        locksToManiPedi: true,
      })
    }
  }

  return rewards
}

export function premiumMonthlyCooldownDays(customerId: string, visits: Visit[], waitDays = 30) {
  const last = visits
    .filter((v) => v.customerId === customerId && v.loyaltyRewardType === 'premium_monthly_service')
    .sort((a, b) => +new Date(b.visitDate) - +new Date(a.visitDate))[0]
  if (!last) return 0
  const elapsed = daysSince(last.visitDate)
  if (elapsed == null) return 0
  return Math.max(0, waitDays - elapsed)
}
