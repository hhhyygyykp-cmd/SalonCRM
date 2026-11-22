const TITLE_BASE = 'Belle Beauty Lounge CRM'
const ALERTS_PREF = 'belle_wa_desktop_alerts'
const SOUND_PREF = 'belle_wa_alert_sound'
const BANNER_DISMISS = 'belle_wa_alert_banner_dismissed'

let openConversationId: string | null = null
const lastPingAt = new Map<string, number>()
let audioCtx: AudioContext | null = null

export function setOpenWhatsAppConversation(id: string | null) {
  openConversationId = id
}

export function getOpenWhatsAppConversation() {
  return openConversationId
}

export function alertsPrefOn() {
  return localStorage.getItem(ALERTS_PREF) !== 'off'
}

export function soundPrefOn() {
  return localStorage.getItem(SOUND_PREF) !== 'off'
}

export function setAlertsPref(on: boolean) {
  localStorage.setItem(ALERTS_PREF, on ? 'on' : 'off')
}

export function setSoundPref(on: boolean) {
  localStorage.setItem(SOUND_PREF, on ? 'on' : 'off')
}

export function bannerDismissed() {
  return localStorage.getItem(BANNER_DISMISS) === '1'
}

export function dismissAlertBanner() {
  localStorage.setItem(BANNER_DISMISS, '1')
}

export function setUnreadDocumentTitle(unread: number) {
  document.title = unread > 0 ? `(${unread}) ${TITLE_BASE}` : TITLE_BASE
}

export function resetDocumentTitle() {
  document.title = TITLE_BASE
}

export function notificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestDesktopAlerts(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationSupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission === 'granted') {
    setAlertsPref(true)
    localStorage.removeItem(BANNER_DISMISS)
    void resumeAudio()
  }
  return permission
}

export function isViewingConversation(conversationId: string) {
  if (document.visibilityState !== 'visible' || !document.hasFocus()) return false
  return openConversationId === conversationId
}

function shouldThrottle(conversationId: string) {
  const now = Date.now()
  const prev = lastPingAt.get(conversationId) ?? 0
  if (now - prev < 2500) return true
  lastPingAt.set(conversationId, now)
  return false
}

async function resumeAudio() {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    if (audioCtx.state === 'suspended') await audioCtx.resume()
  } catch {
    /* ignore */
  }
}

export function playWhatsAppPing() {
  if (!soundPrefOn()) return
  void (async () => {
    try {
      await resumeAudio()
      if (!audioCtx) return
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.09, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.32)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.32)
    } catch {
      /* ignore */
    }
  })()
}

export function showWhatsAppDesktopNotification(opts: {
  conversationId: string
  title: string
  body: string
  onOpen: () => void
}) {
  if (!alertsPrefOn() || !notificationSupported() || Notification.permission !== 'granted') return
  try {
    const notification = new Notification(opts.title, {
      body: opts.body,
      icon: `${window.location.origin}/belle-logo.svg`,
      tag: `wa-${opts.conversationId}`,
      silent: true,
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
      opts.onOpen()
    }
  } catch {
    /* ignore */
  }
}

export function notifyInboundWhatsApp(opts: {
  conversationId: string
  title: string
  body: string
  onOpen: () => void
}) {
  if (isViewingConversation(opts.conversationId)) return
  if (shouldThrottle(opts.conversationId)) return
  playWhatsAppPing()
  showWhatsAppDesktopNotification(opts)
}

export function previewForNotify(body: string, messageType: string) {
  const trimmed = body.trim()
  if (trimmed && !/^(Photo|Voice note|Video|Sticker|Document)$/i.test(trimmed)) {
    return trimmed.length > 90 ? `${trimmed.slice(0, 87)}…` : trimmed
  }
  if (messageType === 'image' || messageType === 'sticker') return 'Sent a photo'
  if (messageType === 'audio') return 'Sent a voice note'
  if (messageType === 'video') return 'Sent a video'
  if (messageType === 'document') return 'Sent a file'
  return trimmed || 'New WhatsApp message'
}
