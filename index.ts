import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { SignJWT, importPKCS8 } from 'https://esm.sh/jose@5.9.6'
import forge from 'npm:node-forge@1.3.1'
import JSZip from 'npm:jszip@3.10.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Minimal 1×1 PNG used as icon/logo placeholders until branded assets are uploaded */
const PLACEHOLDER_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

type CustomerRow = {
  id: string
  full_name: string
  phone: string
  loyalty_tier: string
  lifetime_spend: number
  total_visits: number
  wallet_token: string
  wallet_apple_serial: string | null
  wallet_google_object_id: string | null
  created_at?: string
}

function hexSha1(bytes: Uint8Array): string {
  const md = forge.md.sha1.create()
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  md.update(binary)
  return md.digest().toHex()
}

function pemFromEnv(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
}

function firstName(fullName: string) {
  const part = fullName.trim().split(/\s+/)[0]
  return part || fullName
}

function perkCopy(tier: string): string {
  const t = String(tier).toLowerCase()
  if (t === 'gold') {
    return 'Your Gold perks: 5% off every visit, 30% off on your birthday, 1 free Classic Mani & Pedi, and another free Classic Mani & Pedi after each extra AED 1,000. Show this card at Belle. Delivery is still paid on free gifts.'
  }
  if (t === 'premium') {
    return 'Your Premium perks: 5% off every visit, 50% off on your birthday, 1 free service every 30 days, and a free Classic Mani & Pedi after each AED 1,000. Show this card at Belle. Delivery is still paid on free gifts.'
  }
  return 'Keep visiting Belle to reach Gold at AED 1,500 lifetime spend. Gold members get 5% off, a birthday treat, and a free Classic Mani & Pedi.'
}

function nextTierHint(spend: number, tier: string): { label: string; value: string } {
  const t = String(tier).toLowerCase()
  const amount = Number(spend || 0)
  if (t === 'premium') return { label: 'STATUS', value: 'Top tier' }
  if (t === 'gold') {
    const remaining = Math.max(0, 3000 - amount)
    return { label: 'TO PREMIUM', value: remaining === 0 ? 'Ready' : `AED ${Math.round(remaining)} more` }
  }
  const remaining = Math.max(0, 1500 - amount)
  return { label: 'TO GOLD', value: remaining === 0 ? 'Ready' : `AED ${Math.round(remaining)} more` }
}

/** Regular olive, Gold champagne, Premium blue */
function tierColors(tier: string): { bg: string; fg: string; label: string; hexBg: string } {
  if (String(tier).toLowerCase() === 'premium') {
    return { bg: 'rgb(30,77,140)', fg: 'rgb(246,245,241)', hexBg: '#1E4D8C', label: 'Premium' }
  }
  if (String(tier).toLowerCase() === 'gold') {
    return { bg: 'rgb(122,92,40)', fg: 'rgb(255,248,232)', hexBg: '#7A5C28', label: 'Gold' }
  }
  return { bg: 'rgb(75,83,63)', fg: 'rgb(246,245,241)', hexBg: '#4B533F', label: 'Regular' }
}

