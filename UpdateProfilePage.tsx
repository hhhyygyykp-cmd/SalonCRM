import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AreaSelect } from '../components/AreaSelect'
import { BrandLogo } from '../components/BrandLogo'
import { formatLocalPhone, PHONE_PLACEHOLDER } from '../lib/phone'

type ProfileForm = {
  fullName: string
  phone: string
  location: string
  email: string
  birthday: string
}

function supabaseEnv() {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  return { base, anon }
}

async function callProfile(pathQuery: string, init?: RequestInit) {
  const { base, anon } = supabaseEnv()
  if (!base || !anon) throw new Error('This page is not connected yet. Please try again later.')
  const res = await fetch(`${base}/functions/v1/customer-profile${pathQuery}`, {
    ...init,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; token?: string; customer?: ProfileForm }
  if (!res.ok) throw new Error(data.error || 'Could not load your details.')
  return data
}

export function UpdateProfilePage() {
  const { token: tokenParam } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [token, setToken] = useState(tokenParam ?? '')
  const [lookupPhone, setLookupPhone] = useState('')
  const [form, setForm] = useState<ProfileForm>({
    fullName: '',
    phone: '',
    location: '',
    email: '',
    birthday: '',
  })
  const [loading, setLoading] = useState(Boolean(tokenParam))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (tokenParam) setToken(tokenParam)
  }, [tokenParam])

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    void (async () => {
      try {
        const data = await callProfile(`?token=${encodeURIComponent(token)}`)
        if (cancelled) return
        const c = data.customer
        if (c) {
          setForm({
            fullName: c.fullName,
            phone: formatLocalPhone(c.phone),
            location: c.location,
            email: c.email,
            birthday: c.birthday,
          })
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load your details.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const firstName = useMemo(() => form.fullName.trim().split(/\s+/)[0] || '', [form.fullName])

  const lookup = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const data = await callProfile('', {
        method: 'POST',
        body: JSON.stringify({ action: 'lookup', phone: lookupPhone }),
      })
      if (!data.token) throw new Error('Could not find this number.')
      setToken(data.token)
      navigate(`/update/${data.token}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find this number.')
    } finally {
      setSaving(false)
    }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await callProfile('', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save',
          token,
          fullName: form.fullName,
          phone: form.phone,
          location: form.location,
          email: form.email,
          birthday: form.birthday,
        }),
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your details.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#eef0ea_0%,_#f6f5f1_50%,_#e4e7df_100%)] px-4 py-8 text-ink" dir="rtl">
      <div className="mx-auto max-w-md space-y-5">
        <div className="text-center">
          <BrandLogo variant="plain" className="justify-center" imgClassName="h-16" />
          <p className="mt-3 text-sm text-muted">Belle Beauty Lounge</p>
          <h1 className="mt-1 font-display text-3xl leading-tight">كمّلي بياناتك</h1>
          <p className="mt-1 text-sm text-muted">Update your details so we can take care of you better</p>
        </div>

        {saved ? (
          <div className="rounded-2xl border border-line bg-white/90 px-5 py-8 text-center shadow-sm">
            <p className="font-display text-2xl">تم الحفظ 💚</p>
            <p className="mt-2 text-sm text-muted">
              {firstName ? `شكراً ${firstName}، ` : 'شكراً، '}
              your Belle record is updated.
            </p>
          </div>
        ) : !token ? (
          <form onSubmit={(e) => void lookup(e)} className="space-y-4 rounded-2xl border border-line bg-white/90 px-5 py-5 shadow-sm">
            <p className="text-sm leading-relaxed text-muted">
              أدخلـي رقم الواتساب المسجّل عند Belle وسنفتح لكِ نموذج التحديث.
            </p>
            <label className="block space-y-1.5" dir="ltr">
              <span className="block text-right text-sm font-medium">رقم الواتساب / WhatsApp</span>
              <input
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
                value={lookupPhone}
                onChange={(e) => setLookupPhone(e.target.value)}
                placeholder={PHONE_PLACEHOLDER}
                inputMode="tel"
                required
              />
            </label>
            {error ? <p className="text-sm text-rose-deep">{error}</p> : null}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-rose px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? 'جاري البحث…' : 'فتح بياناتي'}
            </button>
          </form>
        ) : loading ? (
          <p className="py-10 text-center text-sm text-muted">Loading your details…</p>
        ) : error && !form.fullName ? (
          <div className="rounded-2xl border border-rose-soft bg-white/80 p-6 text-center text-sm text-rose-deep">
            {error}
          </div>
        ) : (
          <form onSubmit={(e) => void save(e)} className="space-y-4 rounded-2xl border border-line bg-white/90 px-5 py-5 shadow-sm">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">الاسم الكامل / Full name</span>
              <input
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                required
              />
            </label>
            <label className="block space-y-1.5" dir="ltr">
              <span className="block text-right text-sm font-medium">الواتساب / WhatsApp</span>
              <input
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder={PHONE_PLACEHOLDER}
                inputMode="tel"
                required
              />
            </label>
            <div dir="ltr">
              <AreaSelect
                label="المنطقة / Area"
                value={form.location}
                onChange={(value) => setForm((f) => ({ ...f, location: value }))}
              />
            </div>
            <label className="block space-y-1.5" dir="ltr">
              <span className="block text-right text-sm font-medium">الإيميل / Email (optional)</span>
              <input
                type="email"
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </label>
            <label className="block space-y-1.5" dir="ltr">
              <span className="block text-right text-sm font-medium">عيد الميلاد / Birthday</span>
              <input
                type="date"
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
                value={form.birthday}
                onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))}
              />
            </label>
            {error ? <p className="text-sm text-rose-deep">{error}</p> : null}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-rose px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? 'جاري الحفظ…' : 'حفظ البيانات'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
