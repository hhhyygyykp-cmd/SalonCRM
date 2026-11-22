import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { resolveWhatsAppConnection } from '../_shared/whatsappConnection.ts'
import {
  getWhatsAppProvider,
  list360DialogTemplates,
  ping360Dialog,
  set360DialogWebhook,
} from '../_shared/whatsappProvider.ts'
import { recordChatMessage } from '../_shared/whatsappInbox.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_GRAPH_VERSION = 'v22.0'
const WINDOW_MS = 24 * 60 * 60 * 1000
const WALLET_BUTTON_TEMPLATES = new Set(['my_belle_card_ready', 'service_feedback_wallet'])

const GIFT_RECEIVED_BODY =
  'وصلتك هدية من شخص مُحب 💚\n\nيسعدنا في Belle نوصل لِك هديتك ونرتب تجربتك في الوقت اللي يناسبك ✨\n\nتواصلي معنا لاختيار موعدك.'

const MY_BELLE_LAUNCH_BODY =
  'بيل أقرب لِك 💚\n\nيسعدنا نعرّفك على My Belle ✨\n\nمساحتك الخاصة مع Belle، صممناها عشان تكون حجوزاتك، مزاياك وهداياك كلها في مكان واحد.\n\nفعّلي حسابك الآن وكمّلي بياناتك عشان تبدأ تجربتك معنا.'

/** Meta codes that usually mean free-form text is not allowed (outside 24h / re-engagement) */
const OUTSIDE_WINDOW_CODES = new Set([131047, 130429])

type MetaErrorInfo = {
  message: string
  type?: string
  code?: number
  error_subcode?: number
  fbtrace_id?: string
  details?: string
}

function parseMetaError(payload: unknown): MetaErrorInfo {
  const err = (payload as { error?: Record<string, unknown> })?.error
  if (!err || typeof err !== 'object') {
    return { message: 'WhatsApp API error' }
  }
  return {
    message: String(err.message ?? 'WhatsApp API error'),
    type: err.type != null ? String(err.type) : undefined,
    code: typeof err.code === 'number' ? err.code : err.code != null ? Number(err.code) : undefined,
    error_subcode:
      typeof err.error_subcode === 'number'
        ? err.error_subcode
        : err.error_subcode != null
          ? Number(err.error_subcode)
          : undefined,
    fbtrace_id: err.fbtrace_id != null ? String(err.fbtrace_id) : undefined,
    details:
      err.error_data && typeof err.error_data === 'object'
        ? String((err.error_data as Record<string, unknown>).details ?? '') || undefined
        : undefined,
  }
}

function formatMetaError(info: MetaErrorInfo): string {
  const parts = [info.message]
  if (info.code != null) parts.push(`code=${info.code}`)
  if (info.type) parts.push(`type=${info.type}`)
  if (info.error_subcode != null) parts.push(`subcode=${info.error_subcode}`)
  if (info.details) parts.push(info.details)
  let text = parts.join(' | ')
  // Token issues only — do not treat every OAuthException as auth failure
  if (info.message === 'Authentication Error' || info.code === 190 || info.code === 102) {
    text +=
      ' — Fix: refresh WHATSAPP_TOKEN in Supabase secrets (Meta Access token with whatsapp_business_messaging).'
  } else if (info.code === 132001) {
    text +=
      ' — Fix: create/approve this exact template name + language in Meta Business Manager (WhatsApp → Message templates), then set the CRM template’s Meta name to match.'
  } else if (info.code === 131058) {
    text +=
      ' — Fix: hello_world / sample templates only work on Meta test numbers. Use your approved business templates (e.g. post_visit_thanks).'
  } else if (info.code === 131005) {
    text +=
      ' — Fix: Access denied. Check (1) WHATSAPP_TOKEN still valid, (2) WHATSAPP_PHONE_NUMBER_ID matches Belle Beauty Spa, (3) in Meta App → WhatsApp → API Setup, your personal number is added under “To” / allowed recipients if the app is still in Development mode.'
  } else if (info.code === 132000) {
    text += ' — Fix: template parameter count/order does not match the approved Meta template.'
  } else if (info.code === 131047) {
    text += ' — Customer is outside the 24h window; use an approved template.'
  } else if (info.code === 131026) {
    text +=
      ' — WhatsApp could not deliver this message. Common causes: number is not on WhatsApp, customer blocked Belle, outdated WhatsApp app, Terms not accepted, or a marketing frequency limit. Ask her to message Belle first, then retry later (do not spam-resend).'
  } else if (info.code === 131030) {
    text +=
      ' — Recipient not allowed. If the Meta app is still in Development mode, add this phone under WhatsApp → API Setup → To, or switch the app to Live.'
  } else if (info.code === 131042) {
    text +=
      ' — Meta cannot bill this WhatsApp account. In Meta Business Suite → WhatsApp Manager → Billing, add a payment method to the current WABA (360dialog Coexistence on +971 56 140 4016). Then send again.'
  }
  return text
}

function tokenDiagnostics(token: string | undefined) {
  if (!token) return { tokenPresent: false, tokenLength: 0, tokenLooksLikeMeta: false }
  const trimmed = token.trim()
  return {
    tokenPresent: true,
    tokenLength: trimmed.length,
    tokenLooksLikeMeta: trimmed.startsWith('EAA') || trimmed.startsWith('EAAG') || trimmed.startsWith('EAAB'),
    tokenHadWhitespace: trimmed !== token,
  }
}

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `971${digits.slice(1)}`
  if (digits.length === 9 && digits.startsWith('5')) digits = `971${digits}`
  return digits
}

function isInside24hWindow(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false
  const t = Date.parse(lastInboundAt)
  if (Number.isNaN(t)) return false
  return Date.now() - t < WINDOW_MS
}

function syncedTemplateId(name: string, language: string): string {
  return `meta:${name.trim().toLowerCase()}:${language.trim().toLowerCase()}`
}

