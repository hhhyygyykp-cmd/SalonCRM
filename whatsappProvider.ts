import type { WhatsAppConnection } from './whatsappConnection.ts'

export type WhatsAppProviderId = 'meta' | '360dialog'

export const D360_BASE = 'https://waba-v2.360dialog.io'

export type SendTextInput = {
  to: string
  body: string
  previewUrl?: boolean
}

export type SendTemplateInput = {
  to: string
  name: string
  language: string
  components?: unknown[]
}

export type SendMessageResult = {
  ok: boolean
  httpStatus: number
  payload: unknown
  requestUrl: string
  messageId: string | null
  error?: string
}

export type MarkReadInput = {
  messageId: string
}

export type DownloadMediaInput = {
  mediaId: string
}

export type DownloadMediaResult = {
  url: string
  mimeType: string
  authHeader: { name: string; value: string }
} | null

export type DialogTemplate = {
  name: string
  language: string
  status: string
  category: string
  body: string
}

export interface WhatsAppProvider {
  id: WhatsAppProviderId
  sendText(input: SendTextInput): Promise<SendMessageResult>
  sendTemplate(input: SendTemplateInput): Promise<SendMessageResult>
  markRead(input: MarkReadInput): Promise<void>
  downloadMedia(input: DownloadMediaInput): Promise<DownloadMediaResult>
}

function messageIdFromPayload(payload: unknown): string | null {
  return (payload as { messages?: { id?: string }[] })?.messages?.[0]?.id ?? null
}

function payloadError(payload: unknown): string | undefined {
  const err = (payload as { error?: { message?: string } | string })?.error
  if (!err) return undefined
  if (typeof err === 'string') return err
  return err.message
}

export function d360Headers(apiKey: string, json = false): Record<string, string> {
  const headers: Record<string, string> = { 'D360-API-KEY': apiKey.trim() }
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

export async function d360Request(
  path: string,
  apiKey: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; payload: unknown; url: string }> {
  const url = `${D360_BASE}${path.startsWith('/') ? path : `/${path}`}`
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...d360Headers(apiKey, init?.method !== 'GET'),
        ...(init?.headers || {}),
      },
    })
    const payload = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, payload, url }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      payload: { error: { message: e instanceof Error ? e.message : 'Network error' } },
      url,
    }
  }
}

export async function ping360Dialog(apiKey: string): Promise<{
  ok: boolean
  error?: string
  webhookUrl?: string | null
  wabaId?: string | null
  numbers?: string[]
}> {
  const key = apiKey.trim()
  if (!key) return { ok: false, error: 'API key is required' }

  const webhook = await d360Request('/v1/configs/webhook', key, { method: 'GET' })
  if (webhook.status === 401 || webhook.status === 403) {
    return { ok: false, error: 'Invalid 360dialog API key' }
  }

  const waba = await d360Request('/waba_webhook', key, { method: 'GET' })
  const wabaPayload = waba.payload as {
    url?: string
    waba_id?: string | number
    numbers_on_this_waba?: string[]
  }
  const webhookPayload = webhook.payload as { url?: string }

  if (!webhook.ok && !waba.ok) {
    return {
      ok: false,
      error: payloadError(webhook.payload) || payloadError(waba.payload) || `360dialog HTTP ${webhook.status}`,
    }
  }

  return {
    ok: true,
    webhookUrl: webhookPayload.url || wabaPayload.url || null,
    wabaId: wabaPayload.waba_id != null ? String(wabaPayload.waba_id) : null,
    numbers: Array.isArray(wabaPayload.numbers_on_this_waba) ? wabaPayload.numbers_on_this_waba : [],
  }
}

export async function set360DialogWebhook(apiKey: string, webhookUrl: string): Promise<{
  ok: boolean
  error?: string
}> {
  const key = apiKey.trim()
  const phone = await d360Request('/v1/configs/webhook', key, {
    method: 'POST',
    body: JSON.stringify({ url: webhookUrl }),
  })
  const waba = await d360Request('/waba_webhook', key, {
    method: 'POST',
    body: JSON.stringify({ url: webhookUrl, override_all: false }),
  })
  if (phone.ok || waba.ok) return { ok: true }
  return {
    ok: false,
    error:
      payloadError(phone.payload) ||
      payloadError(waba.payload) ||
      'Could not set 360dialog webhook. Set it in the Hub if the API rejects the URL.',
  }
}

export async function list360DialogTemplates(apiKey: string): Promise<DialogTemplate[]> {
  const key = apiKey.trim()
  const res = await d360Request('/v1/configs/templates', key, { method: 'GET' })
  type TemplateRow = {
    name?: string
    language?: string
    status?: string
    category?: string
    components?: Array<{ type?: string; text?: string }>
  }
  const payload = res.payload as {
    waba_templates?: TemplateRow[]
    data?: TemplateRow[]
  }
  const rows = Array.isArray(payload.waba_templates)
    ? payload.waba_templates
    : Array.isArray(payload.data)
      ? payload.data
      : []
  return rows
    .map((t) => ({
      name: String(t.name ?? ''),
      language: String(t.language ?? ''),
      status: String(t.status ?? '').toUpperCase(),
      category: String(t.category ?? 'UTILITY').toUpperCase(),
      body: String(
        (Array.isArray(t.components)
          ? t.components.find((component) => String(component.type ?? '').toUpperCase() === 'BODY')?.text
          : '') ?? '',
      ),
    }))
    .filter((t) => t.name)
}