async function buildApplePass(customer: CustomerRow, salonName: string): Promise<Uint8Array> {
  const passTypeId = Deno.env.get('APPLE_PASS_TYPE_ID')
  const teamId = Deno.env.get('APPLE_TEAM_ID')
  const certPem = pemFromEnv(Deno.env.get('APPLE_PASS_CERT_PEM'))
  const keyPem = pemFromEnv(Deno.env.get('APPLE_PASS_KEY_PEM'))
  const wwdrPem = pemFromEnv(Deno.env.get('APPLE_WWDR_CERT_PEM'))
  const keyPass = Deno.env.get('APPLE_PASS_KEY_PASSPHRASE') ?? ''

  if (!passTypeId || !teamId || !certPem || !keyPem || !wwdrPem) {
    throw new Error(
      'Apple Wallet is not configured (APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT_PEM, APPLE_PASS_KEY_PEM, APPLE_WWDR_CERT_PEM).',
    )
  }

  const serial = customer.wallet_apple_serial || customer.wallet_token
  const colors = tierColors(customer.loyalty_tier)
  const hint = nextTierHint(Number(customer.lifetime_spend ?? 0), customer.loyalty_tier)
  const guestName = firstName(customer.full_name)

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: serial,
    teamIdentifier: teamId,
    organizationName: salonName,
    description: `${salonName} loyalty card`,
    logoText: 'Belle',
    foregroundColor: colors.fg,
    backgroundColor: colors.bg,
    labelColor: colors.fg,
    barcodes: [
      {
        format: 'PKBarcodeFormatQR',
        message: customer.wallet_token,
        messageEncoding: 'iso-8859-1',
        altText: 'Show at Belle',
      },
    ],
    storeCard: {
      headerFields: [
        {
          key: 'tier',
          label: 'LEVEL',
          value: colors.label,
        },
      ],
      primaryFields: [
        {
          key: 'member',
          label: 'HELLO',
          value: guestName,
        },
      ],
      secondaryFields: [
        {
          key: 'spend',
          label: 'SPENT',
          value: `AED ${Number(customer.lifetime_spend ?? 0).toFixed(0)}`,
        },
        {
          key: 'next',
          label: hint.label,
          value: hint.value,
        },
      ],
      auxiliaryFields: [
        {
          key: 'visits',
          label: 'VISITS',
          value: String(customer.total_visits ?? 0),
        },
      ],
      backFields: [
        {
          key: 'perks',
          label: 'Your perks',
          value: perkCopy(customer.loyalty_tier),
        },
        {
          key: 'howto',
          label: 'How to use',
          value: 'Show this card at Belle Beauty Lounge. Staff will scan the QR to add your spend and apply ready gifts.',
        },
        {
          key: 'web',
          label: 'Website',
          value: 'bellebeautylounge.com',
        },
      ],
    },
  }

  const files: Record<string, Uint8Array> = {
    'pass.json': new TextEncoder().encode(JSON.stringify(passJson)),
    'icon.png': PLACEHOLDER_PNG,
    'paula.r@example.org': PLACEHOLDER_PNG,
    'logo.png': PLACEHOLDER_PNG,
    'paula.r@example.org': PLACEHOLDER_PNG,
  }

  const manifest: Record<string, string> = {}
  for (const [name, data] of Object.entries(files)) {
    manifest[name] = hexSha1(data)
  }
  const manifestStr = JSON.stringify(manifest)

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(manifestStr, 'utf8')
  const cert = forge.pki.certificateFromPem(certPem)
  const wwdr = forge.pki.certificateFromPem(wwdrPem)
  const key = forge.pki.decryptRsaPrivateKey(keyPem, keyPass) || forge.pki.privateKeyFromPem(keyPem)
  p7.addCertificate(cert)
  p7.addCertificate(wwdr)
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  })
  p7.sign({ detached: true })
  const signatureDer = forge.asn1.toDer(p7.toAsn1()).getBytes()
  const signature = Uint8Array.from(signatureDer, (c) => c.charCodeAt(0))
  const manifestBytesFinal = new TextEncoder().encode(manifestStr)

  const zip = new JSZip()
  for (const [name, data] of Object.entries(files)) {
    zip.file(name, data)
  }
  zip.file('manifest.json', manifestBytesFinal)
  zip.file('signature', signature)
  const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return out
}

