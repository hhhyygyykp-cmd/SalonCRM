import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Button, Input } from './ui'

const DEFAULT_BUSINESS_NUMBER = '+971561404016'

type DiagnoseInfo = {
  provider?: string
  displayPhoneNumber?: string | null
  webhookUrl?: string
  currentWebhook?: string | null
  approvedTemplates?: string[]
  tip?: string
  pingOk?: boolean
}

async function readInvokeError(error: { message?: string; context?: Response } | null, fallback: string) {
  if (!error) return fallback
  const ctx = error.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { error?: string; message?: string }
      if (body?.error) return String(body.error)
      if (body?.message) return String(body.message)
    } catch {
      /* ignore */
    }
  }
  const message = error.message || fallback
  if (/non-2xx/i.test(message)) {
    return 'Could not save. Refresh this page and try again. If it still fails, the send-whatsapp function needs a deploy.'
  }
  return message
}

export function WhatsAppConnectPanel({ onToast }: { onToast: (message: string) => void }) {
  const { isAdmin } = useAuth()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [displayPhone, setDisplayPhone] = useState(DEFAULT_BUSINESS_NUMBER)
  const [statusLine, setStatusLine] = useState('Not connected yet')
  const [detail, setDetail] = useState('')
  const [saveError, setSaveError] = useState('')

  const webhookUrl = `${String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')}/functions/v1/whatsapp-webhook`

  async function loadStatus() {
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', { body: { action: 'diagnose' } })
      if (error || !data) {
        setStatusLine('Not connected yet')
        return
      }
      const payload = data as { ok?: boolean; diagnose?: DiagnoseInfo; error?: string }
      const d = payload.diagnose
      if (d?.provider === '360dialog' && payload.ok) {
        setStatusLine(`Connected · ${d.displayPhoneNumber || DEFAULT_BUSINESS_NUMBER}`)
        if (d.displayPhoneNumber) setDisplayPhone(d.displayPhoneNumber)
        setDetail(
          [
            d.currentWebhook ? `Hub webhook: ${d.currentWebhook}` : `Set Hub webhook to: ${webhookUrl}`,
            d.approvedTemplates?.length ? `Templates: ${d.approvedTemplates.join(', ')}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        )
        return
      }
      setStatusLine(payload.error || d?.tip || 'Paste the Hub API key and save')
    } catch {
      setStatusLine('Not connected yet')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  async function saveChannel() {
    setSaveError('')
    if (!isAdmin) {
      const message = 'Only the salon owner can connect 360dialog'
      setSaveError(message)
      onToast(message)
      return
    }
    if (!apiKey.trim()) {
      const message = 'Paste the 360dialog API key from the Hub'
      setSaveError(message)
      onToast(message)
      return
    }
    setSaving(true)
    setDetail('')
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          action: 'connect_360dialog',
          apiKey: apiKey.trim(),
          displayPhone: displayPhone.trim() || DEFAULT_BUSINESS_NUMBER,
        },
      })
      const payload = data as { ok?: boolean; error?: string; message?: string; webhookUrl?: string } | null
      if (payload?.ok) {
        setApiKey('')
        onToast(payload.message || '360dialog saved')
        await loadStatus()
        return
      }
      if (error) {
        const message = await readInvokeError(error, payload?.error || error.message || 'Could not save 360dialog')
        setSaveError(message)
        onToast(message)
        return
      }
      const message = payload?.error || 'Could not save 360dialog'
      setSaveError(message)
      onToast(message)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save 360dialog'
      setSaveError(message)
      onToast(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-line/80 bg-white p-5 shadow-[0_8px_30px_rgba(42,36,33,0.04)] md:p-6">
      <h3 className="font-display text-2xl">360dialog</h3>
      <p className="mt-1 text-sm text-muted">
        Paste the Hub API key for <strong>+971 56 140 4016</strong>. Inbox and sending use this channel.
      </p>
      <p className="mt-2 text-sm font-medium text-ink">{loading ? 'Checking connection…' : statusLine}</p>

      <div className="mt-4 rounded-xl border border-line bg-cream/50 p-3 text-xs text-ink">
        <p className="font-medium">Hub webhook URL</p>
        <p className="mt-1 break-all font-mono">{webhookUrl || 'Missing VITE_SUPABASE_URL'}</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          type="button"
          onClick={async () => {
            if (!webhookUrl) return
            await navigator.clipboard.writeText(webhookUrl)
            onToast('Webhook URL copied')
          }}
        >
          Copy webhook URL
        </Button>
      </div>

      {isAdmin ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input
            className="sm:col-span-2"
            label="360dialog API key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="From Hub → channel → API key"
          />
          <Input
            className="sm:col-span-2"
            label="WhatsApp number"
            value={displayPhone}
            onChange={(e) => setDisplayPhone(e.target.value)}
            placeholder="+971561404016"
          />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Ask the salon owner to paste the 360dialog API key.</p>
      )}

      {isAdmin ? (
        <div className="mt-4">
          <Button type="button" onClick={() => void saveChannel()} disabled={saving}>
            {saving ? 'Saving…' : 'Save 360dialog'}
          </Button>
          {saveError ? <p className="mt-2 text-sm text-rose-deep">{saveError}</p> : null}
        </div>
      ) : null}

      {detail ? (
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-cream/50 p-3 text-xs text-ink">
          {detail}
        </pre>
      ) : null}
    </div>
  )
}