function createMetaProvider(connection: WhatsAppConnection, graphVersion: string): WhatsAppProvider {
  const token = connection.token.trim()
  const phoneNumberId = connection.phoneNumberId.trim()
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  async function postMessages(body: Record<string, unknown>): Promise<SendMessageResult> {
    const requestUrl = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`
    const res = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const payload = await res.json().catch(() => ({}))
    console.log(
      JSON.stringify({
        event: 'whatsapp_send_response',
        provider: 'meta',
        httpStatus: res.status,
        ok: res.ok,
        phoneNumberId,
        error: (payload as { error?: unknown })?.error ?? null,
      }),
    )
    return {
      ok: res.ok,
      httpStatus: res.status,
      payload,
      requestUrl,
      messageId: res.ok ? messageIdFromPayload(payload) : null,
      error: res.ok ? undefined : payloadError(payload),
    }
  }

  return {
    id: 'meta',

    sendText(input) {
      return postMessages({
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'text',
        text: { body: input.body || ' ', preview_url: input.previewUrl !== false },
      })
    },

    sendTemplate(input) {
      const components = Array.isArray(input.components) ? input.components : []
      return postMessages({
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'template',
        template: {
          name: input.name,
          language: { code: input.language },
          ...(components.length ? { components } : {}),
        },
      })
    },

    async markRead(input) {
      if (!token || !phoneNumberId || !input.messageId) return
      await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: input.messageId,
        }),
      }).catch(() => null)
    },

    async downloadMedia(input) {
      if (!token || !input.mediaId) return null
      const metaRes = await fetch(`https://graph.facebook.com/${graphVersion}/${input.mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const meta = (await metaRes.json().catch(() => ({}))) as { url?: string; mime_type?: string }
      if (!metaRes.ok || !meta.url) return null
      return {
        url: meta.url,
        mimeType: String(meta.mime_type || 'application/octet-stream'),
        authHeader: { name: 'Authorization', value: `Bearer ${token}` },
      }
    },
  }
}

function create360DialogProvider(connection: WhatsAppConnection): WhatsAppProvider {
  const apiKey = connection.token.trim()

  async function postMessages(body: Record<string, unknown>): Promise<SendMessageResult> {
    if (!apiKey) {
      return {
        ok: false,
        httpStatus: 0,
        payload: { error: { message: '360dialog API key is missing' } },
        requestUrl: '',
        messageId: null,
        error: '360dialog API key is missing',
      }
    }
    const sent = await d360Request('/messages', apiKey, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    console.log(
      JSON.stringify({
        event: 'whatsapp_send_response',
        provider: '360dialog',
        httpStatus: sent.status,
        ok: sent.ok,
        error: (sent.payload as { error?: unknown })?.error ?? null,
      }),
    )
    return {
      ok: sent.ok,
      httpStatus: sent.status,
      payload: sent.payload,
      requestUrl: sent.url,
      messageId: sent.ok ? messageIdFromPayload(sent.payload) : null,
      error: sent.ok ? undefined : payloadError(sent.payload),
    }
  }

  return {
    id: '360dialog',

    sendText(input) {
      return postMessages({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.to,
        type: 'text',
        text: { body: input.body || ' ', preview_url: input.previewUrl !== false },
      })
    },

    sendTemplate(input) {
      const components = Array.isArray(input.components) ? input.components : []
      return postMessages({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.to,
        type: 'template',
        template: {
          name: input.name,
          language: { code: input.language },
          ...(components.length ? { components } : {}),
        },
      })
    },

    async markRead(input) {
      if (!apiKey || !input.messageId) return
      await d360Request('/messages', apiKey, {
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: input.messageId,
        }),
      }).catch(() => null)
    },

    async downloadMedia(input) {
      if (!apiKey || !input.mediaId) return null
      const meta = await d360Request(`/${input.mediaId}`, apiKey, { method: 'GET' })
      const body = meta.payload as { url?: string; mime_type?: string }
      if (!meta.ok || !body.url) return null
      return {
        url: body.url,
        mimeType: String(body.mime_type || 'application/octet-stream'),
        authHeader: { name: 'D360-API-KEY', value: apiKey },
      }
    },
  }
}

/** Resolve adapter from the integration row. Never send 360dialog via Meta. */
export function getWhatsAppProvider(
  connection: WhatsAppConnection,
  graphVersion: string,
): WhatsAppProvider {
  if (connection.provider === '360dialog') return create360DialogProvider(connection)
  return createMetaProvider(connection, graphVersion)
}
