// Shared WhatsApp inbox persistence for webhook, send, and automations.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

export function normalizePhone(raw: string): string {
  let digits = String(raw || '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `971${digits.slice(1)}`
  if (digits.length === 9 && digits.startsWith('5')) digits = `971${digits}`
  return digits
}

export function phoneKey(raw: string): string {
  return normalizePhone(raw).slice(-9)
}

export function conversationIdFromPhone(raw: string): string | null {
  const key = phoneKey(raw)
  if (key.length < 8) return null
  return `wc${key}`
}

export function phonesMatch(a: string, b: string): boolean {
  const da = phoneKey(a)
  const db = phoneKey(b)
  return Boolean(da && db && da.length >= 8 && da === db)
}

export type ChatCustomer = {
  id: string
  full_name: string
  phone: string
  whatsapp_phone: string
  salon_id?: string
}

export async function findCustomerByPhone(
  admin: AdminClient,
  raw: string,
  salonId?: string | null,
): Promise<ChatCustomer | null> {
  const key = phoneKey(raw)
  if (key.length < 8) return null
  let query = admin.from('customers').select('id, full_name, phone, whatsapp_phone, salon_id').limit(8000)
  if (salonId) query = query.eq('salon_id', salonId)
  const { data } = await query
  const match = (data ?? []).find((c: { phone?: string; whatsapp_phone?: string }) =>
    phonesMatch(String(c.whatsapp_phone || c.phone || ''), raw),
  )
  return (match as ChatCustomer) ?? null
}

export function previewFromInbound(msg: Record<string, unknown>): {
  messageType: string
  body: string
  mediaId?: string
  mediaMime?: string
  mediaFilename?: string
} {
  const type = String(msg.type || 'text')
  const node = (msg[type] || msg.audio || msg.image || msg.video || msg.document || msg.sticker) as
    | { id?: string; mime_type?: string; filename?: string; caption?: string }
    | undefined
  const mediaId = node?.id ? String(node.id) : undefined
  const mediaMime = node?.mime_type ? String(node.mime_type) : undefined
  const mediaFilename = node?.filename ? String(node.filename) : undefined

  if (type === 'text') {
    const text = msg.text as { body?: string } | undefined
    return { messageType: 'text', body: String(text?.body || '').trim() }
  }
  if (type === 'image') {
    const image = msg.image as { caption?: string; id?: string; mime_type?: string } | undefined
    return {
      messageType: 'image',
      body: image?.caption?.trim() || 'Photo',
      mediaId: image?.id || mediaId,
      mediaMime: image?.mime_type || mediaMime || 'image/jpeg',
    }
  }
  if (type === 'audio' || type === 'voice') {
    const audio = (msg.audio || msg.voice) as { id?: string; mime_type?: string } | undefined
    return {
      messageType: 'audio',
      body: 'Voice note',
      mediaId: audio?.id || mediaId,
      mediaMime: audio?.mime_type || mediaMime || 'audio/ogg',
    }
  }
  if (type === 'video') {
    const video = msg.video as { caption?: string; id?: string; mime_type?: string } | undefined
    return {
      messageType: 'video',
      body: video?.caption?.trim() || 'Video',
      mediaId: video?.id || mediaId,
      mediaMime: video?.mime_type || mediaMime || 'video/mp4',
    }
  }
  if (type === 'document') {
    const doc = msg.document as { filename?: string; caption?: string; id?: string; mime_type?: string } | undefined
    return {
      messageType: 'document',
      body: doc?.caption?.trim() || doc?.filename || 'Document',
      mediaId: doc?.id || mediaId,
      mediaMime: doc?.mime_type || mediaMime,
      mediaFilename: doc?.filename || mediaFilename,
    }
  }
  if (type === 'sticker') {
    const sticker = msg.sticker as { id?: string; mime_type?: string } | undefined
    return {
      messageType: 'sticker',
      body: 'Sticker',
      mediaId: sticker?.id || mediaId,
      mediaMime: sticker?.mime_type || mediaMime || 'image/webp',
    }
  }
  if (type === 'location') {
    const loc = msg.location as { name?: string; address?: string } | undefined
    return { messageType: 'location', body: loc?.name || loc?.address || '[Location]' }
  }
  if (type === 'button') {
    const button = msg.button as { text?: string } | undefined
    return { messageType: 'button', body: String(button?.text || '[Button]').trim() }
  }
  if (type === 'interactive') {
    const interactive = msg.interactive as {
      button_reply?: { title?: string }
      list_reply?: { title?: string }
    } | undefined
    const title = interactive?.button_reply?.title || interactive?.list_reply?.title
    return { messageType: 'interactive', body: title || '[Reply]' }
  }
  if (type === 'reaction') {
    const reaction = msg.reaction as { emoji?: string } | undefined
    return { messageType: 'reaction', body: reaction?.emoji ? `Reacted ${reaction.emoji}` : '[Reaction]' }
  }
  return { messageType: type || 'text', body: `[${type || 'message'}]`, mediaId, mediaMime, mediaFilename }
}

function extFromMime(mime: string, filename?: string) {
  const fromName = filename?.split('.').pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'application/pdf': 'pdf',
  }
  const base = mime.split(';')[0].trim().toLowerCase()
  return map[base] || 'bin'
}

