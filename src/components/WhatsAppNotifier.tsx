import { Bell } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { formatLocalPhone } from '../lib/phone'
import { supabase, supabaseConfigured } from '../lib/supabase'
import {
  alertsPrefOn,
  bannerDismissed,
  dismissAlertBanner,
  notifyInboundWhatsApp,
  notificationPermission,
  notificationSupported,
  previewForNotify,
  requestDesktopAlerts,
  setAlertsPref,
  setSoundPref,
  soundPrefOn,
} from '../lib/whatsappNotify'
import { Button } from './ui'

type InboundRow = {
  conversation_id?: string
  customer_id?: string | null
  direction?: string
  body?: string | null
  message_type?: string | null
}

function permissionLabel() {
  const p = notificationPermission()
  if (p === 'unsupported') return 'This browser cannot show desktop alerts.'
  if (p === 'granted') return 'Desktop alerts are on. Keep this CRM tab open on the laptop.'
  if (p === 'denied') return 'Chrome blocked alerts. Click the lock icon in the address bar, allow notifications, then reload.'
  return 'Turn on desktop alerts so staff hear and see new client WhatsApp messages.'
}

export function WhatsAppNotifier({ enabled }: { enabled: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { customers } = useData()
  const [bannerOpen, setBannerOpen] = useState(
    () => notificationSupported() && notificationPermission() === 'default' && !bannerDismissed(),
  )
  const hideBanner = location.pathname.startsWith('/whatsapp')

  const resolveName = useCallback(
    async (customerId: string | null | undefined, conversationId: string) => {
      if (customerId) {
        const match = customers.find((c) => c.id === customerId)
        if (match) return match.fullName
      }
      const { data } = await supabase
        .from('whatsapp_conversations')
        .select('contact_name, phone')
        .eq('id', conversationId)
        .maybeSingle()
      return (data?.contact_name as string) || formatLocalPhone(String(data?.phone ?? '')) || 'A client'
    },
    [customers],
  )

  useEffect(() => {
    if (!enabled || !supabaseConfigured) return

    const channel = supabase
      .channel('whatsapp-inbound-notify')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_chat_messages', filter: 'direction=eq.inbound' },
        (payload) => {
          const row = (payload.new ?? {}) as InboundRow
          if (row.direction && row.direction !== 'inbound') return
          const conversationId = String(row.conversation_id ?? '')
          if (!conversationId) return
          const preview = previewForNotify(String(row.body ?? ''), String(row.message_type ?? 'text'))
          void (async () => {
            const name = await resolveName(row.customer_id, conversationId)
            notifyInboundWhatsApp({
              conversationId,
              title: `${name} on WhatsApp`,
              body: preview,
              onOpen: () => navigate(`/whatsapp?conv=${conversationId}`),
            })
          })()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, navigate, resolveName])

  if (!enabled || !bannerOpen || hideBanner) return null

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-soft bg-blush px-4 py-3 text-sm text-ink">
      <p className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-rose-deep" />
        Get a ping when a client messages Belle on WhatsApp. Allow desktop alerts once — the CRM tab can stay in the background.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={async () => {
            const permission = await requestDesktopAlerts()
            if (permission !== 'default') setBannerOpen(false)
          }}
        >
          Allow alerts
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            dismissAlertBanner()
            setBannerOpen(false)
          }}
        >
          Not now
        </Button>
      </div>
    </div>
  )
}

export function WhatsAppAlertsSettings() {
  const [permission, setPermission] = useState(notificationPermission)
  const [alertsOn, setAlertsOn] = useState(alertsPrefOn)
  const [soundOn, setSoundOn] = useState(soundPrefOn)
  const [busy, setBusy] = useState(false)

  return (
    <div className="rounded-2xl border border-line/80 bg-white p-5 shadow-[0_8px_30px_rgba(42,36,33,0.04)] md:p-6">
      <h3 className="font-display text-2xl">Desktop alerts</h3>
      <p className="mt-1 text-sm text-muted">{permissionLabel()}</p>
      <div className="mt-4 space-y-3">
        {permission === 'default' || permission === 'unsupported' ? (
          <Button
            disabled={busy || permission === 'unsupported'}
            onClick={async () => {
              setBusy(true)
              const next = await requestDesktopAlerts()
              setPermission(next)
              setAlertsOn(alertsPrefOn())
              setBusy(false)
            }}
          >
            {busy ? 'Asking Chrome…' : 'Allow desktop alerts'}
          </Button>
        ) : null}
        {permission === 'granted' ? (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={alertsOn}
                onChange={(e) => {
                  setAlertsPref(e.target.checked)
                  setAlertsOn(e.target.checked)
                }}
              />
              Show a desktop pop-up for new client messages
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={soundOn}
                onChange={(e) => {
                  setSoundPref(e.target.checked)
                  setSoundOn(e.target.checked)
                }}
              />
              Play a short ping
            </label>
          </>
        ) : null}
        <p className="text-xs text-muted">
          Alerts work while this CRM is open in a browser tab (even in the background). Closing the laptop or the tab
          stops them.
        </p>
      </div>
    </div>
  )
}
