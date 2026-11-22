import { useEffect, useId, useState } from 'react'
import { customerPerkLines, nextSpendReward, type LoyaltyRewardOption } from '../lib/loyalty'
import type { LoyaltyTier } from '../types'
import { cn } from './ui'

export type BelleLoyaltyCardProps = {
  fullName: string
  memberId: string
  loyaltyTier: LoyaltyTier
  lifetimeSpend: number
  totalVisits: number
  memberSince?: string
  walletToken?: string
  salonName?: string
  readyRewards?: LoyaltyRewardOption[]
  className?: string
}

type RedeemPhase = 'idle' | 'confirm' | 'success' | 'failure'

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName
}

function memberSinceLabel(memberSince?: string) {
  if (!memberSince) return null
  const date = new Date(memberSince)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function redeemCopy(phase: RedeemPhase, rewardLabel: string): { title: string; body: string } {
  switch (phase) {
    case 'idle':
      return { title: '', body: '' }
    case 'confirm':
      return {
        title: 'Use this reward at Belle?',
        body: `${rewardLabel} is applied by Belle staff on your visit. Confirm when you are at reception so they can redeem it securely.`,
      }
    case 'success':
      return {
        title: 'Show this at reception',
        body: `You’re ready to use ${rewardLabel}. Hand your phone to Belle staff so they can apply it on your visit.`,
      }
    case 'failure':
      return {
        title: 'Could not start redemption',
        body: 'This reward is no longer available on your card. Ask Belle staff if you need help.',
      }
    default: {
      const _exhaustive: never = phase
      throw new Error(`Unhandled redeem phase: ${String(_exhaustive)}`)
    }
  }
}

/** Customer-facing loyalty card for /w/:token (not the CRM profile). */
export function BelleLoyaltyCard({
  fullName,
  memberId: _memberId,
  loyaltyTier,
  lifetimeSpend,
  totalVisits,
  memberSince,
  salonName = 'Belle Beauty Lounge',
  readyRewards = [],
  className,
}: BelleLoyaltyCardProps) {
  const titleId = useId()
  const descId = useId()
  const [benefitsOpen, setBenefitsOpen] = useState(false)
  const [redeemPhase, setRedeemPhase] = useState<RedeemPhase>('idle')
  const readyReward = readyRewards[0] ?? null
  const nextReward = nextSpendReward(lifetimeSpend, loyaltyTier)
  const greetingName = firstName(fullName)
  const sinceLabel = memberSinceLabel(memberSince)
  const visitLabel = totalVisits === 1 ? '1 visit' : `${totalVisits} visits`
  const progressPct = Math.round(Math.min(1, Math.max(0, nextReward.progress)) * 100)
  const perks = customerPerkLines(loyaltyTier)
  const dialog = redeemCopy(redeemPhase, readyReward?.label || 'this reward')

  useEffect(() => {
    if (redeemPhase !== 'confirm' && redeemPhase !== 'failure') return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setRedeemPhase('idle')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [redeemPhase])

  function startRedeem() {
    if (!readyReward) {
      setRedeemPhase('failure')
      return
    }
    setRedeemPhase('confirm')
  }

  function confirmRedeem() {
    if (!readyReward) {
      setRedeemPhase('failure')
      return
    }
    setRedeemPhase('success')
  }

  return (
    <article
      className={cn(
        'overflow-hidden rounded-[1.75rem] bg-gradient-to-b from-[#D9C8B2] via-[#E8DCCB] to-[#A88763] p-4 text-[#3B2418] shadow-[0_24px_50px_rgba(59,36,24,0.18)] sm:p-5',
        className,
      )}
    >
      <header className="px-1 pt-1">
        <div className="flex items-start justify-between gap-3">
          <img
            src="/belle-logo.svg"
            alt={salonName}
            className="h-11 w-auto max-w-[58%] object-contain object-left"
          />
          <p className="mt-1 inline-flex min-h-8 shrink-0 items-center rounded-full bg-[#F8F3EA]/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3B2418]">
            {loyaltyTier}
          </p>
        </div>
        <h1 className="mt-5 truncate font-display text-[2rem] leading-tight tracking-tight" title={`Hi, ${greetingName}`}>
          Hi, {greetingName}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-[#796A5D]">
          {sinceLabel ? `With us since ${sinceLabel}` : 'Welcome to Belle'}
          {totalVisits > 0 ? ` · ${visitLabel}` : ''}
        </p>
      </header>

      <section className="mt-5 rounded-[1.35rem] bg-[#F8F3EA] px-5 py-5" aria-labelledby="ready-reward-label">
        <p id="ready-reward-label" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#796A5D]">
          Ready to use
        </p>
        {readyReward ? (
          <>
            <p className="mt-2 break-words font-display text-[1.85rem] leading-tight uppercase">{readyReward.label}</p>
            <p className="mt-2 text-sm leading-relaxed text-[#796A5D]">{readyReward.detail}</p>
            <button
              type="button"
              onClick={startRedeem}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[#B48655] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#A88763] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2418]"
            >
              Use at Belle
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 font-display text-[1.85rem] leading-tight">No reward ready</p>
            <p className="mt-2 text-sm leading-relaxed text-[#796A5D]">
              Keep visiting Belle to unlock your next gift. Staff apply rewards securely at reception.
            </p>
          </>
        )}
        {redeemPhase === 'success' ? (
          <p className="mt-3 text-sm font-medium text-[#3B2418]" role="status">
            {dialog.body}
          </p>
        ) : null}
      </section>

      <section className="mt-3 rounded-[1.35rem] bg-[#F8F3EA] px-5 py-5" aria-labelledby="next-reward-label">
        <p id="next-reward-label" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#796A5D]">
          Next reward
        </p>
        <p className="mt-2 font-display text-[1.85rem] leading-tight">{nextReward.headline}</p>
        <div
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#D9C8B2]/80"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
          aria-label="Progress toward next reward"
        >
          <div className="h-full rounded-full bg-gradient-to-r from-[#B48655] to-[#A88763]" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#796A5D]">{nextReward.explanation}</p>
      </section>

      <section className="mt-3 rounded-[1.35rem] bg-[#F8F3EA] px-5 py-5" aria-labelledby="member-summary-label">
        <p id="member-summary-label" className="sr-only">
          Membership summary
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#796A5D]">Total visits</p>
            <p className="mt-1 font-display text-2xl leading-none">{totalVisits}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#796A5D]">Member since</p>
            <p className="mt-1 font-display text-2xl leading-none">{sinceLabel || '—'}</p>
          </div>
        </div>
        <button
          type="button"
          aria-expanded={benefitsOpen}
          onClick={() => setBenefitsOpen((open) => !open)}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-[#A88763]/50 bg-transparent px-4 py-3 text-sm font-semibold text-[#3B2418] transition hover:bg-[#D9C8B2]/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2418]"
        >
          {benefitsOpen ? 'Hide benefits' : 'View all benefits'}
        </button>
        {benefitsOpen ? (
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[#3B2418]">
            {perks.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#B48655]" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {redeemPhase === 'confirm' || redeemPhase === 'failure' ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#3B2418]/40 p-4 sm:items-center" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            className="w-full max-w-md rounded-[1.5rem] bg-[#F8F3EA] p-5 shadow-xl"
          >
            <h2 id={titleId} className="font-display text-2xl leading-tight">
              {dialog.title}
            </h2>
            <p id={descId} className="mt-2 text-sm leading-relaxed text-[#796A5D]">
              {dialog.body}
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              {redeemPhase === 'confirm' ? (
                <>
                  <button
                    type="button"
                    onClick={confirmRedeem}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-[#B48655] px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2418]"
                  >
                    Confirm at Belle
                  </button>
                  <button
                    type="button"
                    onClick={() => setRedeemPhase('idle')}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-[#A88763]/50 px-4 text-sm font-semibold text-[#3B2418] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2418]"
                  >
                    Not now
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setRedeemPhase('idle')}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[#B48655] px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B2418]"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  )
}
