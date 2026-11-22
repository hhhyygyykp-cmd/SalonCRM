import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BelleLoyaltyCard } from '../components/BelleLoyaltyCard'
import { availableLoyaltyRewardsFromHistory } from '../lib/loyalty'
import type { LoyaltyRewardType, LoyaltyTier } from '../types'

type RewardRedemption = {
  type: LoyaltyRewardType
  visitDate: string
}

type WalletInfo = {
  salonName: string
  customer: {
    id: string
    fullName: string
    phone: string
    loyaltyTier: string
    lifetimeSpend: number
    totalVisits: number
    createdAt?: string
  }
  rewardRedemptions?: RewardRedemption[]
  appleConfigured: boolean
  googleConfigured: boolean
  appleUrl: string
  googleUrl: string
}

function detectPlatform(): 'ios' | 'android' | 'other' {
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

function supabaseEnv() {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  return { base, anon }
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName
}

export function WalletPassPage() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<WalletInfo | null>(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null)
  const platform = useMemo(() => detectPlatform(), [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!token) {
        setError('Missing wallet link.')
        setLoading(false)
        return
      }
      const { base, anon } = supabaseEnv()
      if (!base || !anon) {
        setError('App is not connected to Supabase.')
        setLoading(false)
        return
      }
      try {
        const res = await fetch(`${base}/functions/v1/wallet-pass?token=${encodeURIComponent(token)}`, {
          headers: {
            apikey: anon,
            Authorization: `Bearer ${anon}`,
          },
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Could not load loyalty card')
        if (!cancelled) setInfo(data as WalletInfo)
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Could not load loyalty card'
          setError(
            msg === 'Failed to fetch'
              ? 'Could not reach the wallet server. Check your internet connection, then refresh. If this keeps happening, open Preview wallet again from the CRM.'
              : msg,
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [token])

  const addToApple = async () => {
    if (!token || !info?.appleConfigured) return
    const { base, anon } = supabaseEnv()
    if (!base || !anon) return
    setBusy('apple')
    setActionError('')
    try {
      const res = await fetch(
        `${base}/functions/v1/wallet-pass?token=${encodeURIComponent(token)}&platform=apple`,
        {
          headers: {
            apikey: anon,
            Authorization: `Bearer ${anon}`,
          },
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error || 'Could not create Apple pass')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'belle-loyalty.pkpass'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Apple Wallet failed')
    } finally {
      setBusy(null)
    }
  }

  const addToGoogle = async () => {
    if (!token || !info?.googleConfigured) return
    const { base, anon } = supabaseEnv()
    if (!base || !anon) return
    setBusy('google')
    setActionError('')
    try {
      window.location.href =
        `${base}/functions/v1/wallet-pass` +
        `?token=${encodeURIComponent(token)}` +
        `&platform=google` +
        `&apikey=${encodeURIComponent(anon)}`
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Google Wallet failed')
      setBusy(null)
    }
  }

  const tier = (info?.customer.loyaltyTier as LoyaltyTier) || 'Regular'
  const readyRewards = useMemo(() => {
    if (!info || info.rewardRedemptions === undefined) return []
    return availableLoyaltyRewardsFromHistory(tier, info.customer.lifetimeSpend, info.rewardRedemptions)
  }, [info, tier])

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#D9C8B2] via-[#EDE3D6] to-[#A88763] px-4 py-8 text-[#3B2418]">
      <div className="mx-auto w-full max-w-md">
        {loading ? (
          <p className="mt-16 text-center text-sm text-[#796A5D]" role="status">
            Loading your Belle card…
          </p>
        ) : error ? (
          <div className="mt-8 rounded-[1.5rem] bg-[#F8F3EA] p-6 text-center text-sm text-[#3B2418]" role="alert">
            {error}
          </div>
        ) : info ? (
          <div className="space-y-5">
            <BelleLoyaltyCard
              fullName={info.customer.fullName}
              memberId={info.customer.id}
              loyaltyTier={tier}
              lifetimeSpend={info.customer.lifetimeSpend}
              totalVisits={info.customer.totalVisits}
              memberSince={info.customer.createdAt}
              walletToken={token}
              salonName={info.salonName}
              readyRewards={readyRewards}
            />

            <div className="rounded-[1.35rem] bg-[#F8F3EA] px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#796A5D]">How to use it</p>
              <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-[#3B2418]">
                <li>1. Open this card at reception when you arrive.</li>
                <li>2. Ask staff to apply any free gift that is ready on your card.</li>
                <li>3. Add the card to your phone wallet so you always have it.</li>
              </ol>
            </div>

            <a
              href={`/update/${token}`}
              className="block min-h-11 rounded-[1.35rem] border border-[#A88763]/40 bg-[#F8F3EA] px-5 py-3.5 text-center text-sm font-semibold text-[#3B2418]"
            >
              Update my name, area, and birthday
            </a>

            <div className="space-y-3 rounded-[1.35rem] bg-[#F8F3EA] px-5 py-5">
              <p className="text-sm font-medium">Save to your phone, {firstName(info.customer.fullName)}</p>
              {(platform === 'ios' || platform === 'other') && (
                <button
                  type="button"
                  disabled={!info.appleConfigured || busy !== null}
                  onClick={() => void addToApple()}
                  className={`block min-h-11 w-full rounded-xl px-4 py-3.5 text-center text-sm font-medium text-white ${
                    info.appleConfigured ? 'bg-black' : 'cursor-not-allowed bg-black/40'
                  }`}
                >
                  {busy === 'apple'
                    ? 'Preparing…'
                    : info.appleConfigured
                      ? 'Add to Apple Wallet'
                      : 'Apple Wallet (setup pending)'}
                </button>
              )}
              {(platform === 'android' || platform === 'other') && (
                <button
                  type="button"
                  disabled={!info.googleConfigured || busy !== null}
                  onClick={() => void addToGoogle()}
                  className={`block min-h-11 w-full rounded-xl px-4 py-3.5 text-center text-sm font-medium text-white ${
                    info.googleConfigured ? 'bg-[#1a73e8]' : 'cursor-not-allowed bg-[#1a73e8]/40'
                  }`}
                >
                  {busy === 'google'
                    ? 'Preparing…'
                    : info.googleConfigured
                      ? 'Add to Google Wallet'
                      : 'Google Wallet (setup pending)'}
                </button>
              )}
              {actionError ? <p className="text-center text-xs text-[#A14545]">{actionError}</p> : null}
              <p className="text-center text-xs leading-relaxed text-[#796A5D]">
                You can also bookmark this page or open it anytime from your WhatsApp thank-you message.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-[1.5rem] bg-[#F8F3EA] p-6 text-center text-sm text-[#3B2418]" role="alert">
            Loyalty card details are unavailable. Open your Belle WhatsApp link again, or ask reception for help.
          </div>
        )}
      </div>
    </div>
  )
}