export async function ingestWhatsAppMedia(
  admin: AdminClient,
  opts: {
    token: string
    graphVersion: string
    mediaId: string
    storagePathBase: string
    filename?: string
    provider?: 'meta' | '360dialog'
  },
): Promise<{ mime: string; path: string; filename: string } | null> {
  const { token, graphVersion, mediaId, storagePathBase, filename, provider = 'meta' } = opts
  if (!token || !mediaId) return null
  try {
    const metaUrl =
      provider === '360dialog'
        ? `https://waba-v2.360dialog.io/${mediaId}`
        : `https://graph.facebook.com/${graphVersion}/${mediaId}`
    const authHeaders =
      provider === '360dialog'
        ? { 'D360-API-KEY': token }
        : { Authorization: `Bearer ${token}` }
    const metaRes = await fetch(metaUrl, { headers: authHeaders })
    const meta = (await metaRes.json().catch(() => ({}))) as { url?: string; mime_type?: string; error?: { message?: string } }
    if (!metaRes.ok || !meta.url) {
      console.log(JSON.stringify({ event: 'whatsapp_media_meta_error', mediaId, error: meta.error?.message || metaRes.status }))
      return null
    }
    const fileRes = await fetch(meta.url, { headers: authHeaders })
    if (!fileRes.ok) {
      console.log(JSON.stringify({ event: 'whatsapp_media_download_error', mediaId, status: fileRes.status }))
      return null
    }
    const mime = String(meta.mime_type || fileRes.headers.get('content-type') || 'application/octet-stream')
    const ext = extFromMime(mime, filename)
    const path = `${storagePathBase}.${ext}`
    const bytes = new Uint8Array(await fileRes.arrayBuffer())
    const { error } = await admin.storage.from('whatsapp-media').upload(path, bytes, {
      contentType: mime.split(';')[0],
      upsert: true,
    })
    if (error) {
      console.log(JSON.stringify({ event: 'whatsapp_media_upload_error', path, message: error.message }))
      return null
    }
    return { mime, path, filename: filename || path.split('/').pop() || 'file' }
  } catch (e) {
    console.log(
      JSON.stringify({
        event: 'whatsapp_media_ingest_exception',
        mediaId,
        message: e instanceof Error ? e.message : 'error',
      }),
    )
    return null
  }
}

export type RecordChatInput = {
  phone: string
  customerId?: string | null
  contactName?: string | null
  direction: 'inbound' | 'outbound'
  messageType?: string
  body: string
  status?: string | null
  sendMode?: string | null
  templateId?: string | null
  triggerType?: string | null
  sentBy?: string | null
  staffId?: string | null
  metaMessageId?: string | null
  errorMessage?: string | null
  createdAt?: string
  mediaId?: string | null
  mediaMime?: string | null
  mediaPath?: string | null
  mediaFilename?: string | null
  origin?: 'customer' | 'crm' | 'business_app' | 'automation' | null
  salonId?: string | null
}

export const DEFAULT_INBOX_SALON_ID = 'a0000000-0000-4000-8000-000000000001'

