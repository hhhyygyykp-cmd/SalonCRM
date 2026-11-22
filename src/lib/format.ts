export function formatAED(amount: number) {
  return `AED ${Number(amount || 0).toLocaleString('en-AE', { maximumFractionDigits: 2 })}`
}

export function daysSince(date?: string) {
  if (!date) return null
  const start = new Date(date)
  const now = new Date()
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

/** Local `YYYY-MM-DDTHH:mm` for datetime-local inputs. */
export function toDatetimeLocal(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
