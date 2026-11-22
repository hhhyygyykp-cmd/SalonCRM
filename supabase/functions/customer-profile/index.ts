import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function phoneDigits(phone: string) {
  return phone.replace(/\D/g, '')
}

function toWhatsAppDigits(raw: string) {
  let digits = phoneDigits(raw)
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('971')) return digits
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 9 && digits.startsWith('5')) return `971${digits}`
  if (digits.length >= 8 && digits.length <= 10) return `971${digits}`
  return digits
}

function toStoredPhone(raw: string) {
  const digits = toWhatsAppDigits(raw)
  if (!digits) return raw.trim()
  return `+${digits}`
}

function phoneKey(phone: string) {
  return toWhatsAppDigits(phone).slice(-9)
}

function phonesMatch(a: string, b: string) {
  const ka = phoneKey(a)
  const kb = phoneKey(b)
  return Boolean(ka && kb && ka.length >= 8 && ka === kb)
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function publicCustomer(row: Record<string, unknown>) {
  return {
    fullName: String(row.full_name ?? ''),
    phone: String(row.phone ?? ''),
    location: String(row.location ?? ''),
    email: String(row.email ?? ''),
    birthday: row.birthday ? String(row.birthday).slice(0, 10) : '',
    profileUpdatedAt: row.profile_updated_at ? String(row.profile_updated_at) : '',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server is not configured.' }, 500)
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    if (req.method === 'GET') {
      const token = new URL(req.url).searchParams.get('token')?.trim() || ''
      if (!isUuid(token)) return json({ error: 'This update link is not valid.' }, 400)
      const { data, error } = await admin
        .from('customers')
        .select('full_name, phone, location, email, birthday, profile_updated_at')
        .eq('wallet_token', token)
        .maybeSingle()
      if (error) return json({ error: error.message }, 500)
      if (!data) return json({ error: 'We could not find this Belle card.' }, 404)
      return json({ customer: publicCustomer(data as Record<string, unknown>) })
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action ?? 'save')

    if (action === 'lookup') {
      const key = phoneKey(String(body.phone ?? ''))
      if (key.length < 8) {
        return json({ error: 'Enter your WhatsApp number, e.g. 0501234567.' }, 400)
      }
      const { data, error } = await admin
        .from('customers')
        .select('wallet_token, phone, whatsapp_phone')
        .or(`phone.ilike.%${key},whatsapp_phone.ilike.%${key}`)
        .limit(20)
      if (error) return json({ error: error.message }, 500)
      const matches = (data ?? []).filter(
        (row) => phonesMatch(String(row.phone ?? ''), key) || phonesMatch(String(row.whatsapp_phone ?? ''), key),
      )
      if (matches.length === 0) {
        return json({ error: 'We could not find this number. Message Belle on WhatsApp and we will help you.' }, 404)
      }
      if (matches.length > 1) {
        return json({ error: 'More than one record matches this number. Please message Belle on WhatsApp.' }, 409)
      }
      return json({ token: String(matches[0].wallet_token) })
    }

    const token = String(body.token ?? '').trim()
    if (!isUuid(token)) return json({ error: 'This update link is not valid.' }, 400)

    const fullName = String(body.fullName ?? '').trim()
    const phoneRaw = String(body.phone ?? '').trim()
    const location = String(body.location ?? '').trim()
    const email = String(body.email ?? '').trim()
    const birthday = String(body.birthday ?? '').trim()

    if (fullName.length < 2 || fullName.length > 80) {
      return json({ error: 'Please enter your full name.' }, 400)
    }
    const phone = toStoredPhone(phoneRaw)
    if (phoneKey(phone).length < 8) {
      return json({ error: 'Enter a valid mobile number, e.g. 0501234567.' }, 400)
    }
    if (!location || location.length > 80) {
      return json({ error: 'Please choose your area in Al Ain.' }, 400)
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Enter a valid email, or leave it empty.' }, 400)
    }
    if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
      return json({ error: 'Enter a valid birthday.' }, 400)
    }
    if (birthday) {
      const year = Number(birthday.slice(0, 4))
      const nowYear = new Date().getFullYear()
      if (year < 1925 || year > nowYear - 10) {
        return json({ error: 'Enter a valid birthday.' }, 400)
      }
    }

    const { data: current, error: currentError } = await admin
      .from('customers')
      .select('id, phone, whatsapp_phone')
      .eq('wallet_token', token)
      .maybeSingle()
    if (currentError) return json({ error: currentError.message }, 500)
    if (!current) return json({ error: 'We could not find this Belle card.' }, 404)

    const key = phoneKey(phone)
    const { data: others } = await admin
      .from('customers')
      .select('id, full_name, phone, whatsapp_phone')
      .neq('id', current.id)
      .or(`phone.ilike.%${key},whatsapp_phone.ilike.%${key}`)
      .limit(20)
    const duplicate = (others ?? []).find(
      (row) => phonesMatch(String(row.phone ?? ''), phone) || phonesMatch(String(row.whatsapp_phone ?? ''), phone),
    )
    if (duplicate) {
      return json({ error: 'This phone number is already used on another Belle record. Please message us on WhatsApp.' }, 409)
    }

    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await admin
      .from('customers')
      .update({
        full_name: fullName,
        phone,
        whatsapp_phone: phone,
        location,
        email: email || null,
        birthday: birthday || null,
        profile_updated_at: now,
        updated_at: now,
      })
      .eq('id', current.id)
      .select('full_name, phone, location, email, birthday, profile_updated_at')
      .single()
    if (updateError || !updated) return json({ error: updateError?.message ?? 'Could not save your details.' }, 500)

    return json({ ok: true, customer: publicCustomer(updated as Record<string, unknown>) })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not save your details.' }, 500)
  }
})