export async function recordChatMessage(admin: AdminClient, input: RecordChatInput): Promise<string | null> {
  const convId = conversationIdFromPhone(input.phone)
  if (!convId) return null

  const createdAt = input.createdAt || new Date().toISOString()
  const body = String(input.body || '').trim() || '[Message]'
  const messageType = input.messageType || 'text'

  if (input.metaMessageId) {
    const { data: existing } = await admin
      .from('whatsapp_chat_messages')
      .select('id')
      .eq('meta_message_id', input.metaMessageId)
      .maybeSingle()
    if (existing?.id) {
      if (input.direction === 'outbound') {
        await admin
          .from('whatsapp_chat_messages')
          .update({
            status: input.status ?? undefined,
            error_message: input.errorMessage ?? undefined,
            body,
          })
          .eq('id', existing.id)
      }
      return existing.id as string
    }
  }

  let customerId = input.customerId ?? null
  let contactName = input.contactName ?? null
  if (!customerId) {
    const match = await findCustomerByPhone(admin, input.phone, input.salonId)
    if (match) {
      customerId = match.id
      contactName = contactName || match.full_name
      if (!input.salonId && match.salon_id) input.salonId = match.salon_id
    }
  } else if (!contactName) {
    const { data: c } = await admin.from('customers').select('full_name, salon_id').eq('id', customerId).maybeSingle()
    contactName = (c?.full_name as string) || null
    if (!input.salonId && c?.salon_id) input.salonId = String(c.salon_id)
  }

  const { data: conv } = await admin
    .from('whatsapp_conversations')
    .select('id, unread_count, customer_id, contact_name, last_inbound_at, salon_id')
    .eq('id', convId)
    .maybeSingle()

  const unread =
    input.direction === 'inbound' ? Number(conv?.unread_count ?? 0) + 1 : Number(conv?.unread_count ?? 0)

  const salonId = input.salonId || (conv?.salon_id as string | undefined) || DEFAULT_INBOX_SALON_ID

  const convRow: Record<string, unknown> = {
    id: convId,
    phone: normalizePhone(input.phone),
    phone_key: phoneKey(input.phone),
    salon_id: salonId,
    last_message_at: createdAt,
    last_message_preview: body.slice(0, 280),
    last_direction: input.direction,
    unread_count: unread,
    updated_at: createdAt,
  }
  if (customerId) convRow.customer_id = customerId
  else if (conv?.customer_id) convRow.customer_id = conv.customer_id
  if (contactName) convRow.contact_name = contactName
  else if (conv?.contact_name) convRow.contact_name = conv.contact_name
  if (input.direction === 'inbound') convRow.last_inbound_at = createdAt
  else if (conv?.last_inbound_at) convRow.last_inbound_at = conv.last_inbound_at
  if (!conv) convRow.created_at = createdAt

  await admin.from('whatsapp_conversations').upsert(convRow)

  const id = `wmc${Date.now()}${Math.random().toString(36).slice(2, 7)}`.slice(0, 40)
  const chatRow: Record<string, unknown> = {
    id,
    conversation_id: convId,
    customer_id: customerId,
    salon_id: salonId,
    staff_id: input.staffId ?? null,
    direction: input.direction,
    message_type: messageType,
    body,
    status: input.status ?? null,
    send_mode: input.sendMode ?? null,
    template_id: input.templateId ?? null,
    trigger_type: input.triggerType ?? null,
    sent_by: input.sentBy ?? null,
    meta_message_id: input.metaMessageId ?? null,
    error_message: input.errorMessage ?? null,
    media_id: input.mediaId ?? null,
    media_mime: input.mediaMime ?? null,
    media_path: input.mediaPath ?? null,
    media_filename: input.mediaFilename ?? null,
    created_at: createdAt,
  }
  if (input.origin) chatRow.origin = input.origin
  let { error } = await admin.from('whatsapp_chat_messages').insert(chatRow)
  if (error && chatRow.origin) {
    delete chatRow.origin
    const retry = await admin.from('whatsapp_chat_messages').insert(chatRow)
    error = retry.error
  }
  if (error) {
    console.log(JSON.stringify({ event: 'whatsapp_inbox_insert_error', message: error.message, convId }))
    return null
  }
  return id
}

export async function updateChatStatus(
  admin: AdminClient,
  metaMessageId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!metaMessageId) return
  const chatPatch: Record<string, unknown> = {}
  if (patch.status != null) chatPatch.status = patch.status
  if (patch.error_message != null) chatPatch.error_message = patch.error_message
  if (Object.keys(chatPatch).length === 0) return
  await admin.from('whatsapp_chat_messages').update(chatPatch).eq('meta_message_id', metaMessageId)
}
