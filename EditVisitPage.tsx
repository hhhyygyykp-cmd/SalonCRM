import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { formatAED, toDatetimeLocal } from '../lib/format'
import { formatLocalPhone } from '../lib/phone'
import { formatPaymentMethods, parsePaymentMethods } from '../lib/payment'
import { LOYALTY_DELIVERY_NOTE } from '../lib/loyalty'
import { calcVoucherDiscount, voucherStatus } from '../lib/vouchers'
import { useData } from '../context/DataContext'
import { Button, Card, EmptyState, PageHeader, PaymentChecklist, Select, Textarea } from '../components/ui'
import { ServicePicker } from '../components/ServicePicker'
import type { Customer, PaymentMethod, Visit } from '../types'

const DELIVERY_OPTIONS = [
  { value: 50, label: 'AED 50' },
  { value: 30, label: 'AED 30' },
  { value: 0, label: 'Free delivery' },
] as const

type Line = {
  serviceId: string
  serviceName: string
  price: number
  quantity: number
  custom: boolean
}

export function EditVisitPage() {
  const { visitId } = useParams()
  const navigate = useNavigate()
  const { visits, customers, loading } = useData()
  const visit = visits.find((v) => v.id === visitId)
  const customer = visit ? customers.find((c) => c.id === visit.customerId) : undefined

  if (loading) {
    return <p className="py-16 text-center text-sm text-muted">Loading visit…</p>
  }
  if (!visit || !customer) {
    return (
      <EmptyState
        title="Visit not found"
        description="This visit is not in the list."
        action={<Button onClick={() => navigate('/visits')}>Back to visits</Button>}
      />
    )
  }

  return <EditVisitForm key={visit.id} visit={visit} customer={customer} />
}

