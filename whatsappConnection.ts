export type WhatsAppProviderId = 'meta' | '360dialog'

export type WhatsAppConnection = {
  token: string
  phoneNumberId: string
  wabaId: string | null
  source: 'integration' | 'secret' | 'settings' | 'missing'
  connectionType: 'coexistence' | 'cloud_api' | null
  coexistenceEnabled: boolean
  displayPhoneNumber: string | null
  integrationId: string | null
  tokenExpiresAt: string | null
  tokenStatus: 'valid' | 'expiring' | 'expired' | 'unknown'
  /** Per-integration provider. Fallback (secrets/settings) is always meta. */
  provider: WhatsAppProviderId
  providerAccountId: string | null
  salonId: string | null
}

export type ResolveWhatsAppHint = {
  salonId?: string | null
  phoneNumberId?: string | null
  displayPhone?: string | null
}

export const DEFAULT_SALON_ID = 'a0000000-0000-4000-8000-000000000001'

const DEFAULT_GRAPH_VERSION = 'v22.0'
const SIXTY_DAYS_SEC = 60 * 24 * 60 * 60
const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// Minimal supabase-like client used from Edge Functions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

export function classifyTokenStatus(expiresAt: string | null | undefined): WhatsAppConnection['tokenStatus'] {
  if (!expiresAt) return 'unknown'
  const ms = Date.parse(expiresAt) - Date.now()
  if (!Number.isFinite(ms)) return 'unknown'
  if (ms <= 0) return 'expired'
  if (ms <= EXPIRING_WINDOW_MS) return 'expiring'
  return 'valid'
}

function graphVersion() {
  return (Deno.env.get('WHATSAPP_GRAPH_VERSION') || DEFAULT_GRAPH_VERSION).replace(/^\/+|\/+$/g, '')
}