function templateDisplayName(name: string): string {
  return name
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function templateBodyParameterCount(templateBody: string): number {
  let count = 0
  for (const match of templateBody.matchAll(/\{\{(\d+)\}\}/g)) {
    count = Math.max(count, Number(match[1] || 0))
  }
  return count
}

function normalizeTemplateBodyParameters(components: unknown[], expectedCount: number): unknown[] {
  const rows = components.filter(
    (component): component is Record<string, unknown> => Boolean(component && typeof component === 'object'),
  )
  const bodyComponent = rows.find((component) => String(component.type || '').toLowerCase() === 'body')
  const nonBodyComponents = rows.filter((component) => String(component.type || '').toLowerCase() !== 'body')
  if (expectedCount === 0) return nonBodyComponents

  const parameters = Array.isArray(bodyComponent?.parameters) ? bodyComponent.parameters : []
  if (!bodyComponent || parameters.length < expectedCount) return components
  return [{ ...bodyComponent, parameters: parameters.slice(0, expectedCount) }, ...nonBodyComponents]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const graphVersion = (Deno.env.get('WHATSAPP_GRAPH_VERSION') || DEFAULT_GRAPH_VERSION).replace(/^\/+|\/+$/g, '')
    const defaultPhoneNumberId = (Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '').trim()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const action = String(body.action ?? 'send')
    const phoneRaw = String(body.phone ?? '')
    let preview = String(body.preview ?? '')
    const templateId = String(body.templateId ?? '')
    const triggerType = String(body.triggerType ?? 'Manual Send')
    const sentBy = String(body.sentBy ?? user.email ?? 'Staff')
    const customerId = body.customerId ? String(body.customerId) : null
    const staffId = body.staffId ? String(body.staffId) : user.id
    // useTemplate is accepted as an alias (older CRM callers)
    const forceTemplate = Boolean(body.forceTemplate || body.useTemplate)
    const forceText = Boolean(body.forceText)
    let metaTemplateName = body.metaTemplateName ? String(body.metaTemplateName) : ''
    let languageCode = String(body.language ?? 'en_US')
    let templateComponents = Array.isArray(body.templateComponents) ? body.templateComponents : []

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: callerProfile } = await admin.from('profiles').select('role, salon_id').eq('id', user.id).maybeSingle()
    const callerSalonId = callerProfile?.salon_id ? String(callerProfile.salon_id) : null
    const { data: settings } = callerSalonId
      ? await admin.from('salon_settings').select('*').eq('salon_id', callerSalonId).maybeSingle()
      : await admin.from('salon_settings').select('*').eq('id', 1).maybeSingle()
    const connection = await resolveWhatsAppConnection(admin, { salonId: callerSalonId })
    const waProvider = getWhatsAppProvider(connection, graphVersion)
    const whatsappTokenRaw = connection.token
    const whatsappToken = whatsappTokenRaw.trim()
    const settingsPhoneId = String(settings?.whatsapp_phone_number_id ?? '').trim()
    const phoneNumberId = connection.phoneNumberId || defaultPhoneNumberId || settingsPhoneId
    const tokenInfoEarly = {
      ...tokenDiagnostics(whatsappTokenRaw),
      connectionSource: connection.source,
      connectionType: connection.connectionType,
      coexistenceEnabled: connection.coexistenceEnabled,
      provider: connection.provider,
      integrationId: connection.integrationId,
    }

    if (action === 'connect_360dialog') {
      try {
        const { data: profile } = await admin.from('profiles').select('role, salon_id').eq('id', user.id).maybeSingle()
        const role = String(profile?.role || '')
        if (role !== 'owner') {
          return new Response(JSON.stringify({ ok: false, error: 'Only the salon owner can connect 360dialog.' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const apiKey = String(body.apiKey ?? '').trim()
        const displayPhone = String(body.displayPhone ?? '').trim()
        if (!apiKey) {
          return new Response(JSON.stringify({ ok: false, error: 'Paste the 360dialog API key from the Hub.' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const ping = await ping360Dialog(apiKey)
        const webhookUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/whatsapp-webhook`
        const webhook = ping.ok
          ? await set360DialogWebhook(apiKey, webhookUrl)
          : { ok: false, error: ping.error || 'Could not reach 360dialog to set webhook' }
        const phoneDigits = normalizePhone(displayPhone || ping.numbers?.[0] || '971561404016')
        const phoneNumberIdStored = String(body.phoneNumberId ?? '').trim() || phoneDigits
        const wabaId = String(body.wabaId ?? ping.wabaId ?? '360dialog')
        const salonId = profile?.salon_id ? String(profile.salon_id) : null

        let deactivate = admin
          .from('whatsapp_integrations')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('is_active', true)
        if (salonId) deactivate = deactivate.eq('salon_id', salonId)
        await deactivate

        let existingQuery = admin.from('whatsapp_integrations').select('id').eq('phone_number_id', phoneNumberIdStored)
        if (salonId) existingQuery = existingQuery.eq('salon_id', salonId)
        const { data: existingRows } = await existingQuery.limit(1)
        const existing = existingRows?.[0]

        const row = {
          waba_id: wabaId,
          phone_number_id: phoneNumberIdStored,
          display_phone_number: displayPhone || ping.numbers?.[0] || null,
          display_name: '360dialog Coexistence',
          connection_type: 'coexistence',
          coexistence_enabled: true,
          status: 'connected',
          is_active: true,
          provider: '360dialog',
          provider_account_id: ping.wabaId,
          connected_by: user.id,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          notes: 'Connected from CRM after 360dialog Hub Coexistence onboarding',
          ...(salonId ? { salon_id: salonId } : {}),
        }

        let integrationId = existing?.id as string | undefined
        if (integrationId) {
          const { error } = await admin.from('whatsapp_integrations').update(row).eq('id', integrationId)
          if (error) {
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
        } else {
          const { data: inserted, error } = await admin.from('whatsapp_integrations').insert(row).select('id').single()
          if (error || !inserted) {
            return new Response(JSON.stringify({ ok: false, error: error?.message || 'Failed to save connection' }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
          integrationId = String(inserted.id)
        }

        const { error: secretError } = await admin.from('whatsapp_integration_secrets').upsert({
          integration_id: integrationId,
          access_token: apiKey,
          token_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        if (secretError) {
          await admin
            .from('whatsapp_integrations')
            .update({ is_active: false, status: 'error', updated_at: new Date().toISOString() })
            .eq('id', integrationId)
          return new Response(
            JSON.stringify({ ok: false, error: `Could not store the 360dialog API key: ${secretError.message}` }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }

        const shownPhone = String(row.display_phone_number || displayPhone || '').trim()
        if (salonId && shownPhone) {
          await admin.from('salon_settings').update({ whatsapp: shownPhone, updated_at: new Date().toISOString() }).eq('salon_id', salonId)
        }

        return new Response(
          JSON.stringify({
            ok: true,
            message: webhook.ok
              ? '360dialog connected. Coexistence webhooks are pointed at this CRM.'
              : `360dialog API key saved. Set the phone webhook in the Hub to ${webhookUrl}${ping.ok ? '' : ` (${webhook.error})`}`,
            webhookUrl,
            webhookSet: webhook.ok,
            webhookError: webhook.error || null,
            pingOk: ping.ok,
            pingError: ping.error || null,
            wabaId,
            displayPhone: row.display_phone_number,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      } catch (connectError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: connectError instanceof Error ? connectError.message : 'Could not save 360dialog connection',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    if (action === 'sync_templates') {
      if (!callerSalonId) {
        return new Response(JSON.stringify({ ok: false, error: 'This account is not assigned to a salon.' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (connection.provider !== '360dialog' || !connection.token) {
        return new Response(JSON.stringify({ ok: false, error: 'Connect 360dialog before syncing templates.' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const remoteTemplates = await list360DialogTemplates(connection.token)
      const approvedByKey = new Map(
        remoteTemplates
          .filter((template) => template.status === 'APPROVED' || template.status === 'ACTIVE')
          .map((template) => [`${template.name.toLowerCase()}:${template.language.toLowerCase()}`, template]),
      )
      const approved = [...approvedByKey.values()]
      const { data: existingTemplates, error: existingError } = await admin
        .from('whatsapp_templates')
        .select('id, name, whatsapp_template_name, language, category, trigger_days, description, body, active')
        .eq('salon_id', callerSalonId)

      if (existingError) {
        return new Response(JSON.stringify({ ok: false, error: existingError.message }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const existingByKey = new Map(
        (existingTemplates ?? []).map((template) => [
          `${String(template.whatsapp_template_name).toLowerCase()}:${String(template.language).toLowerCase()}`,
          template,
        ]),
      )
      const rows = approved.map((template) => {
        const key = `${template.name.toLowerCase()}:${template.language.toLowerCase()}`
        const existing = existingByKey.get(key)
        return {
          salon_id: callerSalonId,
          id: existing?.id || syncedTemplateId(template.name, template.language),
          name: existing?.name || templateDisplayName(template.name),
          whatsapp_template_name: template.name,
          language: template.language,
          category: template.category || existing?.category || 'UTILITY',
          trigger_days: existing?.trigger_days ?? null,
          description: existing?.description || 'Synced automatically from 360dialog.',
          body: template.body || existing?.body || `[${templateDisplayName(template.name)}]`,
          active: existing?.active ?? true,
        }
      })

      if (rows.length) {
        const { error: syncError } = await admin
          .from('whatsapp_templates')
          .upsert(rows, { onConflict: 'salon_id,id' })
        if (syncError) {
          return new Response(JSON.stringify({ ok: false, error: syncError.message }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      const imported = approved.filter((template) => {
        const key = `${template.name.toLowerCase()}:${template.language.toLowerCase()}`
        return !existingByKey.has(key)
      }).length
      return new Response(
        JSON.stringify({
          ok: true,
          imported,
          updated: approved.length - imported,
          totalApproved: approved.length,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Connection check — lists approved templates (no message sent)
    if (action === 'diagnose') {
      if (connection.provider === '360dialog') {
        const ping = connection.token ? await ping360Dialog(connection.token) : { ok: false, error: 'API key missing' }
        const templates = connection.token ? await list360DialogTemplates(connection.token) : []
        const approved = templates.filter((t) => t.status === 'APPROVED' || t.status === 'ACTIVE')
        const webhookUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/whatsapp-webhook`
        return new Response(
          JSON.stringify({
            ok: Boolean(ping.ok && connection.token),
            error: ping.ok ? undefined : ping.error,
            diagnose: {
              ...tokenInfoEarly,
              provider: '360dialog',
              phoneNumberId,
              phoneNumberIdSource: connection.source,
              displayPhoneNumber: connection.displayPhoneNumber,
              connectionType: connection.connectionType,
              coexistenceEnabled: connection.coexistenceEnabled,
              wabaId: ping.wabaId || connection.wabaId,
              webhookUrl,
              currentWebhook: ping.webhookUrl || null,
              approvedTemplates: approved.map((t) => `${t.name}/${t.language}`),
              allTemplates: templates.map((t) => `${t.name}/${t.language}/${t.status}`),
              hasPostVisitThanks: approved.some((t) => t.name === 'post_visit_thanks'),
              tip: ping.ok
                ? '360dialog Coexistence is live. Keep the WhatsApp Business app installed. After Hub onboarding, set the number webhook if it is not already this CRM URL.'
                : ping.error,
            },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      const wabaFromEnv = (Deno.env.get('WHATSAPP_BUSINESS_ACCOUNT_ID') || '').trim()
      const wabaFromSettings = String(settings?.whatsapp_business_account_id ?? '').trim()
      let wabaId = connection.wabaId || wabaFromEnv || wabaFromSettings || null
      let wabaSource = connection.wabaId
        ? 'integration'
        : wabaFromEnv
          ? 'secret'
          : wabaFromSettings
            ? 'settings'
            : null
      let phoneLookupError: string | null = null
      let templates: Array<{ name: string; language: string; status: string }> = []
      let templatesError: string | null = null

      if (!whatsappToken) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'WHATSAPP_TOKEN secret is missing in Supabase.',
            diagnose: { ...tokenInfoEarly, phoneNumberId, wabaId },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      if (!phoneNumberId) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Phone Number ID missing (set WHATSAPP_PHONE_NUMBER_ID secret or save it in WhatsApp settings).',
            diagnose: { ...tokenInfoEarly, phoneNumberId: null, wabaId },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (!wabaId) {
        try {
          const r = await fetch(
            `https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=whatsapp_business_account`,
            { headers: { Authorization: `Bearer ${whatsappToken}` } },
          )
          const j = await r.json().catch(() => ({}))
          if (!r.ok) {
            phoneLookupError = formatMetaError(parseMetaError(j))
          } else {
            const id = (j as { whatsapp_business_account?: { id?: string } })?.whatsapp_business_account?.id
            if (id) {
              wabaId = String(id)
              wabaSource = 'phone_lookup'
            }
          }
        } catch (e) {
          phoneLookupError = e instanceof Error ? e.message : 'phone lookup failed'
        }
      }

      if (wabaId) {
        try {
          const url =
            `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates` +
            `?fields=name,status,language&limit=250`
          const r = await fetch(url, { headers: { Authorization: `Bearer ${whatsappToken}` } })
          const j = await r.json().catch(() => ({}))
          if (!r.ok) {
            templatesError = formatMetaError(parseMetaError(j))
          } else {
            const rows = Array.isArray((j as { data?: unknown[] }).data)
              ? (j as { data: Record<string, unknown>[] }).data
              : []
            templates = rows
              .map((t) => ({
                name: String(t.name ?? ''),
                language: String(t.language ?? ''),
                status: String(t.status ?? '').toUpperCase(),
              }))
              .filter((t) => t.name)
          }
        } catch (e) {
          templatesError = e instanceof Error ? e.message : 'template list failed'
        }
      }

      const approved = templates.filter((t) => t.status === 'APPROVED' || t.status === 'ACTIVE')
      const hasPostVisit = approved.some((t) => t.name === 'post_visit_thanks')
      const hasGiftReceived = approved.some((t) => t.name === 'gift_received')
      const crmTemplates = await admin
        .from('whatsapp_templates')
        .select('id, name, whatsapp_template_name, language, active')
        .order('id')

      return new Response(
        JSON.stringify({
          ok: Boolean(whatsappToken && phoneNumberId && !templatesError),
          diagnose: {
            ...tokenInfoEarly,
            phoneNumberId,
            phoneNumberIdSource: connection.source,
            displayPhoneNumber: connection.displayPhoneNumber,
            connectionType: connection.connectionType,
            coexistenceEnabled: connection.coexistenceEnabled,
            wabaId,
            wabaSource,
            phoneLookupError,
            templatesError,
            approvedTemplates: approved.map((t) => `${t.name}/${t.language}`),
            allTemplates: templates.map((t) => `${t.name}/${t.language}/${t.status}`),
            hasPostVisitThanks: hasPostVisit,
            hasGiftReceived,
            hasMyBelleLaunch: approved.some((t) => t.name === 'my_belle_launch'),
            crmTemplates: crmTemplates.data ?? [],
            tip: !hasPostVisit
              ? 'Create and approve a Meta template named exactly post_visit_thanks (language en_US), then set CRM template wt6 Meta name to match.'
              : 'post_visit_thanks is approved — if sends still fail, check Message log for parameter/order errors (code 132000) or Development-mode recipient restrictions (code 131030).',
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (action === 'mark_read') {
      const conversationId = String(body.conversationId ?? '')
      if (!conversationId) {
        return new Response(JSON.stringify({ ok: false, error: 'conversationId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      await admin
        .from('whatsapp_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
      const { data: lastIn } = await admin
        .from('whatsapp_chat_messages')
        .select('meta_message_id')
        .eq('conversation_id', conversationId)
        .eq('direction', 'inbound')
        .not('meta_message_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const wamid = String(lastIn?.meta_message_id || '')
      if (wamid) {
        try {
          await waProvider.markRead({ messageId: wamid })
        } catch {
          // read receipts are best-effort
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!phoneRaw || (!preview && !(forceTemplate || metaTemplateName))) {
      return new Response(JSON.stringify({ ok: false, error: 'Phone and message text (or template) are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const to = normalizePhone(phoneRaw)

    // Resolve customer + 24h window from last inbound WhatsApp
    let customer:
      | {
          id: string
          full_name: string
          phone: string
          whatsapp_phone: string
          loyalty_tier: string
          lifetime_spend: number | string | null
          wallet_token: string | null
          last_whatsapp_inbound_at: string | null
        }
      | null = null

    if (customerId) {
      let customerQuery = admin
        .from('customers')
        .select(
          'id, full_name, phone, whatsapp_phone, loyalty_tier, lifetime_spend, wallet_token, last_whatsapp_inbound_at',
        )
        .eq('id', customerId)
      if (callerSalonId) customerQuery = customerQuery.eq('salon_id', callerSalonId)
      const { data } = await customerQuery.maybeSingle()
      customer = data as typeof customer
    }
    if (!customer) {
      let customersQuery = admin
        .from('customers')
        .select(
          'id, full_name, phone, whatsapp_phone, loyalty_tier, lifetime_spend, wallet_token, last_whatsapp_inbound_at',
        )
      if (callerSalonId) customersQuery = customersQuery.eq('salon_id', callerSalonId)
      const { data: list } = await customersQuery.limit(5000)
      customer =
        ((list ?? []).find((c) => {
          const p = normalizePhone(String(c.whatsapp_phone || c.phone || ''))
          return p === to || p.slice(-9) === to.slice(-9)
        }) as typeof customer) || null
    }

    const inWindowFromCustomer = isInside24hWindow(customer?.last_whatsapp_inbound_at)
    let inWindow = inWindowFromCustomer
    let conversationContactName = ''
    const convId = `wc${to.slice(-9)}`
    if (to.slice(-9).length >= 8) {
      let conversationQuery = admin
        .from('whatsapp_conversations')
        .select('last_inbound_at, contact_name')
        .eq('id', convId)
      if (callerSalonId) conversationQuery = conversationQuery.eq('salon_id', callerSalonId)
      const { data: conv } = await conversationQuery.maybeSingle()
      conversationContactName = String(conv?.contact_name || '').trim()
      if (!inWindow) {
        inWindow = isInside24hWindow((conv?.last_inbound_at as string | null) ?? null)
      }
    }
    // Outside 24h: templates only. Inside: free-form unless forceTemplate.
    // Always prefer template when caller forces it or we know the window is closed.
    let sendMode: 'text' | 'template' =
      forceText ? 'text' : forceTemplate || !inWindow ? 'template' : 'text'

    const AUTO_DEDUPE = new Set([
      'After service',
      'Wallet card after service',
      'Upgrade to Premium',
      'Upgrade to Gold',
      'Gold restored',
      'Premium restored',
      'AED 1,000 reward',
      'Gift received',
      'Welcome auto reply',
    ])
    if (customer?.id && AUTO_DEDUPE.has(triggerType)) {
      const minutes = /upgrade|restored/i.test(triggerType) ? 24 * 60 : 15
      const since = new Date(Date.now() - minutes * 60 * 1000).toISOString()
      const { data: recent } = await admin
        .from('whatsapp_messages')
        .select('id')
        .eq('customer_id', customer.id)
        .eq('trigger_type', triggerType)
        .in('status', ['Queued', 'Sent', 'Delivered', 'Read'])
        .gte('sent_at', since)
        .limit(1)
      if (recent?.length) {
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'duplicate_recent' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Resolve the synced Meta template definition so parameter counts always
    // match, even when an older frontend sends generic components.
    let crmTemplateBody = ''
    if (templateId) {
      let templateQuery = admin
        .from('whatsapp_templates')
        .select('whatsapp_template_name, language, body')
        .eq('id', templateId)
      if (callerSalonId) templateQuery = templateQuery.eq('salon_id', callerSalonId)
      const { data: tpl } = await templateQuery.maybeSingle()
      if (tpl) {
        crmTemplateBody = String(tpl.body || '')
        if (!metaTemplateName) metaTemplateName = String(tpl.whatsapp_template_name || '')
        if (!body.language) languageCode = String(tpl.language || 'en_US')
      }
    }
    // Use Meta's approved language as-is. Do not rewrite "en" to "en_US" —
    // several Belle templates are approved as language "en" only.
    // Never silently substitute post_visit_thanks — that template’s header is
    // “How did we do?” and must only go out when staff chose it (or a visit).
    const explicitPostVisit =
      templateId === 'wt6' || /post-?visit/i.test(triggerType) || metaTemplateName === 'post_visit_thanks'
    if (!metaTemplateName && explicitPostVisit) metaTemplateName = 'post_visit_thanks'
    if (!metaTemplateName && (templateId === 'wt7' || /gift received/i.test(triggerType))) {
      metaTemplateName = 'gift_received'
      if (!body.language) languageCode = 'ar'
    }
    if ((metaTemplateName === 'gift_received' || templateId === 'wt7') && !preview.trim()) {
      preview = GIFT_RECEIVED_BODY
    }
    if ((metaTemplateName === 'my_belle_launch' || templateId === 'wt8') && !preview.trim()) {
      preview = MY_BELLE_LAUNCH_BODY
    }

    // Meta sample templates — never use these on a live business number
    const SAMPLE_TEMPLATES = new Set(['hello_world', '3p_direct_integration_'])
    const TEMPLATES_WITHOUT_PARAMS = new Set([
      'hello_world',
      '3p_direct_integration_',
      'my_belle_launch',
      'welcome_auto_reply',
      'service_feedback',
      'reengagement_30_days',
      'reengagement_60_days',
      'reengagement_90_days_offer',
      'gift_received',
      'birthday_regular',
      'birthday_gold',
      'birthday_premium',
      'membership_upgrade_gold',
      'membership_upgrade_premium',
      'membership_downgrade_warning',
      'membership_level_updated',
      'membership_gold_restored',
      'membership_premium_restored',
      'gift_expiry_reminder',
    ])
    if (SAMPLE_TEMPLATES.has(metaTemplateName)) {
      metaTemplateName = ''
      templateComponents = []
    }
    if (TEMPLATES_WITHOUT_PARAMS.has(metaTemplateName)) {
      templateComponents = []
    }
    if (crmTemplateBody) {
      templateComponents = normalizeTemplateBodyParameters(
        templateComponents,
        templateBodyParameterCount(crmTemplateBody),
      )
    }

    let walletPreparationError: string | null = null

    // Auto-fill body params when CRM didn't send components
    if (sendMode === 'template' && templateComponents.length === 0 && customer) {
      const salonName = settings?.salon_name || 'Belle Beauty Lounge'
      const walletBase = (Deno.env.get('WALLET_PUBLIC_BASE_URL') || 'https://hilarious-chaja-07e7b3.netlify.app').replace(
        /\/$/,
        '',
      )
      const walletLink =
        customer.wallet_token && walletBase ? `${walletBase}/w/${customer.wallet_token}` : customer.wallet_token || ''
      const firstName = customer.full_name.split(' ')[0] || customer.full_name
      let texts: string[] = []
      if (WALLET_BUTTON_TEMPLATES.has(metaTemplateName)) {
        let walletToken = String(customer.wallet_token || '')
        if (!walletToken) {
          walletToken = crypto.randomUUID()
          const { error: walletTokenError } = await admin
            .from('customers')
            .update({ wallet_token: walletToken })
            .eq('id', customer.id)
          if (walletTokenError) {
            walletPreparationError = `Could not create the customer wallet link: ${walletTokenError.message}`
          }
        }
        if (walletToken) {
          templateComponents = [
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: walletToken }],
            },
          ]
        }
      } else if (metaTemplateName === 'post_visit_thanks') {
        texts = [salonName, firstName, customer.loyalty_tier || 'Regular', walletLink || salonName]
      } else if (metaTemplateName === 'visit_thanks') {
        texts = [salonName, firstName, customer.loyalty_tier || 'Regular']
      } else if (metaTemplateName === 'reminder_30_day') {
        texts = [firstName, salonName]
      } else if (metaTemplateName === 'reminder_60_day' || metaTemplateName === 'reminder_90_day') {
        texts = [firstName, '30', salonName]
      } else if (metaTemplateName === 'spending_reward_1000') {
        texts = [walletLink || `${walletBase}/w/sample`]
      } else if (
        metaTemplateName === 'gift_received' ||
        metaTemplateName === 'my_belle_launch' ||
        TEMPLATES_WITHOUT_PARAMS.has(metaTemplateName)
      ) {
        texts = []
      } else if (metaTemplateName === 'booking_payment_request') {
        texts = []
      } else if (metaTemplateName === 'booking_confirmed' || metaTemplateName === 'appointment_reminder_one_hour') {
        texts = []
      } else if (crmTemplateBody) {
        const expectedCount = templateBodyParameterCount(crmTemplateBody)
        const genericValues = [firstName, salonName, '30']
        texts = Array.from({ length: expectedCount }, (_, index) => genericValues[index] || '—')
      }
      if (texts.length) {
        templateComponents = [
          {
            type: 'body',
            parameters: texts.map((text) => ({ type: 'text', text: text || '—' })),
          },
        ]
      }
    }
    if (sendMode === 'template' && templateComponents.length === 0 && crmTemplateBody) {
      const expectedCount = templateBodyParameterCount(crmTemplateBody)
      if (expectedCount > 0) {
        const contactName = customer?.full_name || conversationContactName || 'عميلتنا'
        const firstName = contactName.trim().split(/\s+/)[0] || 'عميلتنا'
        const salonName = String(settings?.salon_name || 'Belle Beauty Lounge')
        const genericValues = [firstName, salonName, '30']
        templateComponents = [
          {
            type: 'body',
            parameters: Array.from({ length: expectedCount }, (_, index) => ({
              type: 'text',
              text: genericValues[index] || '—',
            })),
          },
        ]
      }
    }

    const messageId = `wm${Date.now()}`
    let status = 'Sent'
    let errorMessage: string | null = walletPreparationError
    if (walletPreparationError) status = 'Failed'
    let metaMessageId: string | null = null
    let metaErrorCode: number | null = null
    let metaErrorSubcode: number | null = null
    let metaErrorType: string | null = null
    let metaDebug: Record<string, unknown> | null = null
    const tokenInfo = tokenDiagnostics(whatsappTokenRaw)

    const metaHeaders = {
      Authorization: `Bearer ${whatsappToken}`,
      'Content-Type': 'application/json',
    }

    type MetaTpl = { name: string; language: string; status: string }

    async function resolveWabaId(): Promise<string | null> {
      if (connection.wabaId) return connection.wabaId
      const fromEnv = (Deno.env.get('WHATSAPP_BUSINESS_ACCOUNT_ID') || '').trim()
      if (fromEnv) return fromEnv
      const fromSettings = String(settings?.whatsapp_business_account_id ?? '').trim()
      if (fromSettings) return fromSettings
      try {
        const r = await fetch(
          `https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=whatsapp_business_account`,
          { headers: { Authorization: `Bearer ${whatsappToken}` } },
        )
        const j = await r.json().catch(() => ({}))
        const id = (j as { whatsapp_business_account?: { id?: string } })?.whatsapp_business_account?.id
        if (id) return String(id)
      } catch {
        // ignore
      }
      return null
    }

    async function fetchApprovedTemplates(wabaId: string): Promise<MetaTpl[]> {
      const url =
        `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates` +
        `?fields=name,status,language&limit=250`
      const r = await fetch(url, { headers: { Authorization: `Bearer ${whatsappToken}` } })
      const j = await r.json().catch(() => ({}))
      const rows = Array.isArray((j as { data?: unknown[] }).data) ? (j as { data: Record<string, unknown>[] }).data : []
      return rows
        .map((t) => ({
          name: String(t.name ?? ''),
          language: String(t.language ?? ''),
          status: String(t.status ?? '').toUpperCase(),
        }))
        .filter((t) => t.name && (t.status === 'APPROVED' || t.status === 'ACTIVE'))
    }

    async function ensureGiftReceivedTemplate(wabaId: string): Promise<{
      status: string
      language: string
      error?: string
    }> {
      const url =
        `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates` +
        `?fields=name,status,language&limit=250`
      const listed = await fetch(url, { headers: { Authorization: `Bearer ${whatsappToken}` } })
      const listedJson = await listed.json().catch(() => ({}))
      const rows = Array.isArray((listedJson as { data?: unknown[] }).data)
        ? (listedJson as { data: Record<string, unknown>[] }).data
        : []
      const existing = rows.find((t) => String(t.name ?? '') === 'gift_received')
      if (existing) {
        return {
          status: String(existing.status ?? '').toUpperCase(),
          language: String(existing.language ?? 'ar'),
        }
      }
      const created = await fetch(`https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates`, {
        method: 'POST',
        headers: metaHeaders,
        body: JSON.stringify({
          name: 'gift_received',
          language: 'ar',
          category: 'UTILITY',
          allow_category_change: true,
          components: [{ type: 'BODY', text: GIFT_RECEIVED_BODY }],
        }),
      })
      const createdJson = await created.json().catch(() => ({}))
      if (!created.ok) {
        return { status: 'ERROR', language: 'ar', error: formatMetaError(parseMetaError(createdJson)) }
      }
      return {
        status: String((createdJson as { status?: string }).status ?? 'PENDING').toUpperCase(),
        language: 'ar',
      }
    }

    function pickUsableTemplate(list: MetaTpl[], preferredName: string): MetaTpl | null {
      if (!list.length || !preferredName) return null
      // Never auto-pick Meta sample templates on a live number
      const pool = list.filter((t) => !SAMPLE_TEMPLATES.has(t.name))
      if (!pool.length) return null
      if (SAMPLE_TEMPLATES.has(preferredName)) return null
      return (
        pool.find((t) => t.name === preferredName && t.language === languageCode) ||
        pool.find((t) => t.name === preferredName && (t.language === 'en_US' || t.language === 'en')) ||
        pool.find((t) => t.name === preferredName) ||
        null
      )
    }

    async function dispatchSend(
      mode: 'text' | 'template',
      opts?: { name?: string; language?: string; components?: unknown[] },
    ) {
      const sent =
        mode === 'template'
          ? await waProvider.sendTemplate({
              to,
              name: opts?.name || metaTemplateName,
              language: opts?.language || languageCode,
              components: opts?.components ?? templateComponents,
            })
          : await waProvider.sendText({ to, body: preview || ' ', previewUrl: true })
      return {
        res: { ok: sent.ok, status: sent.httpStatus },
        payload: sent.payload,
        graphUrl: sent.requestUrl,
        messageId: sent.messageId,
        error: sent.error,
      }
    }

    if (connection.provider === '360dialog' && !whatsappToken) {
      status = 'Failed'
      errorMessage = '360dialog API key is missing. Connect the channel in WhatsApp → API settings.'
      metaDebug = { ...tokenInfo, provider: '360dialog', phoneNumberIdUsed: phoneNumberId || null, graphVersion, inWindow, sendMode }
    } else if (connection.provider !== '360dialog' && !whatsappToken) {
      status = 'Failed'
      errorMessage = 'WHATSAPP_TOKEN secret is missing.'
      metaDebug = { ...tokenInfo, provider: 'meta', phoneNumberIdUsed: phoneNumberId || null, graphVersion, inWindow, sendMode }
    } else if (connection.provider !== '360dialog' && !phoneNumberId) {
      status = 'Failed'
      errorMessage = 'WHATSAPP_PHONE_NUMBER_ID is missing.'
      metaDebug = { ...tokenInfo, phoneNumberIdUsed: null, graphVersion, inWindow, sendMode }
    } else if (sendMode === 'template' && !metaTemplateName) {
      status = 'Failed'
      errorMessage =
        'Custom text cannot be sent until this customer messages you (24-hour window). Pick an approved template in the CRM, or wait for their reply. The old “How did we do?” thank-you is no longer sent automatically.'
      metaDebug = { ...tokenInfo, phoneNumberIdUsed: phoneNumberId, graphVersion, inWindow, sendMode }
    } else {
      // Resolve real approved template name/language from Meta before sending
      let availableTemplates: MetaTpl[] = []
      let wabaId: string | null = null
      if (sendMode === 'template' && connection.provider === '360dialog' && whatsappToken) {
        try {
          const listed = await list360DialogTemplates(whatsappToken)
          availableTemplates = listed
            .filter((t) => t.status === 'APPROVED' || t.status === 'ACTIVE')
            .map((t) => ({ name: t.name, language: t.language, status: t.status }))
          const picked = pickUsableTemplate(availableTemplates, metaTemplateName)
          if (picked) {
            metaTemplateName = picked.name
            languageCode = picked.language
          }
        } catch {
          /* send with CRM template name */
        }
      } else if (sendMode === 'template') {
        wabaId = await resolveWabaId()
        if (wabaId && whatsappToken) {
          fetch(`https://graph.facebook.com/${graphVersion}/${wabaId}/subscribed_apps`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${whatsappToken}` },
          }).catch(() => null)
        }
        if (wabaId) {
          try {
            availableTemplates = await fetchApprovedTemplates(wabaId)
            const picked = pickUsableTemplate(availableTemplates, metaTemplateName)
            if (picked) {
              if (picked.name !== metaTemplateName || picked.language !== languageCode) {
                metaDebug = {
                  ...(metaDebug || {}),
                  templateAutoResolved: {
                    from: { name: metaTemplateName, language: languageCode },
                    to: { name: picked.name, language: picked.language },
                    available: availableTemplates.map((t) => `${t.name}/${t.language}`),
                  },
                }
              }
              metaTemplateName = picked.name
              languageCode = picked.language
              if (TEMPLATES_WITHOUT_PARAMS.has(metaTemplateName) || metaTemplateName === 'hello_world') {
                templateComponents = []
              }
            } else if (metaTemplateName === 'gift_received') {
              const ensured = await ensureGiftReceivedTemplate(wabaId)
              metaDebug = { ...(metaDebug || {}), giftTemplateEnsure: ensured }
              if (ensured.status === 'APPROVED' || ensured.status === 'ACTIVE') {
                languageCode = ensured.language || 'ar'
                templateComponents = []
                availableTemplates = await fetchApprovedTemplates(wabaId)
              } else if (inWindow) {
                sendMode = 'text'
                if (!preview.trim()) preview = GIFT_RECEIVED_BODY
              } else {
                status = 'Failed'
                errorMessage = ensured.error
                  ? `Could not prepare gift WhatsApp template: ${ensured.error}`
                  : 'Gift receiver template is waiting for Meta approval. Ask her to message Belle first, or retry after the template is approved in WhatsApp Manager.'
              }
            } else if (availableTemplates.length) {
              // Prefer exact name; otherwise stop before Meta returns opaque 132001
              status = 'Failed'
              errorMessage =
                `Template "${metaTemplateName}" (lang=${languageCode}) is not approved on this WhatsApp Business Account. ` +
                `Approved: ${availableTemplates.map((t) => `${t.name}/${t.language}`).join(', ') || '(none)'}. ` +
                `Fix: in Meta → WhatsApp → Message templates, create/approve a template with that exact name, ` +
                `or edit CRM Templates → Meta name to match one of the approved names above.`
              metaDebug = {
                ...(metaDebug || {}),
                ...tokenInfo,
                templateNotFoundInWaba: {
                  wanted: `${metaTemplateName}/${languageCode}`,
                  available: availableTemplates.map((t) => `${t.name}/${t.language}`),
                },
                phoneNumberIdUsed: phoneNumberId,
                wabaId,
              }
            } else {
              metaDebug = {
                ...(metaDebug || {}),
                templateNotFoundInWaba: {
                  wanted: `${metaTemplateName}/${languageCode}`,
                  available: [],
                },
              }
            }
          } catch (e) {
            metaDebug = {
              ...(metaDebug || {}),
              templateListError: e instanceof Error ? e.message : 'list failed',
            }
          }
        }
      }

      // Skip Meta call when we already know the template is missing
      if (status === 'Failed' && errorMessage) {
        // fall through to insert Failed row
      } else {

      let { res, payload, graphUrl } = await dispatchSend(sendMode)

      if (
        !res.ok &&
        sendMode === 'template' &&
        templateComponents.length
      ) {
        const paramErr = parseMetaError(payload)
        const expectsNoBodyParameters =
          /body:.*expected number of params \(0\)/i.test(paramErr.details || '') ||
          /body:.*expected \(0\)/i.test(paramErr.details || '')
        if ((paramErr.code === 132000 || /parameter/i.test(paramErr.message)) && expectsNoBodyParameters) {
          templateComponents = []
          const retryNoParam = await dispatchSend('template', { components: [] })
          res = retryNoParam.res
          payload = retryNoParam.payload
          graphUrl = retryNoParam.graphUrl
        }
      }

      // If free-form rejected because outside window, automatically retry with template
      if (!res.ok && sendMode === 'text') {
        const metaErr = parseMetaError(payload)
        const outside =
          (metaErr.code != null && OUTSIDE_WINDOW_CODES.has(metaErr.code)) ||
          /24\s*hour|re-engagement|outside.*window|not.*allowed/i.test(metaErr.message)

        if (outside && metaTemplateName) {
          sendMode = 'template'
          // Resolve templates if we haven't yet
          if (!availableTemplates.length) {
            wabaId = wabaId || (await resolveWabaId())
            if (wabaId) {
              try {
                availableTemplates = await fetchApprovedTemplates(wabaId)
                const picked = pickUsableTemplate(availableTemplates, metaTemplateName)
                if (picked) {
                  metaTemplateName = picked.name
                  languageCode = picked.language
                  templateComponents = TEMPLATES_WITHOUT_PARAMS.has(metaTemplateName) ? [] : templateComponents
                }
              } catch {
                // keep current
              }
            }
          }
          const retry = await dispatchSend('template')
          res = retry.res
          payload = retry.payload
          graphUrl = retry.graphUrl
          metaDebug = {
            ...(metaDebug || {}),
            ...tokenInfo,
            graphUrl,
            phoneNumberIdUsed: phoneNumberId,
            graphVersion,
            inWindow,
            sendMode,
            textAttemptFailed: {
              message: metaErr.message,
              type: metaErr.type,
              code: metaErr.code,
              error_subcode: metaErr.error_subcode,
              fbtrace_id: metaErr.fbtrace_id,
            },
            autoSwitchedToTemplate: true,
          }
        } else if (outside) {
          status = 'Failed'
          errorMessage =
            'Custom text cannot be sent until this customer messages you (24-hour window). Pick an approved template in the CRM, or wait for their reply.'
          metaErrorCode = metaErr.code ?? null
          metaErrorSubcode = metaErr.error_subcode ?? null
          metaErrorType = metaErr.type ?? null
          metaDebug = {
            ...(metaDebug || {}),
            ...tokenInfo,
            graphUrl,
            phoneNumberIdUsed: phoneNumberId,
            inWindow,
            sendMode,
            textAttemptFailed: {
              message: metaErr.message,
              type: metaErr.type,
              code: metaErr.code,
              error_subcode: metaErr.error_subcode,
              fbtrace_id: metaErr.fbtrace_id,
            },
          }
        }
      }

      // If template name/language wrong, retry same template name with other approved languages only
      if (!res.ok && sendMode === 'template') {
        const metaErr = parseMetaError(payload)
        if (metaErr.code === 132001 && inWindow) {
          const textRetry = await dispatchSend('text')
          if (textRetry.res.ok) {
            sendMode = 'text'
            res = textRetry.res
            payload = textRetry.payload
            graphUrl = textRetry.graphUrl
            metaDebug = {
              ...(metaDebug || {}),
              templateMissingTextFallback: true,
              missingTemplate: `${metaTemplateName}/${languageCode}`,
            }
          }
        }
        if (!res.ok && (metaErr.code === 132001 || metaErr.code === 131058)) {
          wabaId = wabaId || (await resolveWabaId())
          if (wabaId && !availableTemplates.length) {
            try {
              availableTemplates = await fetchApprovedTemplates(wabaId)
            } catch {
              // ignore
            }
          }
          const candidates = availableTemplates.filter(
            (t) => t.name === metaTemplateName && t.language !== languageCode && !SAMPLE_TEMPLATES.has(t.name),
          )
          for (const cand of candidates) {
            const comps = TEMPLATES_WITHOUT_PARAMS.has(cand.name) ? [] : templateComponents
            const retry = await dispatchSend('template', {
              name: cand.name,
              language: cand.language,
              components: comps,
            })
            if (retry.res.ok) {
              languageCode = cand.language
              templateComponents = comps
              res = retry.res
              payload = retry.payload
              graphUrl = retry.graphUrl
              metaDebug = {
                ...(metaDebug || {}),
                templateLanguageRetrySucceeded: { name: cand.name, language: cand.language },
                available: availableTemplates.map((t) => `${t.name}/${t.language}`),
              }
              break
            }
            res = retry.res
            payload = retry.payload
            graphUrl = retry.graphUrl
          }
        }
      }

      if (!res.ok && status !== 'Failed') {
        const metaErr = parseMetaError(payload)
        status = 'Failed'
        errorMessage = formatMetaError(metaErr)
        if (sendMode === 'template') {
          errorMessage += ` (tried template "${metaTemplateName}" lang=${languageCode})`
          if (availableTemplates.length) {
            errorMessage += ` | approved on WABA: ${availableTemplates.map((t) => `${t.name}/${t.language}`).join(', ')}`
          } else if (!wabaId) {
            errorMessage +=
              ' | Tip: set WHATSAPP_BUSINESS_ACCOUNT_ID in Supabase secrets (or WhatsApp → API settings) so the CRM can list your real template names.'
          }
        }
        metaErrorCode = metaErr.code ?? null
        metaErrorSubcode = metaErr.error_subcode ?? null
        metaErrorType = metaErr.type ?? null
        metaDebug = {
          ...(metaDebug || {}),
          ...tokenInfo,
          graphUrl,
          phoneNumberIdUsed: phoneNumberId,
          graphVersion,
          inWindow,
          sendMode,
          metaTemplateName,
          languageCode,
          wabaId,
          availableTemplates: availableTemplates.map((t) => `${t.name}/${t.language}`),
          metaHttpStatus: res.status,
          metaError: {
            message: metaErr.message,
            type: metaErr.type,
            code: metaErr.code,
            error_subcode: metaErr.error_subcode,
            fbtrace_id: metaErr.fbtrace_id,
          },
        }
      } else if (res.ok) {
        metaMessageId = (payload as { messages?: { id?: string }[] })?.messages?.[0]?.id ?? null
        status = 'Sent'
        // Free-form succeeded ⇒ Meta window is open; remember it for the CRM UI
        if (sendMode === 'text' && customer?.id) {
          await admin
            .from('customers')
            .update({
              last_whatsapp_inbound_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', customer.id)
        }
        metaDebug = {
          ...(metaDebug || {}),
          ...tokenInfo,
          graphUrl,
          phoneNumberIdUsed: phoneNumberId,
          graphVersion,
          inWindow,
          sendMode,
          metaTemplateName,
          languageCode,
          metaHttpStatus: res.status,
          wamid: metaMessageId,
        }
      }
      } // end Meta send (skipped when template already known missing)
    }

    const row = {
      id: messageId,
      customer_id: customer?.id ?? customerId,
      staff_id: staffId,
      template_id: templateId || (sendMode === 'template' ? metaTemplateName : 'manual'),
      phone: phoneRaw,
      trigger_type: triggerType,
      status,
      sent_by: sentBy,
      sent_at: new Date().toISOString(),
      error_message: errorMessage,
      preview: preview || `[template:${metaTemplateName}]`,
      meta_message_id: metaMessageId,
      send_mode: sendMode,
      meta_error_code: metaErrorCode,
      meta_error_subcode: metaErrorSubcode,
      meta_error_type: metaErrorType,
      ...(callerSalonId || connection.salonId
        ? { salon_id: callerSalonId || connection.salonId }
        : {}),
    }

    const { data: inserted, error: insertError } = await admin.from('whatsapp_messages').insert(row).select('*').single()
    if (insertError) {
      return new Response(JSON.stringify({ ok: false, error: insertError.message, meta: metaDebug }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await recordChatMessage(admin, {
      phone: phoneRaw || to || '',
      customerId: customer?.id ?? customerId,
      contactName: customer?.full_name ?? null,
      direction: 'outbound',
      messageType: sendMode === 'template' ? 'template' : 'text',
      body: preview || `[template:${metaTemplateName}]`,
      status,
      sendMode,
      templateId: templateId || (sendMode === 'template' ? metaTemplateName : 'manual'),
      triggerType,
      sentBy,
      staffId,
      metaMessageId,
      errorMessage,
      origin: triggerType === 'Inbox reply' || triggerType === 'Manual Send' ? 'crm' : 'automation',
      salonId: callerSalonId || connection.salonId,
    })

    // After every visit WhatsApp attempt, also send AED 1,000 reward if they crossed a band.
    // Runs even when After service itself fails (unapproved thank-you template).
    if (
      triggerType === 'After service' &&
      customer?.id &&
      whatsappToken &&
      (connection.provider === '360dialog' || Boolean(phoneNumberId))
    ) {
      try {
        const tier = String(customer.loyalty_tier || '')
        if (tier === 'Gold' || tier === 'Premium') {
          const { data: latest } = await admin
            .from('visits')
            .select('final_total, created_at')
            .eq('customer_id', customer.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          const visitAgeMs = latest?.created_at ? Date.now() - Date.parse(String(latest.created_at)) : Infinity
          const visitTotal = Number(latest?.final_total ?? 0)
          const nextSpend = Number(customer.lifetime_spend ?? 0)
          const prevSpend = nextSpend - visitTotal
          const nextBands = Math.floor(Math.max(0, nextSpend) / 1000)
          const prevBands = Math.floor(Math.max(0, prevSpend) / 1000)
          const earned = visitAgeMs <= 24 * 60 * 60 * 1000 && nextBands > prevBands && nextBands >= 2
          if (earned) {
            const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
            const { data: recentReward } = await admin
              .from('whatsapp_messages')
              .select('id')
              .eq('customer_id', customer.id)
              .eq('trigger_type', 'AED 1,000 reward')
              .in('status', ['Queued', 'Sent', 'Delivered', 'Read'])
              .gte('sent_at', since)
              .limit(1)
            if (!recentReward?.length) {
              const walletBase = (Deno.env.get('WALLET_PUBLIC_BASE_URL') || 'https://hilarious-chaja-07e7b3.netlify.app').replace(
                /\/$/,
                '',
              )
              let walletToken = customer.wallet_token
              if (!walletToken) {
                walletToken = crypto.randomUUID()
                await admin.from('customers').update({ wallet_token: walletToken }).eq('id', customer.id)
              }
              const walletLink = `${walletBase}/w/${walletToken}`
              const rewardPreview =
                'لديك مكافأة جديدة من Belle 💚\n\nوصل إنفاقك المؤهل إلى 1,000 درهم، واستحقيتِ خدمة واحدة مجانية من اختيارك ✨\n\nاختاري خدمتك واستمتعي بمكافأتك.'
              const rewardComponents = [
                { type: 'body', parameters: [{ type: 'text', text: walletLink }] },
              ]
              let rewardSent = await waProvider.sendTemplate({
                to,
                name: 'spending_reward_1000',
                language: 'ar',
                components: rewardComponents,
              })
              const rewardErr = parseMetaError(rewardSent.payload)
              if (!rewardSent.ok && (rewardErr.code === 132000 || /parameter/i.test(rewardErr.message))) {
                rewardSent = await waProvider.sendTemplate({
                  to,
                  name: 'spending_reward_1000',
                  language: 'ar',
                  components: [],
                })
              }
              const rewardMeta = parseMetaError(rewardSent.payload)
              const rewardOk = rewardSent.ok
              const rewardStatus = rewardOk ? 'Sent' : 'Failed'
              const rewardError = rewardOk ? null : rewardSent.error || formatMetaError(rewardMeta)
              const rewardMetaId = rewardSent.messageId
              await admin.from('whatsapp_messages').insert({
                id: `wm${Date.now()}`,
                customer_id: customer.id,
                staff_id: staffId,
                template_id: 'wt18',
                phone: phoneRaw || to,
                trigger_type: 'AED 1,000 reward',
                status: rewardStatus,
                sent_by: sentBy,
                sent_at: new Date().toISOString(),
                preview: rewardPreview,
                error_message: rewardError,
                meta_message_id: rewardMetaId,
                send_mode: 'template',
                meta_error_code: rewardMeta.code ?? null,
                meta_error_subcode: rewardMeta.error_subcode ?? null,
                meta_error_type: rewardMeta.type ?? null,
                ...(callerSalonId || connection.salonId
                  ? { salon_id: callerSalonId || connection.salonId }
                  : {}),
              })
              await recordChatMessage(admin, {
                phone: phoneRaw || to || '',
                customerId: customer.id,
                contactName: customer.full_name ?? null,
                direction: 'outbound',
                messageType: 'template',
                body: rewardPreview,
                status: rewardStatus,
                sendMode: 'template',
                templateId: 'wt18',
                triggerType: 'AED 1,000 reward',
                sentBy,
                staffId,
                metaMessageId: rewardMetaId,
                errorMessage: rewardError,
                origin: 'automation',
                salonId: callerSalonId || connection.salonId,
              })
            }
          }
        }
      } catch (rewardFollowUpError) {
        console.log(
          JSON.stringify({
            event: 'thousand_reward_followup_failed',
            message: rewardFollowUpError instanceof Error ? rewardFollowUpError.message : 'failed',
          }),
        )
      }
    }

    return new Response(
      JSON.stringify({
        ok: status !== 'Failed',
        error: status === 'Failed' ? errorMessage : undefined,
        inWindow,
        sendMode,
        meta: metaDebug,
        message: inserted,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (e) {
    console.log(
      JSON.stringify({
        event: 'whatsapp_send_exception',
        message: e instanceof Error ? e.message : 'Unexpected error',
      }),
    )
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'Unexpected error' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
