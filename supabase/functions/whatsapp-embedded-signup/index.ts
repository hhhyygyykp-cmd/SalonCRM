import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  classifyTokenStatus,
  displayBusinessWhatsApp,
  exchangeLongLivedToken,
  persistRefreshedToken,
  resolveWhatsAppConnection,
} from '../_shared/whatsappConnection.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_GRAPH_VERSION = 'v22.0'
const SIXTY_DAYS_SEC = 60 * 24 * 60 * 60
const STANDARD_MIGRATION_EVENTS = new Set(['FINISH', 'FINISH_ONLY_WABA'])
const COEXISTENCE_EVENT = 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'

type Json = Record<string, unknown>

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function graphVersion() {
  return (Deno.env.get('WHATSAPP_GRAPH_VERSION') || DEFAULT_GRAPH_VERSION).replace(/^\/+|\/+$/g, '')
}

function graphUrl(path: string, params?: Record<string, string>) {
  const u = new URL(`https://graph.facebook.com/${graphVersion()}${path.startsWith('/') ? path : `/${path}`}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  }
  return u.toString()
}

async function graphGet(path: string, token: string, params?: Record<string, string>) {
  const res = await fetch(graphUrl(path, params), {
    headers: { Authorization: `Bearer ${token}` },
  })
  const payload = await res.json().catch(() => ({}))
  return { res, payload }
}

async function graphPost(path: string, token: string, body?: Json) {
  const res = await fetch(graphUrl(path), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await res.json().catch(() => ({}))
  return { res, payload }
}

function metaErrorMessage(payload: unknown): string {
  const err = (payload as { error?: { message?: string; code?: number; type?: string } })?.error
  if (!err) return 'Meta Graph API error'
  const parts = [err.message || 'Meta Graph API error']
  if (err.code != null) parts.push(`code=${err.code}`)
  if (err.type) parts.push(`type=${err.type}`)
  return parts.join(' | ')
}

function isExpiredTokenError(payload: unknown): boolean {
  const err = (payload as { error?: { message?: string; code?: number } })?.error
  if (!err) return false
  if (err.code === 190 || err.code === 102) return true
  return /session has expired|error validating access token/i.test(String(err.message ?? ''))
}

const EXPIRED_TOKEN_FIX =
  'WHATSAPP_TOKEN expired (Meta code 190). Sending now uses 360dialog on +971 56 140 4016 — reconnect from WhatsApp → API settings with the Hub API key instead of a Meta Cloud API token.'

function publicIntegration(row: Record<string, unknown> | null) {
  if (!row) return null
  const tokenExpiresAt = (row.token_expires_at as string) || null
  return {
    id: row.id,
    businessId: row.business_id ?? null,
    wabaId: row.waba_id,
    phoneNumberId: row.phone_number_id,
    displayPhoneNumber: row.display_phone_number ?? null,
    displayName: row.display_name ?? null,
    connectionType: row.connection_type,
    coexistenceEnabled: Boolean(row.coexistence_enabled),
    status: row.status,
    isActive: Boolean(row.is_active),
    connectedAt: row.connected_at,
    metaEvent: row.meta_event ?? null,
    tokenExpiresAt,
    tokenStatus: row.token_status || classifyTokenStatus(tokenExpiresAt),
    lastTokenRefreshAt: row.last_token_refresh_at ?? null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appId = (Deno.env.get('META_APP_ID') || '').trim()
    const appSecret = (Deno.env.get('META_APP_SECRET') || '').trim()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ ok: false, error: 'Unauthorized' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) return json({ ok: false, error: 'Unauthorized' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)
    const body = (await req.json().catch(() => ({}))) as Json
    const action = String(body.action ?? 'status')

    if (action === 'status') {
      const { data: active } = await admin
        .from('whatsapp_integrations')
        .select(
          'id, business_id, waba_id, phone_number_id, display_phone_number, display_name, connection_type, coexistence_enabled, status, is_active, connected_at, meta_event, token_expires_at, token_status, last_token_refresh_at',
        )
        .eq('is_active', true)
        .maybeSingle()

      const { data: settings } = await admin.from('salon_settings').select('*').eq('id', 1).maybeSingle()
      const connection = await resolveWhatsAppConnection(admin)
      const sendPhoneId = String(
        active?.phone_number_id || connection.phoneNumberId || settings?.whatsapp_phone_number_id || '',
      ).trim()
      const sendDisplay = displayBusinessWhatsApp(
        (active?.display_phone_number as string) ||
          connection.displayPhoneNumber ||
          (settings?.whatsapp as string) ||
          null,
      )

      let tokenStatus: 'valid' | 'expiring' | 'expired' | 'unknown' = connection.tokenStatus
      let tokenError: string | null = null
      if (connection.token && sendPhoneId) {
        const { res: probeRes, payload: probePayload } = await graphGet(`/${sendPhoneId}`, connection.token, {
          fields: 'id,display_phone_number',
        })
        if (!probeRes.ok && isExpiredTokenError(probePayload)) {
          tokenStatus = 'expired'
          tokenError = EXPIRED_TOKEN_FIX
        } else if (probeRes.ok) {
          tokenStatus = 'valid'
        }
      }

      let integration = publicIntegration(active as Record<string, unknown> | null)
      if (integration) {
        integration = { ...integration, displayPhoneNumber: sendDisplay, tokenStatus }
      } else if (sendPhoneId && connection.token) {
        integration = {
          id: 'cloud-api-secret',
          businessId: null,
          wabaId: connection.wabaId || settings?.whatsapp_business_account_id || null,
          phoneNumberId: sendPhoneId,
          displayPhoneNumber: sendDisplay,
          displayName: settings?.salon_name ?? null,
          connectionType: 'cloud_api',
          coexistenceEnabled: false,
          status: tokenStatus === 'expired' ? 'error' : 'connected',
          isActive: true,
          connectedAt: null,
          metaEvent: null,
          tokenExpiresAt: null,
          tokenStatus,
          lastTokenRefreshAt: null,
        }
      }

      const { data: others } = await admin
        .from('whatsapp_integrations')
        .select(
          'id, phone_number_id, display_phone_number, connection_type, coexistence_enabled, status, is_active, connected_at',
        )
        .eq('is_active', false)
        .order('connected_at', { ascending: false })
        .limit(10)

      const inactiveConnections = (others ?? []).filter(
        (row) => String(row.phone_number_id || '') !== sendPhoneId,
      )

      return json({
        ok: true,
        connected: Boolean(integration?.phoneNumberId && (active?.phone_number_id || connection.token)),
        tokenError,
        integration,
        legacySettings: {
          phoneNumberId: sendPhoneId || null,
          wabaId: connection.wabaId || settings?.whatsapp_business_account_id || null,
          displayPhone: sendDisplay,
        },
        inactiveConnections,
        config: {
          hasAppSecret: Boolean(appSecret),
          hasAppId: Boolean(appId),
        },
      })
    }

    if (action === 'test') {
      const { data: active } = await admin
        .from('whatsapp_integrations')
        .select(
          'id, phone_number_id, waba_id, connection_type, coexistence_enabled, display_phone_number, token_expires_at',
        )
        .eq('is_active', true)
        .maybeSingle()
      if (!active?.phone_number_id) {
        const connection = await resolveWhatsAppConnection(admin)
        if (!connection.token || !connection.phoneNumberId) {
          return json({
            ok: false,
            error: 'WhatsApp Cloud API is missing WHATSAPP_TOKEN or Phone Number ID.',
          })
        }
        const { res, payload } = await graphGet(`/${connection.phoneNumberId}`, connection.token, {
          fields: 'id,display_phone_number,verified_name,is_on_biz_app,platform_type,quality_rating',
        })
        if (!res.ok) {
          return json({
            ok: false,
            error: isExpiredTokenError(payload) ? EXPIRED_TOKEN_FIX : metaErrorMessage(payload),
            phoneNumberId: connection.phoneNumberId,
          })
        }
        return json({
          ok: true,
          phoneNumberId: connection.phoneNumberId,
          wabaId: connection.wabaId,
          displayPhoneNumber: displayBusinessWhatsApp(
            String((payload as Json).display_phone_number ?? connection.displayPhoneNumber ?? ''),
          ),
          displayName: (payload as Json).verified_name ?? null,
          isOnBizApp: Boolean((payload as Json).is_on_biz_app),
          platformType: String((payload as Json).platform_type ?? ''),
          coexistenceVerified: false,
          connectionType: 'cloud_api',
          message: 'Sending uses the active 360dialog number +971 56 140 4016.',
        })
      }
      const { data: secret } = await admin
        .from('whatsapp_integration_secrets')
        .select('access_token, token_expires_at')
        .eq('integration_id', active.id)
        .maybeSingle()
      let token = String(secret?.access_token ?? '').trim()
      if (!token) {
        return json({ ok: false, error: 'Connection is missing a server-side access token. Reconnect WhatsApp Business.' })
      }

      const expiresAt = String(secret?.token_expires_at || active.token_expires_at || '') || null
      if (classifyTokenStatus(expiresAt) === 'expired') {
        return json({
          ok: false,
          error: 'The 60-day Meta token has expired. Click Connect WhatsApp Business again to refresh access.',
          tokenStatus: 'expired',
          tokenExpiresAt: expiresAt,
        })
      }
      if (classifyTokenStatus(expiresAt) === 'expiring') {
        const exchanged = await exchangeLongLivedToken(token)
        if (exchanged) {
          await persistRefreshedToken(admin, String(active.id), exchanged.token, exchanged.expiresIn)
          token = exchanged.token
        }
      }

      const { res, payload } = await graphGet(`/${active.phone_number_id}`, token, {
        fields: 'id,display_phone_number,verified_name,is_on_biz_app,platform_type,quality_rating',
      })
      if (!res.ok) {
        return json({
          ok: false,
          error: isExpiredTokenError(payload) ? EXPIRED_TOKEN_FIX : metaErrorMessage(payload),
          phoneNumberId: active.phone_number_id,
        })
      }

      const isOnBizApp = Boolean((payload as Json).is_on_biz_app)
      const platformType = String((payload as Json).platform_type ?? '')
      const coexistenceOk = isOnBizApp && platformType === 'CLOUD_API'

      if (coexistenceOk && !active.coexistence_enabled) {
        await admin
          .from('whatsapp_integrations')
          .update({
            coexistence_enabled: true,
            connection_type: 'coexistence',
            status: 'connected',
            updated_at: new Date().toISOString(),
          })
          .eq('id', active.id)
      }

      return json({
        ok: coexistenceOk,
        phoneNumberId: active.phone_number_id,
        wabaId: active.waba_id,
        displayPhoneNumber: displayBusinessWhatsApp(
          String((payload as Json).display_phone_number ?? active.display_phone_number ?? ''),
        ),
        displayName: (payload as Json).verified_name ?? null,
        isOnBizApp,
        platformType,
        coexistenceVerified: coexistenceOk,
        connectionType: coexistenceOk ? 'coexistence' : active.connection_type,
        tokenExpiresAt: expiresAt,
        tokenStatus: classifyTokenStatus(expiresAt),
        message: coexistenceOk
          ? 'Number is on Cloud API and still on the WhatsApp Business app (Coexistence).'
          : 'Coexistence was not confirmed (is_on_biz_app must be true and platform_type CLOUD_API). The CRM did not migrate or unregister the number.',
      })
    }

    if (action === 'refresh') {
      const { data: active } = await admin
        .from('whatsapp_integrations')
        .select('id')
        .eq('is_active', true)
        .maybeSingle()
      if (!active?.id) return json({ ok: false, error: 'No active WhatsApp connection to refresh.' })
      const { data: secret } = await admin
        .from('whatsapp_integration_secrets')
        .select('access_token, token_expires_at')
        .eq('integration_id', active.id)
        .maybeSingle()
      const token = String(secret?.access_token ?? '').trim()
      if (!token) return json({ ok: false, error: 'No stored token to refresh. Reconnect WhatsApp Business.' })
      if (classifyTokenStatus(secret?.token_expires_at ? String(secret.token_expires_at) : null) === 'expired') {
        return json({
          ok: false,
          error: 'The 60-day token has already expired and cannot be refreshed. Reconnect WhatsApp Business.',
        })
      }
      const exchanged = await exchangeLongLivedToken(token)
      if (!exchanged) {
        return json({ ok: false, error: 'Meta did not issue a refreshed token. Reconnect WhatsApp Business.' })
      }
      const saved = await persistRefreshedToken(admin, String(active.id), exchanged.token, exchanged.expiresIn)
      return json({
        ok: true,
        tokenExpiresAt: saved.tokenExpiresAt,
        tokenStatus: saved.tokenStatus,
        message: 'Token refreshed. The access token is stored server-side only.',
      })
    }

    if (action !== 'complete') {
      return json({ ok: false, error: `Unknown action: ${action}` }, 400)
    }

    if (!appId || !appSecret) {
      return json({
        ok: false,
        error:
          'META_APP_ID and META_APP_SECRET must be set in Supabase Edge Function secrets before Embedded Signup can finish.',
      })
    }

    const code = String(body.code ?? '').trim()
    if (!code) {
      return json({ ok: false, error: 'Authorization code from Embedded Signup is required.' }, 400)
    }

    const session = (body.session && typeof body.session === 'object' ? body.session : {}) as Json
    const sessionData = (session.data && typeof session.data === 'object' ? session.data : session) as Json
    const metaEvent = String(session.event ?? body.metaEvent ?? '')
    let wabaId = String(sessionData.waba_id ?? body.wabaId ?? '').trim()
    let phoneNumberId = String(
      sessionData.phone_number_id ?? sessionData.phoneNumberId ?? body.phoneNumberId ?? '',
    ).trim()
    let businessId = String(sessionData.business_id ?? body.businessId ?? '').trim()

    if (STANDARD_MIGRATION_EVENTS.has(metaEvent)) {
      return json({
        ok: false,
        error:
          'Meta returned standard Cloud API onboarding (not Coexistence). Belle CRM stopped without registering, migrating, or unregistering the number. Click Connect WhatsApp Business again and choose the existing WhatsApp Business app account.',
      })
    }

    // 1. Exchange Embedded Signup code for an access token (server-side only).
    const exchangeUrl = graphUrl('/oauth/access_token', {
      client_id: appId,
      client_secret: appSecret,
      code,
    })
    const exchangeRes = await fetch(exchangeUrl)
    const exchangePayload = await exchangeRes.json().catch(() => ({}))
    if (!exchangeRes.ok || !(exchangePayload as Json).access_token) {
      console.log(
        JSON.stringify({
          event: 'whatsapp_es_token_exchange_failed',
          httpStatus: exchangeRes.status,
          error: (exchangePayload as { error?: unknown })?.error ?? null,
        }),
      )
      return json({
        ok: false,
        error: `Could not exchange Embedded Signup code: ${metaErrorMessage(exchangePayload)}`,
      })
    }

    let accessToken = String((exchangePayload as Json).access_token)
    let expiresIn = Number((exchangePayload as Json).expires_in ?? 0)

    // 2. Exchange for the ~60-day token this Embedded Signup configuration issues.
    try {
      const exchanged = await exchangeLongLivedToken(accessToken)
      if (exchanged) {
        accessToken = exchanged.token
        expiresIn = exchanged.expiresIn
      }
    } catch {
      // Keep the token from the authorization-code exchange
    }
    if (!expiresIn || expiresIn < 86400) expiresIn = SIXTY_DAYS_SEC

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
    const tokenStatus = classifyTokenStatus(tokenExpiresAt)
    const lastTokenRefreshAt = new Date().toISOString()

    // 3. Discover WABA / phone if the session payload omitted them.
    if (!wabaId) {
      const { res: debugRes, payload: debugPayload } = await graphGet('/debug_token', `${appId}|${appSecret}`, {
        input_token: accessToken,
      })
      if (debugRes.ok) {
        const data = ((debugPayload as Json).data || {}) as Json
        const granular = Array.isArray(data.granular_scopes) ? (data.granular_scopes as Json[]) : []
        for (const g of granular) {
          const targetIds = Array.isArray(g.target_ids) ? g.target_ids.map(String) : []
          const scope = String(g.scope ?? '')
          if (!wabaId && (scope.includes('whatsapp_business') || targetIds.length === 1)) {
            wabaId = targetIds[0] || wabaId
          }
        }
      }
    }

    if (!wabaId) {
      const { payload: mePayload } = await graphGet('/me', accessToken, {
        fields: 'id,businesses',
      })
      const businesses = (mePayload as { businesses?: { data?: { id?: string }[] } }).businesses?.data
      if (businesses?.[0]?.id) businessId = businessId || String(businesses[0].id)
    }

    if (!wabaId && businessId) {
      const { payload: owned } = await graphGet(`/${businessId}/owned_whatsapp_business_accounts`, accessToken)
      const rows = Array.isArray((owned as { data?: { id?: string }[] }).data)
        ? (owned as { data: { id: string }[] }).data
        : []
      if (rows[0]?.id) wabaId = String(rows[0].id)
    }

    if (!wabaId) {
      return json({
        ok: false,
        error:
          'Embedded Signup finished but no WhatsApp Business Account ID was returned. Complete the flow again and keep the popup open until Finish.',
      })
    }

    const { res: phonesRes, payload: phonesPayload } = await graphGet(`/${wabaId}/phone_numbers`, accessToken, {
      fields: 'id,display_phone_number,verified_name,is_on_biz_app,platform_type,quality_rating',
    })
    const phones = Array.isArray((phonesPayload as { data?: Json[] }).data)
      ? (phonesPayload as { data: Json[] }).data
      : []
    if (!phonesRes.ok) {
      return json({ ok: false, error: `Could not list WABA phone numbers: ${metaErrorMessage(phonesPayload)}` })
    }

    let phone =
      (phoneNumberId && phones.find((p) => String(p.id) === phoneNumberId)) ||
      phones.find((p) => p.is_on_biz_app === true) ||
      phones[0]
    if (!phone?.id) {
      return json({
        ok: false,
        error: 'No phone numbers found on the connected WhatsApp Business Account.',
      })
    }
    phoneNumberId = String(phone.id)

    // 4. Subscribe this app to the customer WABA webhooks. Do NOT register/deregister the number.
    const { res: subRes, payload: subPayload } = await graphPost(`/${wabaId}/subscribed_apps`, accessToken)
    if (!subRes.ok) {
      console.log(
        JSON.stringify({
          event: 'whatsapp_es_subscribe_failed',
          httpStatus: subRes.status,
          error: (subPayload as { error?: unknown })?.error ?? null,
        }),
      )
      return json({
        ok: false,
        error: `Connected to Meta but webhook subscribe failed: ${metaErrorMessage(subPayload)}`,
      })
    }

    // 5. Verify Coexistence when Meta reports it (skip register — number stays on Business app).
    const { payload: verifyPayload } = await graphGet(`/${phoneNumberId}`, accessToken, {
      fields: 'id,display_phone_number,verified_name,is_on_biz_app,platform_type',
    })
    const isOnBizApp = Boolean((verifyPayload as Json).is_on_biz_app ?? phone.is_on_biz_app)
    const platformType = String((verifyPayload as Json).platform_type ?? phone.platform_type ?? '')
    const displayPhone = String(
      (verifyPayload as Json).display_phone_number ?? phone.display_phone_number ?? '',
    )
    const displayName = String((verifyPayload as Json).verified_name ?? phone.verified_name ?? '')

    const coexistenceEvent = metaEvent === COEXISTENCE_EVENT
    const coexistenceVerified = isOnBizApp && platformType === 'CLOUD_API'
    if (!coexistenceEvent && !coexistenceVerified) {
      return json({
        ok: false,
        error:
          'Coexistence was not confirmed (expected FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING, or is_on_biz_app=true with platform_type=CLOUD_API). Belle CRM did not register, migrate, or replace the old Cloud API number. Choose the existing WhatsApp Business app account in Embedded Signup.',
        isOnBizApp,
        platformType,
        metaEvent: metaEvent || null,
      })
    }

    const coexistenceEnabled = coexistenceVerified
    const connectionType = 'coexistence'

    // 6. Optional contacts sync (Meta 24h window after Coexistence onboard). Failure is non-fatal.
    if (coexistenceEvent || coexistenceVerified) {
      try {
        await graphPost(`/${phoneNumberId}/smb_app_data`, accessToken, {
          messaging_product: 'whatsapp',
          sync_type: 'smb_app_state_sync',
        })
      } catch {
        // ignore
      }
    }

    const { data: settings } = await admin.from('salon_settings').select('*').eq('id', 1).maybeSingle()
    const previousPhoneId = String(settings?.whatsapp_phone_number_id ?? '').trim()
    if (previousPhoneId && previousPhoneId !== phoneNumberId) {
      await admin
        .from('whatsapp_integrations')
        .upsert(
          {
            waba_id: String(settings?.whatsapp_business_account_id || wabaId),
            phone_number_id: previousPhoneId,
            display_phone_number: settings?.whatsapp ?? null,
            display_name: settings?.salon_name ?? null,
            connection_type: 'cloud_api',
            coexistence_enabled: false,
            status: 'connected',
            is_active: false,
            notes: 'Previous Cloud API number retained. Not deregistered.',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'phone_number_id' },
        )
    }

    await admin.from('whatsapp_integrations').update({ is_active: false, updated_at: new Date().toISOString() }).eq('is_active', true)

    const { data: saved, error: saveError } = await admin
      .from('whatsapp_integrations')
      .upsert(
        {
          business_id: businessId || null,
          waba_id: wabaId,
          phone_number_id: phoneNumberId,
          display_phone_number: displayPhone || null,
          display_name: displayName || null,
          connection_type: connectionType,
          coexistence_enabled: coexistenceEnabled,
          status: coexistenceEnabled ? 'connected' : 'pending',
          is_active: true,
          connected_by: user.id,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          meta_event: metaEvent || null,
          token_expires_at: tokenExpiresAt,
          token_status: tokenStatus,
          last_token_refresh_at: lastTokenRefreshAt,
          notes: coexistenceEnabled
            ? 'WhatsApp Business App Coexistence confirmed. Phone register/deregister APIs were not called.'
            : 'Coexistence signup event received; waiting for is_on_biz_app confirmation. Phone register/deregister APIs were not called.',
        },
        { onConflict: 'phone_number_id' },
      )
      .select(
        'id, business_id, waba_id, phone_number_id, display_phone_number, display_name, connection_type, coexistence_enabled, status, is_active, connected_at, meta_event, token_expires_at, token_status, last_token_refresh_at',
      )
      .single()

    if (saveError || !saved) {
      return json({ ok: false, error: saveError?.message || 'Failed to save WhatsApp connection.' }, 500)
    }

    const { error: secretError } = await admin.from('whatsapp_integration_secrets').upsert({
      integration_id: saved.id,
      access_token: accessToken,
      token_expires_at: tokenExpiresAt,
      last_refreshed_at: lastTokenRefreshAt,
      updated_at: new Date().toISOString(),
    })
    if (secretError) {
      return json({ ok: false, error: 'Connected to Meta but failed to store the access token server-side.' }, 500)
    }

    await admin
      .from('salon_settings')
      .update({
        whatsapp_phone_number_id: phoneNumberId,
        whatsapp_business_account_id: wabaId,
        ...(displayPhone ? { whatsapp: displayPhone } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)

    console.log(
      JSON.stringify({
        event: 'whatsapp_es_complete',
        wabaId,
        phoneNumberId,
        coexistence: coexistenceEnabled,
        coexistenceEvent,
        isOnBizApp,
        isOnBizApp,
        platformType,
        metaEvent: metaEvent || null,
        previousPhoneId: previousPhoneId || null,
      }),
    )

    return json({
      ok: true,
      integration: publicIntegration(saved as Record<string, unknown>),
      isOnBizApp,
      platformType,
      coexistenceVerified,
      tokenExpiresAt,
      tokenStatus,
      message: coexistenceEnabled
        ? 'WhatsApp Business app number connected to Cloud API (Coexistence). The number was not migrated or unregistered from the app.'
        : 'Signup recorded. Waiting for Meta to report is_on_biz_app=true. The number was not migrated or unregistered. Click Test connection in a few minutes.',
    })
  } catch (e) {
    console.log(
      JSON.stringify({
        event: 'whatsapp_es_exception',
        message: e instanceof Error ? e.message : 'Unexpected error',
      }),
    )
    return json({ ok: false, error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