/** Exchange a still-valid user token for a new ~60-day token (Facebook Login for Business). */
export async function exchangeLongLivedToken(currentToken: string): Promise<{
  token: string
  expiresIn: number
} | null> {
  const appId = (Deno.env.get('META_APP_ID') || '').trim()
  const appSecret = (Deno.env.get('META_APP_SECRET') || '').trim()
  if (!appId || !appSecret || !currentToken) return null
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`)
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('client_secret', appSecret)
  url.searchParams.set('fb_exchange_token', currentToken)
  const res = await fetch(url.toString())
  const payload = (await res.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error?: unknown
  }
  if (!res.ok || !payload.access_token) {
    console.log(
      JSON.stringify({
        event: 'whatsapp_token_refresh_failed',
        httpStatus: res.status,
        error: payload.error ?? null,
      }),
    )
    return null
  }
  return {
    token: payload.access_token,
    expiresIn: Number(payload.expires_in ?? SIXTY_DAYS_SEC) || SIXTY_DAYS_SEC,
  }
}

export async function persistRefreshedToken(
  admin: AdminClient,
  integrationId: string,
  token: string,
  expiresIn: number,
) {
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  const now = new Date().toISOString()
  const tokenStatus = classifyTokenStatus(tokenExpiresAt)
  await admin.from('whatsapp_integration_secrets').upsert({
    integration_id: integrationId,
    access_token: token,
    token_expires_at: tokenExpiresAt,
    last_refreshed_at: now,
    updated_at: now,
  })
  await admin
    .from('whatsapp_integrations')
    .update({
      token_expires_at: tokenExpiresAt,
      token_status: tokenStatus,
      last_token_refresh_at: now,
      updated_at: now,
    })
    .eq('id', integrationId)
  return { tokenExpiresAt, tokenStatus }
}

export async function maybeRefreshStoredToken(
  admin: AdminClient,
  integrationId: string,
  currentToken: string,
  expiresAt: string | null,
): Promise<string> {
  const status = classifyTokenStatus(expiresAt)
  if (status !== 'expiring' && status !== 'expired') return currentToken
  if (status === 'expired') {
    // Expired 60-day tokens cannot be refreshed; caller must reconnect.
    return currentToken
  }
  const exchanged = await exchangeLongLivedToken(currentToken)
  if (!exchanged) return currentToken
  await persistRefreshedToken(admin, integrationId, exchanged.token, exchanged.expiresIn)
  return exchanged.token
}

/** Live 360dialog Coexistence number. Older 050 200 8228 / 050 980 1883 lines are retired. */
export const BUSINESS_WHATSAPP_DISPLAY = '+971 56 140 4016'
const RETIRED_DIGITS = new Set(['971502008228', '971509801883'])

function waDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `971${digits.slice(1)}`
  if (digits.length === 9 && digits.startsWith('5')) digits = `971${digits}`
  return digits
}

export function isDecorWhatsAppNumber(raw?: string | null): boolean {
  const d = waDigits(raw || '')
  return RETIRED_DIGITS.has(d) || d.endsWith('502008228') || d.endsWith('509801883')
}

export function displayBusinessWhatsApp(raw?: string | null): string {
  if (!raw || isDecorWhatsAppNumber(raw)) return BUSINESS_WHATSAPP_DISPLAY
  return String(raw)
}

function asProvider(raw: unknown): WhatsAppProviderId {
  return raw === '360dialog' ? '360dialog' : 'meta'
}

const empty: WhatsAppConnection = {
  token: '',
  phoneNumberId: '',
  wabaId: null,
  source: 'missing',
  connectionType: null,
  coexistenceEnabled: false,
  displayPhoneNumber: null,
  integrationId: null,
  tokenExpiresAt: null,
  tokenStatus: 'unknown',
  provider: 'meta',
  providerAccountId: null,
  salonId: DEFAULT_SALON_ID,
}

const INTEGRATION_BASE_COLS =
  'id, waba_id, phone_number_id, display_phone_number, connection_type, coexistence_enabled, is_active, status, token_expires_at, token_status'

type IntegrationRow = {
  id: string
  waba_id?: string | null
  phone_number_id?: string | null
  display_phone_number?: string | null
  connection_type?: string | null
  coexistence_enabled?: boolean | null
  is_active?: boolean | null
  status?: string | null
  token_expires_at?: string | null
  token_status?: string | null
  provider?: string | null
  provider_account_id?: string | null
  salon_id?: string | null
}

/** Load the matching integration. Never use maybeSingle() on all active rows — two salons break that. */
async function fetchActiveIntegration(admin: AdminClient, hint?: ResolveWhatsAppHint) {
  const withProvider = `${INTEGRATION_BASE_COLS}, provider, provider_account_id, salon_id`

  async function selectCols(cols: string) {
    if (hint?.phoneNumberId) {
      const byPhone = await admin.from('whatsapp_integrations').select(cols).eq('phone_number_id', hint.phoneNumberId).limit(1)
      if (!byPhone.error && byPhone.data?.[0]) return byPhone.data[0] as IntegrationRow
    }

    let activeQuery = admin.from('whatsapp_integrations').select(cols).eq('is_active', true).order('updated_at', { ascending: false }).limit(8)
    if (hint?.salonId) activeQuery = activeQuery.eq('salon_id', hint.salonId)
    const active = await activeQuery
    const rows = (!active.error ? (active.data as IntegrationRow[] | null) : null) ?? []

    if (hint?.displayPhone) {
      const key = waDigits(hint.displayPhone)
      const match = rows.find((r) => waDigits(String(r.display_phone_number || '')) === key)
      if (match) return match
    }
    if (rows[0]) return rows[0]

    const fallback = await admin.from('whatsapp_integrations').select(cols).eq('is_active', true).order('updated_at', { ascending: false }).limit(1)
    return (!fallback.error ? (fallback.data as IntegrationRow[] | null)?.[0] : null) ?? null
  }

  const first = await selectCols(withProvider)
  if (first) return first
  const fallback = await selectCols(INTEGRATION_BASE_COLS)
  if (!fallback) return null
  return { ...fallback, provider: 'meta', provider_account_id: null }
}

export async function resolveWhatsAppConnection(
  admin: AdminClient,
  hint?: ResolveWhatsAppHint,
): Promise<WhatsAppConnection> {
  try {
    const active = await fetchActiveIntegration(admin, hint)

    if (active?.phone_number_id && active.status !== 'disconnected') {
      const provider = asProvider(active.provider)
      const { data: secret } = await admin
        .from('whatsapp_integration_secrets')
        .select('access_token, token_expires_at')
        .eq('integration_id', active.id)
        .maybeSingle()
      let token = String(secret?.access_token ?? '').trim()
      const expiresAt = String(secret?.token_expires_at || active.token_expires_at || '') || null
      const base = {
        phoneNumberId: String(active.phone_number_id),
        wabaId: active.waba_id ? String(active.waba_id) : null,
        source: 'integration' as const,
        connectionType: (active.connection_type === 'coexistence' ? 'coexistence' : 'cloud_api') as
          | 'coexistence'
          | 'cloud_api',
        coexistenceEnabled: Boolean(active.coexistence_enabled),
        displayPhoneNumber: displayBusinessWhatsApp(
          active.display_phone_number ? String(active.display_phone_number) : null,
        ),
        integrationId: String(active.id),
        tokenExpiresAt: expiresAt,
        tokenStatus: classifyTokenStatus(expiresAt),
        provider,
        providerAccountId: active.provider_account_id ? String(active.provider_account_id) : null,
        salonId: active.salon_id ? String(active.salon_id) : hint?.salonId || DEFAULT_SALON_ID,
      }

      // Never fall back to Meta env token for a 360dialog row.
      if (provider === '360dialog') {
        return { ...base, token }
      }

      if (token) {
        token = await maybeRefreshStoredToken(admin, String(active.id), token, expiresAt)
        return { ...base, token }
      }
    }
  } catch {
    // Table may not exist yet — fall back to secrets/settings
  }

  const envToken = (Deno.env.get('WHATSAPP_TOKEN') || '').trim()
  const envPhone = (Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '').trim()
  const envWaba = (Deno.env.get('WHATSAPP_BUSINESS_ACCOUNT_ID') || '').trim()

  const { data: settings } = await admin.from('salon_settings').select('*').eq('id', 1).maybeSingle()
  const settingsPhone = String(settings?.whatsapp_phone_number_id ?? '').trim()
  const settingsWaba = String(settings?.whatsapp_business_account_id ?? '').trim()

  const phoneNumberId = envPhone || settingsPhone
  const wabaId = envWaba || settingsWaba || null
  if (!envToken && !phoneNumberId) return empty

  return {
    token: envToken,
    phoneNumberId,
    wabaId,
    source: envPhone ? 'secret' : settingsPhone ? 'settings' : envToken ? 'secret' : 'missing',
    connectionType: 'cloud_api',
    coexistenceEnabled: false,
    displayPhoneNumber: displayBusinessWhatsApp(settings?.whatsapp ? String(settings.whatsapp) : null),
    integrationId: null,
    tokenExpiresAt: null,
    tokenStatus: envToken ? 'unknown' : 'unknown',
    provider: 'meta',
    providerAccountId: null,
    salonId: hint?.salonId || (settings?.salon_id ? String(settings.salon_id) : DEFAULT_SALON_ID),
  }
}
