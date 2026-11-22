import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { daysUntil, formatDocExpiry, getStaffDocumentAlerts } from '../lib/staffDocuments'
import type { StaffDocument, StaffUser } from '../types'
import {
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusPill,
  Textarea,
  Toast,
  cn,
} from '../components/ui'
import { BrandLogo } from '../components/BrandLogo'
import { formatLocalPhone, PHONE_PLACEHOLDER } from '../lib/phone'
import { formatAED } from '../lib/format'
import { defaultLoyaltyTiers as loyaltyTiers } from '../lib/loyalty'

const emptyDoc = (): StaffDocument => ({ number: '', expiryDate: '', nationality: '', notes: '' })

function ExpiryBadge({ expiryDate, reminderDays }: { expiryDate?: string; reminderDays: number }) {
  const days = daysUntil(expiryDate)
  if (days === null) return <span className="text-xs text-muted">Not set</span>
  if (days < 0) return <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">Expired</span>
  if (days <= reminderDays)
    return (
      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
        {days}d left
      </span>
    )
  return <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">{days}d left</span>
}

export function StaffPage() {
  const { isAdmin, user } = useAuth()
  const { staffMembers, settings, addStaff, updateStaff, payStaffSalary } =
    useData()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<StaffUser | null>(null)
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'staff' as 'admin' | 'staff',
    jobTitle: '',
    nationality: '',
    joinDate: '',
    salary: '',
    notes: '',
    passport: emptyDoc(),
    visa: emptyDoc(),
    emiratesId: emptyDoc(),
  })

  const alerts = useMemo(
    () => getStaffDocumentAlerts(staffMembers, settings.staffDocumentReminderDays),
    [staffMembers, settings.staffDocumentReminderDays],
  )

  const payrollTotal = useMemo(
    () =>
      staffMembers
        .filter((s) => s.status === 'active')
        .reduce((sum, s) => sum + (s.salary ?? 0), 0),
    [staffMembers],
  )

  const resetForm = () => {
    setForm({
      name: '',
      email: '',
      phone: '',
      role: 'staff',
      jobTitle: '',
      nationality: '',
      joinDate: '',
      salary: '',
      notes: '',
      passport: emptyDoc(),
      visa: emptyDoc(),
      emiratesId: emptyDoc(),
    })
  }

  const paidThisMonth = (person: StaffUser) => {
    if (!person.lastSalaryPaidAt) return false
    const paid = new Date(person.lastSalaryPaidAt)
    const now = new Date()
    return paid.getFullYear() === now.getFullYear() && paid.getMonth() === now.getMonth()
  }

  const markSalaryPaid = async (person: StaffUser) => {
    const result = await payStaffSalary(person.id, user?.id ?? '')
    if ('error' in result) {
      setToast(result.error)
      return
    }
    setToast(`Salary paid for ${person.name} — ${formatAED(person.salary ?? 0)} added to Costs`)
  }

  const openCreate = () => {
    resetForm()
    setEditing(null)
    setOpen(true)
  }

  const openEdit = (person: StaffUser) => {
    setEditing(person)
    setForm({
      name: person.name,
      email: person.email,
      phone: person.phone ? formatLocalPhone(person.phone) : '',
      role: person.role,
      jobTitle: person.jobTitle ?? '',
      nationality: person.nationality ?? '',
      joinDate: person.joinDate ?? '',
      salary: person.salary != null ? String(person.salary) : '',
      notes: person.notes ?? '',
      passport: { ...emptyDoc(), ...person.passport },
      visa: { ...emptyDoc(), ...person.visa },
      emiratesId: { ...emptyDoc(), ...person.emiratesId },
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      setToast('Name is required')
      return
    }
    const salaryValue = form.salary.trim() === '' ? undefined : Number(form.salary)
    if (salaryValue != null && (Number.isNaN(salaryValue) || salaryValue < 0)) {
      setToast('Salary must be a valid amount')
      return
    }
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || `${form.name.toLowerCase().replace(/\s+/g, '.')}@bellebeauty.ae`,
      phone: form.phone || undefined,
      role: form.role,
      status: 'active' as const,
      salonId: editing?.salonId ?? user?.salonId ?? '',
      jobTitle: form.jobTitle || undefined,
      nationality: form.nationality || undefined,
      joinDate: form.joinDate || undefined,
      salary: salaryValue,
      notes: form.notes || undefined,
      passport: form.passport.number || form.passport.expiryDate ? form.passport : undefined,
      visa: form.visa.number || form.visa.expiryDate ? form.visa : undefined,
      emiratesId: form.emiratesId.number || form.emiratesId.expiryDate ? form.emiratesId : undefined,
    }

    if (editing) {
      await updateStaff(editing.id, payload)
      setToast('Staff profile updated')
    } else {
      const result = await addStaff(payload)
      if (result && 'error' in result) {
        setToast(result.error)
        return
      }
      setToast('Staff member added')
    }
    setOpen(false)
    setEditing(null)
    resetForm()
  }

  if (!isAdmin) {
    return (
      <EmptyState
        title="Admin access required"
        description="Staff documents and accounts are managed by salon administrators."
      />
    )
  }

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Team accounts, salaries, and passport / visa / Emirates ID tracking."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add staff
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1 bg-rose" />
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Active staff</p>
          <p className="mt-2 font-display text-3xl text-ink">
            {staffMembers.filter((s) => s.status === 'active').length}
          </p>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1 bg-gold" />
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Monthly payroll</p>
          <p className="mt-2 font-display text-3xl text-ink">{formatAED(payrollTotal)}</p>
          <p className="mt-1 text-xs text-muted">Sum of active staff salaries</p>
        </Card>
      </div>
      {alerts.length > 0 ? (
        <Card className="mb-4 border-warning/30 bg-warning/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
            <div className="flex-1">
              <h3 className="font-display text-xl text-ink">Documents needing attention</h3>
              <p className="text-sm text-muted">
                Expired or within {settings.staffDocumentReminderDays} days — owner: {settings.ownerWhatsapp}
              </p>
              <ul className="mt-3 space-y-2">
                {alerts.map((a) => (
                  <li
                    key={`${a.staffId}-${a.documentType}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm"
                  >
                    <span>
                      <strong>{a.staffName}</strong> · {a.label}
                      {a.number ? ` (${a.number})` : ''} · {formatDocExpiry(a.expiryDate)}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-medium',
                        a.status === 'expired' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning',
                      )}
                    >
                      {a.status === 'expired' ? `Expired ${Math.abs(a.daysRemaining)}d ago` : `${a.daysRemaining}d left`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-blush/50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Salary / month</th>
                  <th className="px-5 py-3">Last paid</th>
                  <th className="px-5 py-3">Passport</th>
                  <th className="px-5 py-3">Visa</th>
                  <th className="px-5 py-3">Emirates ID</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {staffMembers.map((p) => (
                  <tr key={p.id} className="border-t border-line/80">
                    <td className="px-5 py-3">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted">{p.jobTitle || p.email}</p>
                    </td>
                    <td className="px-5 py-3 capitalize">{p.role}</td>
                    <td className="px-5 py-3 font-medium">
                      {p.salary != null ? formatAED(p.salary) : '—'}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {p.lastSalaryPaidAt
                        ? new Date(p.lastSalaryPaidAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                      {paidThisMonth(p) ? (
                        <span className="mt-1 block text-xs font-medium text-success">Paid this month</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <div className="space-y-1">
                        <p className="text-xs text-muted">{p.passport?.number || '—'}</p>
                        <ExpiryBadge expiryDate={p.passport?.expiryDate} reminderDays={settings.staffDocumentReminderDays} />
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="space-y-1">
                        <p className="text-xs text-muted">{p.visa?.number || '—'}</p>
                        <ExpiryBadge expiryDate={p.visa?.expiryDate} reminderDays={settings.staffDocumentReminderDays} />
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="space-y-1">
                        <p className="text-xs text-muted">{p.emiratesId?.number || '—'}</p>
                        <ExpiryBadge
                          expiryDate={p.emiratesId?.expiryDate}
                          reminderDays={settings.staffDocumentReminderDays}
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={p.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          size="sm"
                          variant={paidThisMonth(p) ? 'outline' : 'secondary'}
                          disabled={p.status !== 'active' || !p.salary || paidThisMonth(p)}
                          onClick={() => markSalaryPaid(p)}
                          title={
                            !p.salary
                              ? 'Set a salary first'
                              : paidThisMonth(p)
                                ? 'Already paid this month'
                                : `Pay ${formatAED(p.salary)}`
                          }
                        >
                          {paidThisMonth(p) ? 'Paid' : 'Pay salary'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={p.id === user?.id && p.status === 'active'}
                          title={
                            p.id === user?.id && p.status === 'active'
                              ? 'You cannot disable your own account'
                              : undefined
                          }
                          onClick={() => {
                            if (p.id === user?.id && p.status === 'active') {
                              setToast('You cannot disable your own account')
                              return
                            }
                            void updateStaff(p.id, { status: p.status === 'active' ? 'disabled' : 'active' })
                            setToast(`${p.name} ${p.status === 'active' ? 'disabled' : 'enabled'}`)
                          }}
                        >
                          {p.status === 'active' ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          setEditing(null)
        }}
        title={editing ? 'Edit staff profile' : 'Add staff member'}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false)
                setEditing(null)
              }}
            >
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </>
        }
      >
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input
              label="Phone"
              value={form.phone}
              placeholder={PHONE_PLACEHOLDER}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'staff' })}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </Select>
            <Input label="Job title" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
            <Input
              label="Monthly salary (AED)"
              type="number"
              min={0}
              placeholder="e.g. 3500"
              value={form.salary}
              onChange={(e) => setForm({ ...form, salary: e.target.value })}
            />
            <Input
              label="Nationality"
              value={form.nationality}
              onChange={(e) => setForm({ ...form, nationality: e.target.value })}
            />
            <Input
              label="Join date"
              type="date"
              value={form.joinDate}
              onChange={(e) => setForm({ ...form, joinDate: e.target.value })}
            />
          </div>

          {([
            ['passport', 'Passport'],
            ['visa', 'Visa'],
            ['emiratesId', 'Emirates ID'],
          ] as const).map(([key, label]) => (
            <div key={key} className="rounded-xl border border-line bg-blush/30 p-3">
              <p className="mb-2 text-sm font-medium text-ink">{label}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Number"
                  value={form[key].number ?? ''}
                  onChange={(e) => setForm({ ...form, [key]: { ...form[key], number: e.target.value } })}
                />
                <Input
                  label="Expiry date"
                  type="date"
                  value={form[key].expiryDate ?? ''}
                  onChange={(e) => setForm({ ...form, [key]: { ...form[key], expiryDate: e.target.value } })}
                />
              </div>
            </div>
          ))}

          <Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Modal>

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </div>
  )
}

export function SettingsPage() {
  const { isAdmin } = useAuth()
  const { settings, updateSettings } = useData()
  const [section, setSection] = useState<'salon' | 'loyalty' | 'whatsapp' | 'reminders' | 'staffDocs'>('salon')
  const [toast, setToast] = useState('')
  const [local, setLocal] = useState(settings)

  useEffect(() => {
    setLocal({
      ...settings,
      phone: formatLocalPhone(settings.phone),
      whatsapp: formatLocalPhone(settings.whatsapp),
      ownerWhatsapp: formatLocalPhone(settings.ownerWhatsapp),
    })
  }, [settings])

  if (!isAdmin) {
    return <EmptyState title="Admin access required" description="System settings are restricted to administrators." />
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Salon profile, loyalty, WhatsApp, and customer reminders." />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['salon', 'Salon'],
            ['loyalty', 'Loyalty'],
            ['whatsapp', 'WhatsApp'],
            ['reminders', 'Customer reminders'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              section === key ? 'bg-rose text-white' : 'border border-line bg-white text-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'salon' ? (
        <Card className="max-w-2xl space-y-3">
          <Input label="Salon name" value={local.salonName} onChange={(e) => setLocal({ ...local, salonName: e.target.value })} />
          <Input
            label="Phone"
            value={local.phone}
            placeholder={PHONE_PLACEHOLDER}
            onChange={(e) => setLocal({ ...local, phone: e.target.value })}
          />
          <Input
            label="WhatsApp"
            value={local.whatsapp}
            placeholder={PHONE_PLACEHOLDER}
            onChange={(e) => setLocal({ ...local, whatsapp: e.target.value })}
          />
          <Input label="Address" value={local.address} onChange={(e) => setLocal({ ...local, address: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Currency" value={local.currency} onChange={(e) => setLocal({ ...local, currency: e.target.value })} />
            <Input label="Timezone" value={local.timezone} onChange={(e) => setLocal({ ...local, timezone: e.target.value })} />
          </div>
          <div className="rounded-xl border border-line bg-white px-4 py-6 text-center">
            <BrandLogo variant="plain" className="mx-auto" imgClassName="h-28" />
            <p className="mt-2 text-xs text-muted">Current brand logo</p>
          </div>
          <Button
              onClick={() => {
                void updateSettings(local).then(() => setToast('Salon settings saved'))
              }}
          >
            Save salon settings
          </Button>
        </Card>
      ) : null}

      {section === 'loyalty' ? (
        <div className="space-y-4">
          <Card>
            <h3 className="font-display text-2xl">Current rules</h3>
            <p className="mt-1 text-sm text-muted">
              Tiers are calculated from lifetime spend. After 45 days without a visit, Gold and Premium lapse to Regular
              (spend is kept). They get a WhatsApp 7 days before, then again when the level changes, and a restore
              message on the next visit. Unused gifts get a reminder 7 days before they expire (90 days from purchase).
              Free gift / complimentary services still require the customer to pay delivery (AED 30 or 50).
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <span className="font-medium text-ink">Regular (AED 0–1,499)</span>
                <span className="text-muted"> — standard booking, no loyalty gifts yet</span>
              </li>
              <li>
                <span className="font-medium text-ink">Gold (AED 1,500–2,999)</span>
                <span className="text-muted">
                  {' '}
                  — 30% birthday discount · 1 free manicure & pedicure · after each extra AED 1,000: 1 free Classic Mani
                  & Pedi · 5% discount for life
                </span>
              </li>
              <li>
                <span className="font-medium text-ink">Premium (AED 3,000+)</span>
                <span className="text-muted">
                  {' '}
                  — any 1 service free every 30 days · 50% birthday discount · 5% for life · after each AED 1,000: 1 free
                  manicure & pedicure (valid 30 days)
                </span>
              </li>
            </ul>
          </Card>
          <div className="grid gap-4 lg:grid-cols-3">
            {loyaltyTiers.map((tier) => (
              <Card key={tier.id}>
                <h3 className="font-display text-2xl">{tier.name}</h3>
                <p className="mt-1 text-sm text-muted">
                  AED {tier.minimumSpend.toLocaleString()}
                  {tier.maximumSpend != null ? `–${tier.maximumSpend.toLocaleString()}` : '+'}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-ink">{tier.benefits}</p>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {section === 'whatsapp' ? (
        <Card className="max-w-2xl space-y-3">
          <p className="text-sm text-muted">
            Connect the business number in <strong>WhatsApp → API settings</strong> with the 360dialog Hub API key.
            Do not paste Meta tokens here.
          </p>
        </Card>
      ) : null}

      {section === 'reminders' ? (
        <Card className="max-w-xl space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={local.automationEnabled}
              onChange={(e) => setLocal({ ...local, automationEnabled: e.target.checked })}
            />
            Enable customer reminder automation
          </label>
          <p className="text-sm text-muted">
            When enabled, the system sends WhatsApp reminders once per day for customers inactive for your reminder
            days (default 30 / 60 / 90). Recent chats get a normal message; older chats use an approved Meta template.
          </p>
          {['First reminder (days)', 'Second reminder (days)', 'Third reminder (days)'].map((label, i) => (
            <Input
              key={label}
              label={label}
              type="number"
              value={local.reminderDays[i]}
              onChange={(e) => {
                const next = [...local.reminderDays]
                next[i] = Number(e.target.value)
                setLocal({ ...local, reminderDays: next })
              }}
            />
          ))}
          <Button
            onClick={() => {
              void updateSettings(local).then(() => setToast('Customer reminder settings saved'))
            }}
          >
            Save reminders
          </Button>
        </Card>
      ) : null}

      {section === 'staffDocs' ? (
        <Card className="max-w-xl space-y-4">
          <p className="text-sm text-muted">
            When a staff passport, visa, or Emirates ID is within this window, the system queues a WhatsApp reminder to
            the owner.
          </p>
          <Input
            label="Owner name"
            value={local.ownerName}
            onChange={(e) => setLocal({ ...local, ownerName: e.target.value })}
          />
          <Input
            label="Owner WhatsApp"
            value={local.ownerWhatsapp}
            onChange={(e) => setLocal({ ...local, ownerWhatsapp: e.target.value })}
          />
          <Input
            label="Remind owner how many days before expiry"
            type="number"
            value={local.staffDocumentReminderDays}
            onChange={(e) => setLocal({ ...local, staffDocumentReminderDays: Number(e.target.value) })}
          />
          <Button
            onClick={() => {
              void updateSettings(local).then(() => setToast('Staff document reminder settings saved'))
            }}
          >
            Save staff document settings
          </Button>
        </Card>
      ) : null}

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </div>
  )
}
