import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, Card, Input } from '../components/ui'
import { BrandLogo } from '../components/BrandLogo'
import { salonSettings } from '../data/mockData'
import { formatLocalPhone } from '../lib/phone'

export function LoginPage() {
  const { user, login, loading, configured } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const result = await login(email, password)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? 'Login failed')
      return
    }
    navigate('/')
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(83,92,73,0.35),_transparent_50%),radial-gradient(ellipse_at_bottom_right,_rgba(184,149,59,0.18),_transparent_45%),linear-gradient(160deg,#242620_0%,#3A4034_45%,#535C49_100%)]" />
      <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-rose/30 blur-3xl" />
      <div className="absolute -right-10 bottom-10 h-80 w-80 rounded-full bg-gold/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-10 px-4 py-10 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="text-white">
          <BrandLogo className="mb-6 inline-flex border border-white/15 shadow-lg" imgClassName="h-24 w-auto md:h-28" variant="dark" />
          <h1 className="font-display text-5xl leading-tight md:text-6xl">{salonSettings.salonName}</h1>
          <p className="mt-4 max-w-md text-base text-white/75">
            Customer care, loyalty, and visit history for your lounge — elegant, calm, and built for a busy floor.
          </p>
          <p className="mt-4 text-sm text-white/65">WhatsApp · {formatLocalPhone(salonSettings.whatsapp)}</p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-white/40">Site build 28 Aug 2026 · inbox</p>
        </div>

        <Card className="backdrop-blur">
          <BrandLogo variant="plain" className="mb-4" imgClassName="h-16" />
          <h2 className="font-display text-3xl text-ink">Welcome back</h2>
          <p className="mt-1 text-sm text-muted">Sign in with your Belle Beauty Lounge account.</p>

          {!configured ? (
            <p className="mt-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">
              Connect Supabase first: copy <code>.env.example</code> to <code>.env</code> and set{' '}
              <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
            </p>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" className="w-full" size="lg" disabled={submitting || !configured || loading}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-5 text-sm">
            <Link to="/forgot-password" className="text-rose hover:text-rose-deep">
              Forgot password?
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const { configured } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <Card className="w-full max-w-md">
        <BrandLogo className="mx-auto mb-4 w-fit" imgClassName="h-20" />
        <h1 className="font-display text-3xl">Reset password</h1>
        <p className="mt-1 text-sm text-muted">We will email you a secure reset link.</p>
        {!sent ? (
          <form
            className="mt-6 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setError('')
              if (!configured) {
                setError('Supabase is not configured.')
                return
              }
              const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/login`,
              })
              if (resetError) {
                setError(resetError.message)
                return
              }
              setSent(true)
            }}
          >
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" className="w-full">
              Send reset link
            </Button>
          </form>
        ) : (
          <p className="mt-6 text-sm text-muted">If an account exists for that email, a reset link is on its way.</p>
        )}
        <Link to="/login" className="mt-4 inline-block text-sm text-rose">
          Back to sign in
        </Link>
      </Card>
    </div>
  )
}
