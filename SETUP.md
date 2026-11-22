# Belle Beauty Lounge CRM — go-live setup

## 1. Create a Supabase project
1. Go to https://supabase.com and create a project.
2. Open **SQL Editor** and run, in order:
   - `supabase/migrations/001_initial.sql`
   - `supabase/migrations/002_seed_services_customers.sql`
   - `supabase/migrations/003_wallet_passes.sql` (loyalty wallet tokens + post-visit template)
   - `supabase/migrations/004_data_safety.sql` (atomic visit save + safer delete permissions)
   - `supabase/migrations/009_whatsapp_integrations.sql` (Coexistence / Embedded Signup connections)
   - `supabase/migrations/010_whatsapp_token_expiry.sql` (60-day token expiry metadata)
   - `supabase/migrations/025_customer_self_update.sql` (customer public update form)
   - `supabase/migrations/029_multi_salon.sql` (salon isolation + empty second-admin salon)
   - `supabase/migrations/030_fix_salon_rls.sql` (drop old policies that leaked Belle data to other salons)
   - `supabase/migrations/032_whatsapp_0561404016.sql` (public WhatsApp number → +971 56 140 4016)

## 2. Create Owner and Raghad users
In **Authentication → Users → Add user**:

| Name | Email | Password | Then set profile role |
|------|-------|----------|------------------------|
| Owner | admin@bellebeauty.ae | (your real password) | `owner` |
| Raghad Younes | raghad@bellebeauty.ae | (your real password) | `staff` |

After each user is created, open **Table Editor → profiles** and set:
- Owner row: `role = owner` (lowercase), `name = Owner`, `job_title = Owner`, `salon_id = a0000000-0000-4000-8000-000000000001`
- Raghad row: `role = staff` (lowercase), `name = Raghad Younes`, `job_title = Front desk / Beautician`, `salary = 3500`, `salon_id = a0000000-0000-4000-8000-000000000001`

`role` must be exactly `owner` or `staff` — not `Owner`, `Admin`, or `admin`.

(The signup trigger creates a profile with role from user metadata; if role is wrong, edit it in `profiles`.)

Tip: when creating users, optional metadata:
`{ "name": "Owner", "role": "owner" }` — use lowercase `owner` / `staff`. Belle is the default salon if `salon_id` is omitted.

### Second admin (empty salon — no Belle customers / costs / revenue)
Run migration `029_multi_salon.sql` first. It seeds an empty salon:

- Salon id: `a0000000-0000-4000-8000-000000000002`
- Name: `New Salon` (rename in Settings after login)

Create the user in **Authentication → Users → Add user** with metadata:

```json
{
  "name": "New Salon Owner",
  "role": "owner",
  "salon_id": "a0000000-0000-4000-8000-000000000002"
}
```

Or after creating the user, in **Table Editor → profiles**:
- `role = owner`
- `salon_id = a0000000-0000-4000-8000-000000000002`

That admin sees a blank CRM (no Belle customers, visits, expenses, or reports data). Anything they add stays in their salon only.

## 3. Connect the React app
```bash
cp .env.example .env
```
Fill in from Supabase **Project Settings → API**:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- Optional: `VITE_WALLET_PUBLIC_BASE_URL` = the public HTTPS URL of this CRM (used inside WhatsApp wallet links). If omitted, the browser origin is used.

Then:
```bash
npm install
npm run dev
```

## 4. Deploy Edge Functions
```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy send-whatsapp
npx supabase functions deploy whatsapp-webhook
npx supabase functions deploy wallet-pass
npx supabase functions deploy automate-whatsapp-reminders
npx supabase functions deploy whatsapp-embedded-signup
npx supabase functions deploy customer-profile
```

### WhatsApp secrets
WhatsApp sending is through **360dialog** (API key saved in the CRM). These Meta Cloud API secrets are no longer required for the live number **+971 56 140 4016**:

```bash
npx supabase secrets set WHATSAPP_WEBHOOK_VERIFY_TOKEN=belle_crm_wa_verify
npx supabase secrets set CRON_SECRET=pick-a-long-random-string
```

Connect the channel in the app under **WhatsApp → API settings** (owner): paste the 360dialog Hub API key and click **Save 360dialog**.

### Automatic customer reminders (30 / 60 / 90 days)
1. In the CRM: **Settings → Customer reminders** → enable automation and save days (default 30/60/90).
2. Deploy `automate-whatsapp-reminders`.
3. In Supabase Dashboard → **Edge Functions** → `automate-whatsapp-reminders` → **Schedules** (or Cron):
   - Cron: `0 6 * * *` (06:00 UTC = **10:00 Dubai**)
   - Header: `x-cron-secret: <same as CRON_SECRET>`
