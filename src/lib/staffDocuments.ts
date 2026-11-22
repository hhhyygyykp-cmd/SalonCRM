import type { StaffDocumentAlert, StaffDocumentType, StaffUser, SalonSettings } from '../types'
import { salonSettings as defaultSettings } from '../data/mockData'

const DOC_LABELS: Record<StaffDocumentType, string> = {
  passport: 'Passport',
  visa: 'Visa',
  emiratesId: 'Emirates ID',
}

export function daysUntil(date?: string) {
  if (!date) return null
  const end = new Date(date)
  end.setHours(0, 0, 0, 0)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

export function getStaffDocumentAlerts(
  staffList: StaffUser[],
  reminderDays = defaultSettings.staffDocumentReminderDays,
): StaffDocumentAlert[] {
  const alerts: StaffDocumentAlert[] = []

  for (const person of staffList) {
    if (person.status !== 'active') continue
    const docs: Array<{ type: StaffDocumentType; expiry?: string; number?: string }> = [
      { type: 'passport', expiry: person.passport?.expiryDate, number: person.passport?.number },
      { type: 'visa', expiry: person.visa?.expiryDate, number: person.visa?.number },
      { type: 'emiratesId', expiry: person.emiratesId?.expiryDate, number: person.emiratesId?.number },
    ]

    for (const doc of docs) {
      if (!doc.expiry) continue
      const remaining = daysUntil(doc.expiry)
      if (remaining === null) continue
      let status: StaffDocumentAlert['status'] = 'ok'
      if (remaining < 0) status = 'expired'
      else if (remaining <= reminderDays) status = 'expiring'
      else continue

      alerts.push({
        staffId: person.id,
        staffName: person.name,
        documentType: doc.type,
        label: DOC_LABELS[doc.type],
        number: doc.number,
        expiryDate: doc.expiry,
        daysRemaining: remaining,
        status,
      })
    }
  }

  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining)
}

export function formatDocExpiry(date?: string) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function buildOwnerDocumentMessage(
  alert: StaffDocumentAlert,
  settings: Pick<SalonSettings, 'salonName' | 'ownerName'>,
) {
  const daysText =
    alert.daysRemaining < 0
      ? `expired ${Math.abs(alert.daysRemaining)} day(s) ago`
      : `${alert.daysRemaining} day(s) left`
  return `Hi ${settings.ownerName}, reminder from ${settings.salonName}:\n${alert.staffName} — ${alert.label} expires on ${formatDocExpiry(alert.expiryDate)} (${daysText}).\nPlease renew in time.`
}
