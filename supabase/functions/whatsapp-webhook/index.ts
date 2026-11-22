import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { resolveWhatsAppConnection } from '../_shared/whatsappConnection.ts'
import { getWhatsAppProvider } from '../_shared/whatsappProvider.ts'
import {
  conversationIdFromPhone,
  DEFAULT_INBOX_SALON_ID,
  findCustomerByPhone,
  ingestWhatsAppMedia,
  normalizePhone,
  previewFromInbound,
  recordChatMessage,
  updateChatStatus,
} from '../_shared/whatsappInbox.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const WELCOME_AUTO_REPLY = `أهلاً بِك في Belle 💚

يسعدنا خدمتك ✨

اختاري الخدمة اللي تحتاجينها، وفريقنا بيساعدك في ترتيب حجزك بكل سهولة.

كيف نقدر نخدمك اليوم؟`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const verifyToken = (Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN') || 'belle_crm_wa_verify').trim()

  // Meta webhook verification
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    // 360dialog Hub probes the URL with GET (no hub.challenge). Meta verify stays above.
    return new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)
    const body = await req.json()

    const entries = Array.isArray(body?.entry) && body.entry.length
      ? body.entry
      : Array.isArray(body?.messages) || Array.isArray(body?.statuses)
        ? [
            {
              id: String(body?.id || ''),
              changes: [
                {
                  field: 'messages',
                  value: {
                    messaging_product: 'whatsapp',
                    metadata: body?.metadata || {},
                    contacts: body?.contacts || [],
                    messages: body?.messages || [],
                    statuses: body?.statuses || [],
                  },
                },
              ],
            },
          ]
        : []
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : []
      for (const change of changes) {
        const value = change?.value
        if (!value) continue

        const field = String(change?.field ?? '')
        const metadata = (value.metadata || {}) as { phone_number_id?: string; display_phone_number?: string }
        const connection = await resolveWhatsAppConnection(admin, {
          phoneNumberId: metadata.phone_number_id ? String(metadata.phone_number_id) : null,
          displayPhone: metadata.display_phone_number ? String(metadata.display_phone_number) : null,
        })
        const salonId = connection.salonId
        const graphVersion = (Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v22.0').replace(/^\/+|\/+$/g, '')
        const waProvider = getWhatsAppProvider(connection, graphVersion)

        if (field === 'history') {
          const sharing = Array.isArray(value.history) ? value.history : []
          console.log(
            JSON.stringify({
              event: 'whatsapp_coexistence_history',
              itemCount: sharing.length,
              note: 'Direct 360dialog clients can also download history from the Hub',
            }),
          )
          continue
        }

        if (field === 'smb_app_state_sync') {
          const contacts = Array.isArray(value.contacts) ? value.contacts : []
          console.log(JSON.stringify({ event: 'whatsapp_coexistence_contacts', itemCount: contacts.length }))
          continue
        }

        // Messages sent from the WhatsApp Business app after Coexistence onboarding
        if (field === 'smb_message_echoes') {
          const echoes = Array.isArray(value.message_echoes) ? value.message_echoes : []
          for (const echo of echoes) {
            const to = String(echo.to ?? '')
            if (!to) continue
            const at = echo.timestamp
              ? new Date(Number(echo.timestamp) * 1000).toISOString()
              : new Date().toISOString()
            const match = await findCustomerByPhone(admin, to, salonId)
            const parsed = previewFromInbound(echo as Record<string, unknown>)
            const chatId = await recordChatMessage(admin, {
              phone: to,
              customerId: match?.id ?? null,
              contactName: match?.full_name || null,
              direction: 'outbound',
              messageType: parsed.messageType,
              body: parsed.body,
              status: 'Sent',
              sendMode: 'text',
              triggerType: 'WhatsApp Business App',
              sentBy: 'Business app',
              metaMessageId: String(echo.id || '') || null,
              createdAt: at,
              mediaId: parsed.mediaId ?? null,
              mediaMime: parsed.mediaMime ?? null,
              mediaFilename: parsed.mediaFilename ?? null,
              origin: 'business_app',
              salonId,
            })
            if (chatId && parsed.mediaId && connection.token) {
              const convId = conversationIdFromPhone(to)
              const saved = await ingestWhatsAppMedia(admin, {
                token: connection.token,
                graphVersion,
                mediaId: parsed.mediaId,
                storagePathBase: `${convId || 'inbox'}/${chatId}`,
                filename: parsed.mediaFilename,
                provider: connection.provider,
              })
              if (saved) {
                await admin
                  .from('whatsapp_chat_messages')
                  .update({
                    media_path: saved.path,
                    media_mime: saved.mime,
                    media_filename: saved.filename,
                  })
                  .eq('id', chatId)
              }
            }
          }
          continue
        }

        // Inbound customer messages → store in CRM inbox + open/refresh 24h window
        const inbound = Array.isArray(value.messages) ? value.messages : []
        const contacts = Array.isArray(value.contacts) ? value.contacts : []
        for (const msg of inbound) {
          const from = String(msg.from ?? '')
          if (!from) continue
          const at = msg.timestamp
            ? new Date(Number(msg.timestamp) * 1000).toISOString()
            : new Date().toISOString()

          const match = await findCustomerByPhone(admin, from, salonId)
          const waName = String(
            (
              contacts.find((c: { wa_id?: string; profile?: { name?: string } }) => String(c.wa_id || '') === from) as
                | { profile?: { name?: string } }
                | undefined
            )?.profile?.name || '',
          )
          if (match) {
            await admin
              .from('customers')
              .update({ last_whatsapp_inbound_at: at, updated_at: new Date().toISOString() })
              .eq('id', match.id)
          }

          const parsed = previewFromInbound(msg as Record<string, unknown>)
          const msgType = String(msg.type || '')
          if (msgType !== 'system') {
            const chatId = await recordChatMessage(admin, {
              phone: from,
              customerId: match?.id ?? null,
              contactName: match?.full_name || waName || null,
              direction: 'inbound',
              messageType: parsed.messageType,
              body: parsed.body,
              metaMessageId: String(msg.id || '') || null,
              createdAt: at,
              mediaId: parsed.mediaId ?? null,
              mediaMime: parsed.mediaMime ?? null,
              mediaFilename: parsed.mediaFilename ?? null,
              origin: 'customer',
              salonId,
            })
            if (chatId && parsed.mediaId && connection?.token) {
              const convId = conversationIdFromPhone(from)
              const saved = await ingestWhatsAppMedia(admin, {
                token: connection.token,
                graphVersion,
                mediaId: parsed.mediaId,
                storagePathBase: `${convId || 'inbox'}/${chatId}`,
                filename: parsed.mediaFilename,
                provider: connection.provider,
              })
              if (saved) {
                await admin
                  .from('whatsapp_chat_messages')
                  .update({
                    media_path: saved.path,
                    media_mime: saved.mime,
                    media_filename: saved.filename,
                  })
                  .eq('id', chatId)
              }
            }
          }

          if (msgType && msgType !== 'system' && msgType !== 'reaction' && msgType !== 'button') {
            const welcomeSince = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
            const businessMessageSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            const conversationId = conversationIdFromPhone(from)
            let already = false
            let replyingToBusiness = false

            // A welcome is only appropriate when the customer initiates the
            // conversation. If Belle contacted them recently, their inbound
            // message is a reply and should not trigger an automatic greeting.
            if (conversationId) {
              const { data: recentOutbound } = await admin
                .from('whatsapp_chat_messages')
                .select('id, trigger_type, created_at')
                .eq('conversation_id', conversationId)
                .eq('direction', 'outbound')
                .in('status', ['Sent', 'Delivered', 'Read'])
                .gte('created_at', businessMessageSince)
                .order('created_at', { ascending: false })
                .limit(20)

              already = Boolean(
                recentOutbound?.some(
                  (row) =>
                    row.trigger_type === 'Welcome auto reply' &&
                    String(row.created_at || '') >= welcomeSince,
                ),
              )
              replyingToBusiness = Boolean(
                recentOutbound?.some((row) => row.trigger_type !== 'Welcome auto reply'),
              )
            }

            // Keep compatibility with welcome replies recorded before the
            // inbox tables were introduced.
            if (!already && !replyingToBusiness && match?.id) {
              const { data: recentMessages } = await admin
                .from('whatsapp_messages')
                .select('id, trigger_type, sent_at')
                .eq('customer_id', match.id)
                .in('status', ['Sent', 'Delivered', 'Read'])
                .gte('sent_at', businessMessageSince)
                .order('sent_at', { ascending: false })
                .limit(20)

              already = Boolean(
                recentMessages?.some(
                  (row) =>
                    row.trigger_type === 'Welcome auto reply' &&
                    String(row.sent_at || '') >= welcomeSince,
                ),
              )
              replyingToBusiness = Boolean(
                recentMessages?.some((row) => row.trigger_type !== 'Welcome auto reply'),
              )
            }
            if (!already && !replyingToBusiness) {
              let welcomeClaimId: string | null = null
              try {
                if (connection.token) {
                  const { data: claimId, error: claimError } = await admin.rpc('claim_whatsapp_welcome', {
                    p_salon_id: salonId || DEFAULT_INBOX_SALON_ID,
                    p_customer_id: match?.id ?? null,
                    p_phone: from,
                    p_preview: WELCOME_AUTO_REPLY,
                  })
                  if (claimError) {
                    throw new Error(`Could not claim welcome reply: ${claimError.message}`)
                  }
                  welcomeClaimId = typeof claimId === 'string' ? claimId : null

                  // Another webhook already claimed or sent this conversation's
                  // welcome during the cooldown.
                  if (welcomeClaimId) {
                    const to = normalizePhone(from)
                    const sent = await waProvider.sendText({ to, body: WELCOME_AUTO_REPLY, previewUrl: false })
                    const welcomeMetaId = sent.messageId
                    const welcomeError = sent.ok ? null : sent.error || 'Welcome send failed'
                    await admin
                      .from('whatsapp_messages')
                      .update({
                        status: sent.ok ? 'Sent' : 'Failed',
                        meta_message_id: welcomeMetaId,
                        error_message: welcomeError,
                      })
                      .eq('id', welcomeClaimId)
                    await recordChatMessage(admin, {
                      phone: from,
                      customerId: match?.id ?? null,
                      contactName: match?.full_name || waName || null,
                      direction: 'outbound',
                      messageType: 'text',
                      body: WELCOME_AUTO_REPLY,
                      status: sent.ok ? 'Sent' : 'Failed',
                      sendMode: 'text',
                      templateId: 'wt9',
                      triggerType: 'Welcome auto reply',
                      sentBy: 'Automation',
                      metaMessageId: welcomeMetaId,
                      errorMessage: welcomeError,
                      origin: 'automation',
                      salonId,
                    })
                  }
                }
              } catch (e) {
                if (welcomeClaimId) {
                  await admin
                    .from('whatsapp_messages')
                    .update({
                      status: 'Failed',
                      error_message: e instanceof Error ? e.message : 'Welcome send failed',
                    })
                    .eq('id', welcomeClaimId)
                }
                console.log(
                  JSON.stringify({
                    event: 'welcome_auto_reply_error',
                    message: e instanceof Error ? e.message : 'error',
                  }),
                )
              }
            }
          }

          console.log(
            JSON.stringify({
              event: 'whatsapp_inbound',
              from,
              matchedCustomerId: match?.id ?? null,
              type: msg.type,
            }),
          )
        }

        // Delivery / read / failed statuses
        const statuses = Array.isArray(value.statuses) ? value.statuses : []
        for (const st of statuses) {
          const wamid = String(st.id ?? '')
          const statusRaw = String(st.status ?? '').toLowerCase()
          if (!wamid || !statusRaw) continue

          const errors = Array.isArray(st.errors) ? st.errors : []
          const firstErr = errors[0] as { message?: string; code?: number; error_data?: { details?: string }; title?: string } | undefined

          let crmStatus: string | null = null
          const patch: Record<string, unknown> = {}

          if (statusRaw === 'sent') {
            crmStatus = 'Sent'
          } else if (statusRaw === 'delivered') {
            crmStatus = 'Delivered'
            patch.delivered_at = st.timestamp
              ? new Date(Number(st.timestamp) * 1000).toISOString()
              : new Date().toISOString()
          } else if (statusRaw === 'read') {
            crmStatus = 'Read'
            patch.read_at = st.timestamp
              ? new Date(Number(st.timestamp) * 1000).toISOString()
              : new Date().toISOString()
            if (!patch.delivered_at) {
              patch.delivered_at = patch.read_at
            }
          } else if (statusRaw === 'failed') {
            crmStatus = 'Failed'
            patch.error_message = firstErr?.message || firstErr?.title || 'Meta delivery failed'
            if (firstErr?.code != null) patch.meta_error_code = firstErr.code
          }

          if (crmStatus) patch.status = crmStatus

          if (Object.keys(patch).length) {
            const { error } = await admin.from('whatsapp_messages').update(patch).eq('meta_message_id', wamid)
            await updateChatStatus(admin, wamid, patch)
            if (error) {
              console.log(JSON.stringify({ event: 'whatsapp_status_update_error', wamid, error: error.message }))
            } else {
              console.log(JSON.stringify({ event: 'whatsapp_status_update', wamid, status: crmStatus }))
            }
          }
        }
      }
    }

    // Always 200 so Meta does not retry endlessly
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.log(
      JSON.stringify({
        event: 'whatsapp_webhook_exception',
        message: e instanceof Error ? e.message : 'error',
      }),
    )
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