4. Each day it sends **once** per customer per reminder tier after their last visit:
   - open 24h WhatsApp window → free-form text  
   - otherwise → Meta template (`reminder_30_day` / `reminder_60_day` / `reminder_90_day`)
5. Manual test:
```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/automate-whatsapp-reminders" \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

### WhatsApp webhook (inbox + 24h window)
1. Run SQL migration `supabase/migrations/005_whatsapp_window_status.sql` in the Supabase SQL editor.
2. Deploy `whatsapp-webhook` (JWT verification is off — 360dialog cannot send a Supabase JWT).
3. In the **360dialog Hub**, set the **phone number webhook** to:
   - `https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp-webhook`
4. When a customer messages **+971 56 140 4016**, `last_whatsapp_inbound_at` is updated and free-form text is allowed for 24 hours.
5. Outside that window, `send-whatsapp` sends an approved template instead of free-form text.
6. Status webhooks update CRM rows to Sent / Delivered / Read / Failed.

### Loyalty wallet secrets (Apple)
From Apple Developer → Certificates, Identifiers & Profiles → **Pass Type IDs**:
```bash
npx supabase secrets set APPLE_PASS_TYPE_ID=pass.com.yourbrand.loyalty
npx supabase secrets set APPLE_TEAM_ID=YOURTEAMID
npx supabase secrets set APPLE_PASS_CERT_PEM="-----BEGIN CERTIFICATE-----..."
npx supabase secrets set APPLE_PASS_KEY_PEM="-----BEGIN PRIVATE KEY-----..."
npx supabase secrets set APPLE_WWDR_CERT_PEM="-----BEGIN CERTIFICATE-----..."
# optional if key is encrypted:
# npx supabase secrets set APPLE_PASS_KEY_PASSPHRASE=...
```

Use PEM text with `\n` for newlines if your secret UI requires a single line.

### Loyalty wallet secrets (Google)
From Google Pay & Wallet Console + a service account with Wallet API access:
```bash
npx supabase secrets set GOOGLE_WALLET_ISSUER_ID=your_issuer_id
npx supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
npx supabase secrets set GOOGLE_WALLET_CLASS_SUFFIX=belle_loyalty
```

Create a **Loyalty class** in Google Wallet with id `{issuerId}.belle_loyalty` (or match `GOOGLE_WALLET_CLASS_SUFFIX`).

## 5. WhatsApp via 360dialog (Coexistence)

Live number: **+971 56 140 4016**. Onboard in the **360dialog Hub** using the **new Meta Business portfolio**. Do not use the retired Cloud API number **050 980 1883**.

1. Hub → **Add channel** → pick a plan → enter **+971 56 140 4016** → **Yes, Business App**.
2. Complete Meta Signup on the **new portfolio**, scan the QR code in the WhatsApp Business app, optionally share chat history.
3. Wait until the channel is ready (can take several minutes).
4. In the CRM: **WhatsApp → API settings** → paste the Hub **API key** → **Save 360dialog**.
5. Confirm the **phone number webhook** in the Hub is:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp-webhook`

Deploy `send-whatsapp`, `whatsapp-webhook`, and `automate-whatsapp-reminders` after this change.

The CRM then:
- Sends inbox / templates / reminders through 360dialog (`D360-API-KEY`)
- Receives inbound messages and **Business-app echoes** (`smb_message_echoes`) in the inbox
- Does not unregister the WhatsApp Business app number

Templates still need to be approved on the WABA attached to this 360dialog channel (new portfolio). Cold text outside the 24h window uses those approved templates.

## 6. How post-visit wallet works
1. Staff saves a visit in the CRM.
2. CRM ensures the customer has a `wallet_token`.
3. WhatsApp sends thank-you + link `https://your-crm/w/{wallet_token}`.
4. Customer opens the public page and taps **Add to Apple Wallet** or **Add to Google Wallet**.
5. `wallet-pass` Edge Function issues the signed pass (Apple `.pkpass` or Google save JWT).

## 7. Permissions reminder
- **Owner**: full CRM (dashboard, costs, reports, staff, settings, vouchers, WhatsApp)
- **Raghad**: customers, visits, services/pricing, WhatsApp only

## Regenerating customer/service seed
```bash
node scripts/generate-seed-sql.mjs
```