async function buildGoogleSaveUrl(customer: CustomerRow, salonName: string): Promise<string> {
  const issuerId = Deno.env.get('GOOGLE_WALLET_ISSUER_ID')
  const classSuffix = Deno.env.get('GOOGLE_WALLET_CLASS_SUFFIX') || 'belle_loyalty'
  const sa = loadGoogleServiceAccount()
  if (!issuerId) {
    throw new Error('GOOGLE_WALLET_ISSUER_ID is missing.')
  }
  if (!sa) {
    throw new Error(
      'Google service account JSON is missing or invalid. Re-upload GOOGLE_SERVICE_ACCOUNT_JSON_B64.',
    )
  }

  const objectId = customer.wallet_google_object_id || `${issuerId}.${customer.wallet_token.replace(/-/g, '')}`
  const classId = `${issuerId}.${classSuffix}`
  const colors = tierColors(customer.loyalty_tier)
  const hint = nextTierHint(Number(customer.lifetime_spend ?? 0), customer.loyalty_tier)

  const loyaltyClass = {
    id: classId,
    issuerName: salonName,
    reviewStatus: 'UNDER_REVIEW',
    programName: `${salonName}`,
    hexBackgroundColor: colors.hexBg,
    programLogo: {
      sourceUri: {
        uri: 'https://hilarious-chaja-07e7b3.netlify.app/belle-logo.svg',
      },
      contentDescription: {
        defaultValue: { language: 'en-US', value: salonName },
      },
    },
  }

  const loyaltyObject = {
    id: objectId,
    classId,
    state: 'ACTIVE',
    accountId: customer.id,
    accountName: customer.full_name,
    hexBackgroundColor: colors.hexBg,
    loyaltyPoints: {
      label: 'Tier',
      balance: { string: colors.label },
    },
    barcode: {
      type: 'QR_CODE',
      value: customer.wallet_token,
      alternateText: 'Show at Belle',
    },
    textModulesData: [
      {
        header: 'You have spent',
        body: `AED ${Number(customer.lifetime_spend ?? 0).toFixed(0)}`,
        id: 'spend',
      },
      { header: hint.label.replace(/_/g, ' '), body: hint.value, id: 'next' },
      { header: 'Visits', body: String(customer.total_visits ?? 0), id: 'visits' },
      { header: 'Your perks', body: perkCopy(customer.loyalty_tier), id: 'perks' },
      {
        header: 'How to use',
        body: 'Show this card at Belle. Staff will scan the QR to add your spend and apply ready gifts.',
        id: 'howto',
      },
    ],
  }

  let key
  try {
    key = await importPKCS8(sa.private_key, 'RS256')
  } catch (e) {
    throw new Error(
      `Google private key invalid: ${e instanceof Error ? e.message : 'import failed'}`,
    )
  }

  const origins = [
    'https://hilarious-chaja-07e7b3.netlify.app',
    'https://willowy-dasik-d9993c.netlify.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]

  const claims = {
    iss: sa.client_email,
    aud: 'google',
    typ: 'savetowallet',
    origins,
    payload: {
      loyaltyClasses: [loyaltyClass],
      loyaltyObjects: [loyaltyObject],
    },
  }

  const token = await new SignJWT(claims as Record<string, unknown>)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .sign(key)

  return `https://pay.google.com/gp/v/save/${token}`
}

function loadGoogleServiceAccount(): { client_email: string; private_key: string } | null {
  const b64 = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON_B64')?.trim()
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')?.trim()
  let text = raw || ''
  if (b64) {
    try {
      text = new TextDecoder().decode(
        Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
      )
    } catch {
      return null
    }
  }
  if (!text) return null
  try {
    const sa = JSON.parse(text) as { client_email?: string; private_key?: string }
    if (!sa.client_email || !sa.private_key) return null
    if (sa.private_key.includes('\\n')) {
      sa.private_key = sa.private_key.replace(/\\n/g, '\n')
    }
    return { client_email: sa.client_email, private_key: sa.private_key }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')?.trim()
    const platform = (url.searchParams.get('platform') || 'info').toLowerCase()

    if (!token) {
      return new Response(JSON.stringify({ error: 'token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: customer, error } = await admin
      .from('customers')
      .select(
        'id, full_name, phone, loyalty_tier, lifetime_spend, total_visits, wallet_token, wallet_apple_serial, wallet_google_object_id, created_at',
      )
      .eq('wallet_token', token)
      .maybeSingle()

    if (error || !customer) {
      return new Response(JSON.stringify({ error: 'Loyalty card not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: settings } = await admin.from('salon_settings').select('salon_name').eq('id', 1).maybeSingle()
    const salonName = settings?.salon_name || 'Belle Beauty Lounge'
    const row = customer as CustomerRow

    // Persist serials for future updates
    const appleSerial = row.wallet_apple_serial || row.wallet_token
    const issuerId = Deno.env.get('GOOGLE_WALLET_ISSUER_ID')
    const googleObjectId =
      row.wallet_google_object_id ||
      (issuerId ? `${issuerId}.${row.wallet_token.replace(/-/g, '')}` : null)

    if (platform === 'apple' && !row.wallet_apple_serial) {
      await admin.from('customers').update({ wallet_apple_serial: appleSerial }).eq('id', row.id)
    }
    if (platform === 'google' && googleObjectId && !row.wallet_google_object_id) {
      await admin.from('customers').update({ wallet_google_object_id: googleObjectId }).eq('id', row.id)
    }

    if (platform === 'info') {
      const functionsBase = `${supabaseUrl}/functions/v1/wallet-pass`
      let rewardRedemptions: { type: string; visitDate: string }[] = []
      const { data: rewardRows, error: rewardError } = await admin
        .from('visits')
        .select('loyalty_reward_type, visit_date')
        .eq('customer_id', row.id)
        .not('loyalty_reward_type', 'is', null)
      if (!rewardError && rewardRows) {
        rewardRedemptions = rewardRows
          .filter((r: { loyalty_reward_type?: string | null; visit_date?: string | null }) => r.loyalty_reward_type)
          .map((r: { loyalty_reward_type: string; visit_date: string }) => ({
            type: r.loyalty_reward_type,
            visitDate: r.visit_date,
          }))
      }
      return new Response(
        JSON.stringify({
          salonName,
          customer: {
            id: row.id,
            fullName: row.full_name,
            phone: row.phone,
            loyaltyTier: row.loyalty_tier,
            lifetimeSpend: Number(row.lifetime_spend ?? 0),
            totalVisits: Number(row.total_visits ?? 0),
            createdAt: row.created_at,
          },
          rewardRedemptions,
          appleConfigured: Boolean(
            Deno.env.get('APPLE_PASS_TYPE_ID') &&
              Deno.env.get('APPLE_TEAM_ID') &&
              Deno.env.get('APPLE_PASS_CERT_PEM') &&
              Deno.env.get('APPLE_PASS_KEY_PEM') &&
              Deno.env.get('APPLE_WWDR_CERT_PEM'),
          ),
          googleConfigured: Boolean(Deno.env.get('GOOGLE_WALLET_ISSUER_ID') && loadGoogleServiceAccount()),
          appleUrl: `${functionsBase}?token=${encodeURIComponent(token)}&platform=apple`,
          googleUrl: `${functionsBase}?token=${encodeURIComponent(token)}&platform=google`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (platform === 'apple') {
      const pkpass = await buildApplePass({ ...row, wallet_apple_serial: appleSerial }, salonName)
      return new Response(pkpass, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/vnd.apple.pkpass',
          'Content-Disposition': `attachment; filename="belle-loyalty.pkpass"`,
        },
      })
    }

    if (platform === 'google') {
      const saveUrl = await buildGoogleSaveUrl(
        { ...row, wallet_google_object_id: googleObjectId },
        salonName,
      )
      const format = (url.searchParams.get('format') || '').toLowerCase()
      // JSON for modern CRM page; 302 for direct browser / older Netlify builds
      if (format === 'json') {
        return new Response(JSON.stringify({ saveUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Access-Control-Expose-Headers': 'Location',
          Location: saveUrl,
        },
      })
    }

    return new Response(JSON.stringify({ error: 'platform must be info, apple, or google' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