function EditVisitForm({ visit, customer }: { visit: Visit; customer: Customer }) {
  const navigate = useNavigate()
  const { services, staffMembers, vouchers, updateVisit } = useData()
  const catalog = useMemo(
    () => services.filter((s) => s.active || visit.services.some((l) => l.serviceId === s.id)),
    [services, visit.services],
  )

  const [staffId, setStaffId] = useState(visit.staffId)
  const [visitDate, setVisitDate] = useState(toDatetimeLocal(visit.visitDate))
  const [discount, setDiscount] = useState(visit.discount)
  const [voucherId, setVoucherId] = useState(visit.voucherId ?? '')
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(() => {
    const parsed = parsePaymentMethods(visit.paymentMethod)
    return parsed.length ? parsed : ['Card']
  })
  const [deliveryFee, setDeliveryFee] = useState<number>(visit.deliveryFee ?? 50)
  const [notes, setNotes] = useState(visit.notes ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [lines, setLines] = useState<Line[]>(() => {
    const existing = visit.services.map((s) => ({
      serviceId: s.serviceId,
      serviceName: s.serviceName,
      price: s.price,
      quantity: s.quantity,
      custom:
        !services.some((svc) => svc.id === s.serviceId) ||
        s.serviceId === 'imported' ||
        s.serviceId.startsWith('custom'),
    }))
    if (existing.length) return existing
    const first = services.find((s) => s.active)
    if (first) {
      return [{ serviceId: first.id, serviceName: first.name, price: first.defaultPrice, quantity: 1, custom: false }]
    }
    return [{ serviceId: `custom-${Date.now()}`, serviceName: '', price: 0, quantity: 1, custom: true }]
  })

  const usableVouchers = vouchers.filter((v) => voucherStatus(v) === 'active' || v.id === visit.voucherId)
  const selectedVoucher = vouchers.find((v) => v.id === voucherId)
  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.price * l.quantity, 0), [lines])
  const voucherDiscount = calcVoucherDiscount(selectedVoucher, subtotal, {
    ignoreUsage: Boolean(visit.voucherId && voucherId === visit.voucherId),
    ignoreActive: Boolean(visit.voucherId && voucherId === visit.voucherId),
  })
  const totalDiscount = Math.min(subtotal, discount + voucherDiscount)
  const finalTotal = Math.max(subtotal - totalDiscount, 0) + deliveryFee

  const addCatalogLine = () => {
    setLines((prev) => [...prev, { serviceId: '', serviceName: '', price: 0, quantity: 1, custom: false }])
  }

  const addCustomLine = () => {
    setLines((prev) => [
      ...prev,
      { serviceId: `custom-${Date.now()}`, serviceName: '', price: 0, quantity: 1, custom: true },
    ])
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!lines.length) {
      setError('Add at least one service.')
      return
    }
    if (lines.some((l) => (l.custom ? !l.serviceName.trim() : !l.serviceId))) {
      setError('Choose a category and a service for every line.')
      return
    }
    if (!staffId) {
      setError('Choose who did this visit.')
      return
    }
    const parsed = new Date(visitDate)
    if (Number.isNaN(parsed.getTime())) {
      setError('Enter a valid date and time.')
      return
    }
    if (paymentMethods.length === 0) {
      setError('Tick every way they paid.')
      return
    }
    setSaving(true)
    setError('')
    const result = await updateVisit(visit.id, {
      staffId,
      visitDate: parsed.toISOString(),
      discount,
      voucherId: voucherId || undefined,
      deliveryFee,
      paymentMethod: formatPaymentMethods(paymentMethods),
      notes: notes || undefined,
      services: lines.map((l) => ({
        serviceId: l.serviceId,
        serviceName: l.custom ? l.serviceName : (catalog.find((s) => s.id === l.serviceId)?.name ?? l.serviceName),
        price: l.price,
        quantity: l.quantity,
      })),
    })
    setSaving(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    navigate(`/customers/${customer.id}`)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Edit visit"
        subtitle={`${customer.fullName} · ${formatLocalPhone(customer.phone)}`}
      />
      <Card>
        <form className="space-y-5" onSubmit={onSubmit}>
          {visit.giftPurchaseId || visit.giftRedeemId ? (
            <p className="rounded-xl border border-line bg-blush/30 px-4 py-3 text-sm text-muted">
              Gift link on this visit is kept as-is. You can still correct services, prices, date, and notes.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Staff" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Select staff…</option>
              {staffMembers
                .filter((s) => s.status === 'active' || s.id === visit.staffId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Date / time</span>
              <input
                type="datetime-local"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
                required
              />
            </label>
            <PaymentChecklist value={paymentMethods} onChange={setPaymentMethods} />
            <Select
              label="Delivery cost"
              value={String(deliveryFee)}
              onChange={(e) => setDeliveryFee(Number(e.target.value))}
            >
              {DELIVERY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <p className="sm:col-span-2 text-xs text-muted">{LOYALTY_DELIVERY_NOTE}</p>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-xl">Services</h3>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={addCatalogLine}>
                  <Plus className="h-3.5 w-3.5" />
                  Add service
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={addCustomLine}>
                  Custom line
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div
                  key={`${line.serviceId}-${index}`}
                  className="flex flex-col gap-3 rounded-xl border border-line bg-blush/30 p-3 lg:flex-row lg:items-end"
                >
                  {line.custom ? (
                    <input
                      value={line.serviceName}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, serviceName: e.target.value } : l)),
                        )
                      }
                      placeholder="Service name"
                      className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2.5 text-sm"
                      required
                    />
                  ) : (
                    <ServicePicker
                      services={catalog}
                      value={line.serviceId}
                      onChange={(svc) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === index
                              ? {
                                  ...l,
                                  serviceId: svc?.id ?? '',
                                  serviceName: svc?.name ?? '',
                                  price: svc?.defaultPrice ?? 0,
                                  custom: false,
                                }
                              : l,
                          ),
                        )
                      }
                    />
                  )}
                  <input
                    type="number"
                    min={0}
                    value={line.price}
                    onChange={(e) =>
                      setLines((prev) => prev.map((l, i) => (i === index ? { ...l, price: Number(e.target.value) } : l)))
                    }
                    className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm sm:w-28"
                    aria-label="Price"
                  />
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) => (i === index ? { ...l, quantity: Number(e.target.value) } : l)),
                      )
                    }
                    className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm sm:w-20"
                    aria-label="Quantity"
                  />
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-xl text-muted hover:bg-white hover:text-danger sm:self-auto"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                    disabled={lines.length === 1}
                    aria-label="Remove service"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Select
            label="Voucher"
            value={voucherId}
            onChange={(e) => setVoucherId(e.target.value)}
          >
            <option value="">No voucher</option>
            {usableVouchers.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code} — {v.type === 'percent' ? `${v.value}%` : formatAED(v.value)}
                {v.minSpend ? ` (min ${formatAED(v.minSpend)})` : ''}
              </option>
            ))}
          </Select>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl bg-blush/50 px-4 py-3">
              <p className="text-xs text-muted">Subtotal</p>
              <p className="font-display text-xl">{formatAED(subtotal)}</p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Extra discount</span>
              <input
                type="number"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm"
              />
            </label>
            <div className="rounded-xl bg-blush/50 px-4 py-3">
              <p className="text-xs text-muted">Voucher</p>
              <p className="font-display text-xl">−{formatAED(voucherDiscount)}</p>
            </div>
            <div className="rounded-xl bg-blush/50 px-4 py-3">
              <p className="text-xs text-muted">Delivery</p>
              <p className="font-display text-xl">{deliveryFee === 0 ? 'Free' : formatAED(deliveryFee)}</p>
            </div>
            <div className="rounded-xl bg-rose/10 px-4 py-3">
              <p className="text-xs text-muted">Final bill</p>
              <p className="font-display text-xl text-rose-deep">{formatAED(finalTotal)}</p>
            </div>
          </div>

          <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(`/customers/${customer.id}`)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
