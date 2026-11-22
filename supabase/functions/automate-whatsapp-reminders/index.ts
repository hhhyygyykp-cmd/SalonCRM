import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { resolveWhatsAppConnection } from '../_shared/whatsappConnection.ts'
import { getWhatsAppProvider } from '../_shared/whatsappProvider.ts'
import { recordChatMessage } from '../_shared/whatsappInbox.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const DEFAULT_GRAPH_VERSION = 'v22.0'
const WINDOW_MS = 24 * 60 * 60 * 1000

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `971${digits.slice(1)}`
  if (digits.length === 9 && digits.startsWith('5')) digits = `971${digits}`
  return digits
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24))
}

function isInside24hWindow(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false
  const t = Date.parse(lastInboundAt)
  if (Number.isNaN(t)) return false
  return Date.now() - t < WINDOW_MS
}

function fillBody(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
}

const TIER_LAPSE_DAYS = 45
const TIER_WARNING_LEAD_DAYS = 7
const GIFT_VALID_DAYS = 90
const GIFT_EXPIRY_LEAD_DAYS = 7

type AdminClient = ReturnType<typeof createClient>

async function sendUtilityTemplate(
  admin: AdminClient,
  connection: Awaited<ReturnType<typeof resolveWhatsAppConnection>>,
  graphVersion: string,
  input: {
    customerId: string
    fullName: string
    phoneRaw: string
    templateId: string
    metaName: string
    language: string
    triggerType: string
    preview: string
  },
): Promise<'sent' | 'failed' | 'skipped'> {
  const to = normalizePhone(input.phoneRaw)
  if (!to) return 'skipped'
  const provider = getWhatsAppProvider(connection, graphVersion)
  const sent = await provider.sendTemplate({
    to,
    name: input.metaName,
    language: input.language,
  })
  const status = sent.ok ? 'Sent' : 'Failed'
  const errorMessage = sent.ok ? null : sent.error || 'Send failed'
  const metaMessageId = sent.messageId
  await admin.from('whatsapp_messages').insert({
    id: `wm${Date.now()}-${input.customerId}`.slice(0, 40),
    customer_id: input.customerId,
    template_id: input.templateId,
    phone: input.phoneRaw,
    trigger_type: input.triggerType,
    status,
    sent_by: 'Automation',
    sent_at: new Date().toISOString(),
    error_message: errorMessage,
    preview: input.preview,
    meta_message_id: metaMessageId,
    send_mode: 'template',
    ...(connection.salonId ? { salon_id: connection.salonId } : {}),
  })
  await recordChatMessage(admin, {
    phone: input.phoneRaw,
    customerId: input.customerId,
    contactName: input.fullName,
    direction: 'outbound',
    messageType: 'template',
    body: input.preview,
    status,
    sendMode: 'template',
    templateId: input.templateId,
    triggerType: input.triggerType,
    sentBy: 'Automation',
    metaMessageId,
    errorMessage,
    origin: 'automation',
    salonId: connection.salonId,
  })
  return sent.ok ? 'sent' : 'failed'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const cronSecret = (Deno.env.get('CRON_SECRET') || '').trim()
    const incoming =
      req.headers.get('x-cron-secret')?.trim() ||
      new URL(req.url).searchParams.get('secret')?.trim() ||
      ''
    // Allow service-role bearer OR shared cron secret
    const auth = req.headers.get('Authorization') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const okSecret = cronSecret && incoming === cronSecret
    const okService = serviceKey && auth === `Bearer ${serviceKey}`
    if (!okSecret && !okService) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(supabaseUrl, serviceKey)
    const graphVersion = (Deno.env.get('WHATSAPP_GRAPH_VERSION') || DEFAULT_GRAPH_VERSION).replace(
      /^\/+|\/+$/g,
      '',
    )
    const connection = await resolveWhatsAppConnection(admin)
    const whatsappToken = connection.token
    const phoneId = connection.phoneNumberId

    const { data: settings } = await admin.from('salon_settings').select('*').eq('id', 1).maybeSingle()
    if (!settings?.automation_enabled) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'automation_disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const reminderDays = (settings.reminder_days as number[] | null) ?? [30, 60, 90]
    const sortedDays = [...reminderDays].filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => b - a)
    if (!sortedDays.length) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no_reminder_days' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const salonName = String(settings.salon_name || 'Belle Beauty Lounge')

    const { data: templates } = await admin.from('whatsapp_templates').select('*').eq('active', true)
    const byTrigger = new Map<number, (typeof templates)[number]>()
    for (const t of templates ?? []) {
      if (t.trigger_days != null) byTrigger.set(Number(t.trigger_days), t)
    }

    // Prefer CRM templates wt1/wt2/wt3 by known days
    const fallbackMeta: Record<number, { id: string; name: string; lang: string; body: string }> = {
      30: {
        id: 'wt1',
        name: 'reengagement_30_days',
        lang: 'ar',
        body: 'حان وقتك مع Belle 💚\n\nمرّ شهر على آخر موعد لِك، ويسعدنا نكون جزء من لحظات عنايتك من جديد ✨\n\nاختاري موعدك، وخلّي العناية توصلك.',
      },
      60: {
        id: 'wt2',
        name: 'reengagement_60_days',
        lang: 'ar',
        body: 'لحظات العناية تستحق وقتها 💚\n\nمرّ بعض الوقت على آخر موعد لِك مع Belle، وحبّينا نذكّرك بوقت خاص لِك ✨\n\nنحن دائماً بالقرب منك.',
      },
      90: {
        id: 'wt3',
        name: 'reengagement_90_days_offer',
        lang: 'ar',
        body: 'دائماً لِك مكان في Belle 💚\n\nمرّ وقت على آخر تجربة لِك معنا، ويسعدنا أن نرحب بِك من جديد ✨\n\nخصم 15% بانتظارك على حجزك القادم، لتعودي للحظاتك الخاصة مع Belle 💚',
      },
    }

    const { data: customers, error: custErr } = await admin
      .from('customers')
      .select(
        'id, full_name, phone, whatsapp_phone, loyalty_tier, last_visit_at, last_whatsapp_inbound_at, wallet_token',
      )
      .not('last_visit_at', 'is', null)
      .limit(8000)

    if (custErr) throw new Error(custErr.message)

    const { data: recentMessages } = await admin
      .from('whatsapp_messages')
      .select('customer_id, template_id, trigger_type, sent_at, status')
      .in('trigger_type', ['Auto 30-day reminder', 'Auto 60-day reminder', 'Auto 90-day reminder', 'Auto reminder'])
      .order('sent_at', { ascending: false })
      .limit(5000)

    const sentSinceVisit = new Set<string>()
    for (const m of recentMessages ?? []) {
      if (!m.customer_id) continue
      // key: customerId|templateId
      sentSinceVisit.add(`${m.customer_id}|${m.template_id}`)
      sentSinceVisit.add(`${m.customer_id}|${m.trigger_type}`)
    }

    // Also load any auto reminders per customer after last visit more carefully
    const results: Array<Record<string, unknown>> = []
    let sent = 0
    let skipped = 0
    let failed = 0

    if (!whatsappToken || (connection.provider !== '360dialog' && !phoneId)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            connection.provider === '360dialog'
              ? '360dialog API key missing. Connect the channel in WhatsApp settings.'
              : 'WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    for (const c of customers ?? []) {
      const days = daysSince(c.last_visit_at as string)
      if (days == null) {
        skipped += 1
        continue
      }

      // Pick the highest threshold the customer has reached
      const matchedDay = sortedDays.find((d) => days >= d)
      if (matchedDay == null) {
        skipped += 1
        continue
      }

      const tplRow = byTrigger.get(matchedDay)
      const fb = fallbackMeta[matchedDay]
      const templateId = String(tplRow?.id || fb?.id || `wt-auto-${matchedDay}`)
      let metaName = String(tplRow?.whatsapp_template_name || fb?.name || `reminder_${matchedDay}_day`)
      if (metaName === 'hello_world' || metaName === '3p_direct_integration_') {
        metaName = fb?.name || `reminder_${matchedDay}_day`
      }
      const language = String(tplRow?.language || fb?.lang || 'ar')
      const bodyTpl = String(tplRow?.body || fb?.body || '')
      const triggerType = `Auto ${matchedDay}-day reminder`

      if (
        sentSinceVisit.has(`${c.id}|${templateId}`) ||
        sentSinceVisit.has(`${c.id}|${triggerType}`)
      ) {
        skipped += 1
        continue
      }

      // Double-check DB for this customer + trigger after last visit
      const { data: already } = await admin
        .from('whatsapp_messages')
        .select('id')
        .eq('customer_id', c.id)
        .eq('trigger_type', triggerType)
        .gte('sent_at', c.last_visit_at as string)
        .limit(1)
      if (already?.length) {
        skipped += 1
        continue
      }

      const phoneRaw = String(c.whatsapp_phone || c.phone || '')
      const to = normalizePhone(phoneRaw)
      if (!to) {
        skipped += 1
        continue
      }

      const vars = {
        customer_name: String(c.full_name || '').split(' ')[0] || String(c.full_name || 'there'),
        salon_name: salonName,
        loyalty_tier: String(c.loyalty_tier || 'Regular'),
        days_since_visit: String(days),
      }
      const preview = fillBody(bodyTpl, vars)
      const sendResult = await sendUtilityTemplate(admin, connection, graphVersion, {
        customerId: String(c.id),
        fullName: String(c.full_name || ''),
        phoneRaw,
        templateId,
        metaName,
        language,
        triggerType,
        preview,
      })

      sentSinceVisit.add(`${c.id}|${templateId}`)
      sentSinceVisit.add(`${c.id}|${triggerType}`)

      if (sendResult === 'sent') sent += 1
      else if (sendResult === 'failed') failed += 1
      else skipped += 1

      results.push({
        customerId: c.id,
        name: c.full_name,
        days,
        matchedDay,
        sendMode: 'template',
        status: sendResult === 'sent' ? 'Sent' : sendResult === 'failed' ? 'Failed' : 'Skipped',
      })
    }

    const dubaiNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' }))
    const bMonth = dubaiNow.getMonth() + 1
    const bDay = dubaiNow.getDate()
    const year = dubaiNow.getFullYear()
    let birthdaysSent = 0
    const { data: bdayCustomers } = await admin
      .from('customers')
      .select('id, full_name, phone, whatsapp_phone, loyalty_tier, birthday')
      .not('birthday', 'is', null)
      .limit(8000)

    for (const c of bdayCustomers ?? []) {
      const parts = String(c.birthday || '').slice(0, 10).split('-')
      if (parts.length < 3) continue
      if (Number(parts[1]) !== bMonth || Number(parts[2]) !== bDay) continue

      const triggerType = `Birthday ${year}`
      const { data: alreadyBday } = await admin
        .from('whatsapp_messages')
        .select('id')
        .eq('customer_id', c.id)
        .eq('trigger_type', triggerType)
        .limit(1)
      if (alreadyBday?.length) continue

      const phoneRaw = String(c.whatsapp_phone || c.phone || '')
      const to = normalizePhone(phoneRaw)
      if (!to) continue

      const tier = String(c.loyalty_tier || 'Regular')
      const metaName =
        tier === 'Premium' ? 'birthday_premium' : tier === 'Gold' ? 'birthday_gold' : 'birthday_regular'
      const tpl = (templates ?? []).find((t) => String(t.whatsapp_template_name) === metaName)
      const language = String(tpl?.language || 'ar')
      const preview = String(tpl?.body || '')
      const templateId = String(tpl?.id || (tier === 'Premium' ? 'wt15' : tier === 'Gold' ? 'wt14' : 'wt13'))

      const bdayResult = await sendUtilityTemplate(admin, connection, graphVersion, {
        customerId: String(c.id),
        fullName: String(c.full_name || ''),
        phoneRaw,
        templateId,
        metaName,
        language,
        triggerType,
        preview,
      })
      if (bdayResult === 'sent') {
        sent += 1
        birthdaysSent += 1
      } else if (bdayResult === 'failed') failed += 1
    }

    const tplByMeta = new Map((templates ?? []).map((t) => [String(t.whatsapp_template_name), t]))
    const warningTpl = tplByMeta.get('membership_downgrade_warning')
    const levelTpl = tplByMeta.get('membership_level_updated')
    const giftExpiryTpl = tplByMeta.get('gift_expiry_reminder')
    let downgradeWarnings = 0
    let levelsLapsed = 0
    let giftExpiryReminders = 0
    const warningFrom = TIER_LAPSE_DAYS - TIER_WARNING_LEAD_DAYS

    for (const c of customers ?? []) {
      const days = daysSince(c.last_visit_at as string)
      if (days == null) continue
      const tier = String(c.loyalty_tier || 'Regular')
      if (tier !== 'Gold' && tier !== 'Premium') continue
      const phoneRaw = String(c.whatsapp_phone || c.phone || '')
      const lastVisit = String(c.last_visit_at)

      if (days >= warningFrom && days < TIER_LAPSE_DAYS) {
        const triggerType = `Downgrade warning ${lastVisit.slice(0, 10)}`
        const { data: already } = await admin
          .from('whatsapp_messages')
          .select('id')
          .eq('customer_id', c.id)
          .eq('trigger_type', triggerType)
          .limit(1)
        if (already?.length) continue
        const result = await sendUtilityTemplate(admin, connection, graphVersion, {
          customerId: String(c.id),
          fullName: String(c.full_name || ''),
          phoneRaw,
          templateId: String(warningTpl?.id || 'wt19'),
          metaName: 'membership_downgrade_warning',
          language: String(warningTpl?.language || 'ar'),
          triggerType,
          preview: String(warningTpl?.body || ''),
        })
        if (result === 'sent') {
          sent += 1
          downgradeWarnings += 1
        } else if (result === 'failed') failed += 1
        continue
      }

      if (days >= TIER_LAPSE_DAYS && days < TIER_LAPSE_DAYS + 7) {
        const triggerType = `Membership level updated ${lastVisit.slice(0, 10)}`
        const { data: already } = await admin
          .from('whatsapp_messages')
          .select('id')
          .eq('customer_id', c.id)
          .eq('trigger_type', triggerType)
          .limit(1)
        if (already?.length) continue
        const { error: lapseError } = await admin
          .from('customers')
          .update({
            loyalty_tier: 'Regular',
            loyalty_lapsed_from: tier,
            updated_at: new Date().toISOString(),
          })
          .eq('id', c.id)
        if (lapseError) {
          failed += 1
          continue
        }
        const result = await sendUtilityTemplate(admin, connection, graphVersion, {
          customerId: String(c.id),
          fullName: String(c.full_name || ''),
          phoneRaw,
          templateId: String(levelTpl?.id || 'wt20'),
          metaName: 'membership_level_updated',
          language: String(levelTpl?.language || 'ar'),
          triggerType,
          preview: String(levelTpl?.body || ''),
        })
        if (result === 'sent') {
          sent += 1
          levelsLapsed += 1
        } else if (result === 'failed') failed += 1
      }
    }

    const { data: openGifts } = await admin
      .from('gifts')
      .select('id, receiver_customer_id, purchased_at, status')
      .eq('status', 'valid')
      .limit(4000)
    const giftReceivers = new Map((customers ?? []).map((c) => [String(c.id), c]))
    if ((openGifts ?? []).length) {
      const { data: extraReceivers } = await admin
        .from('customers')
        .select('id, full_name, phone, whatsapp_phone')
        .in(
          'id',
          [...new Set((openGifts ?? []).map((g) => String(g.receiver_customer_id)))].slice(0, 500),
        )
      for (const r of extraReceivers ?? []) giftReceivers.set(String(r.id), r as typeof extraReceivers[number])
    }

    for (const gift of openGifts ?? []) {
      const age = daysSince(gift.purchased_at as string)
      if (age == null) continue
      const daysLeft = GIFT_VALID_DAYS - age
      if (daysLeft < 1 || daysLeft > GIFT_EXPIRY_LEAD_DAYS) continue
      const triggerType = `Gift expiry reminder ${gift.id}`
      const { data: already } = await admin
        .from('whatsapp_messages')
        .select('id')
        .eq('trigger_type', triggerType)
        .limit(1)
      if (already?.length) continue
      const receiver = giftReceivers.get(String(gift.receiver_customer_id))
      if (!receiver) continue
      const result = await sendUtilityTemplate(admin, connection, graphVersion, {
        customerId: String(receiver.id),
        fullName: String(receiver.full_name || ''),
        phoneRaw: String(receiver.whatsapp_phone || receiver.phone || ''),
        templateId: String(giftExpiryTpl?.id || 'wt23'),
        metaName: 'gift_expiry_reminder',
        language: String(giftExpiryTpl?.language || 'ar'),
        triggerType,
        preview: String(giftExpiryTpl?.body || ''),
      })
      if (result === 'sent') {
        sent += 1
        giftExpiryReminders += 1
      } else if (result === 'failed') failed += 1
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sent,
        failed,
        skipped,
        birthdaysSent,
        downgradeWarnings,
        levelsLapsed,
        giftExpiryReminders,
        reminderDays: sortedDays,
        results: results.slice(0, 50),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
