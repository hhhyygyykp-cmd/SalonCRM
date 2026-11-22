# Belle Beauty Lounge CRM

Premium salon CRM UI for **Belle Beauty Lounge** (Al Ain, UAE).

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Sign-in (demo accounts only)

- **Admin:** `admin@bellebeauty.ae` / `demo123`
- **Staff:** `staff@bellebeauty.ae` / `demo123`

Everything else uses real Belle Beauty Lounge customers from your spreadsheet. Visits/spend start empty and update when you record them (saved in the browser).

## Business details

- **Salon:** Belle Beauty Lounge
- **WhatsApp / phone:** +971 56 140 4016
- **Logo:** `public/belle-logo.png`
- **Customers:** **272** real contacts from `BELLE BEAUTY LOUNGE COSTUMER DETAILS.xlsx`

## Re-import customers

```bash
node scripts/generate-mock-data.mjs
```

Then clear site localStorage key `belle-beauty-live-data` if you need a fresh browser copy.

## Note

WhatsApp is 360dialog Coexistence on +971 56 140 4016.
