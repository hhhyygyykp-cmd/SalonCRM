import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Ticket, Trash2 } from 'lucide-react'
import { formatAED } from '../lib/format'
import { formatLocalPhone, PHONE_PLACEHOLDER, phoneDigits, phonesMatch } from '../lib/phone'
import { getTierConfig, LOYALTY_DELIVERY_NOTE, premiumThousandRewardsEarned, availableLoyaltyRewards, findClassicManiPedi, premiumMonthlyCooldownDays } from '../lib/loyalty'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { calcVoucherDiscount, voucherStatus } from '../lib/vouchers'
import { PACKAGE_SERVICE_CATEGORY } from '../lib/memberships'
import { AreaSelect } from '../components/AreaSelect'
import { ServicePicker } from '../components/ServicePicker'
import {
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  PaymentChecklist,
  Select,
  StatusPill,
  Toast,
} from '../components/ui'
import type { LoyaltyRewardType, PaymentMethod, VoucherType } from '../types'
import { formatPaymentMethods } from '../lib/payment'

const DELIVERY_OPTIONS = [
  { value: 50, label: 'AED 50' },
  { value: 30, label: 'AED 30' },
  { value: 0, label: 'Free delivery' },
] as const

function deliveryLabel(fee: number | undefined) {
  if (fee == null) return '—'
  if (fee === 0) return 'Free'
  return formatAED(fee)
}

export function VisitsPage() {
  const { isAdmin } = useAuth()
  const { visits, customers, staffMembers, vouchers, addVoucher, updateVoucher } = useData()
  const sorted = [...visits].sort((a, b) => +new Date(b.visitDate) - +new Date(a.visitDate))
  const getStaffName = (id: string) => staffMembers.find((s) => s.id === id)?.name ?? '—'
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'fixed' as VoucherType,
    value: 50,
    minSpend: 0,
    maxUses: 100,
    expiresAt: '',
    notes: '',
  })

  return (
    <div>
      <PageHeader
        title="Visits"
        subtitle="Record visits and apply Belle vouchers at checkout."
        actions={
          <>
            {isAdmin ? (
              <Button variant="outline" onClick={() => setVoucherOpen(true)}>
                <Ticket className="h-4 w-4" />
                New voucher
              </Button>
            ) : null}
            <Link to="/visits/new">
              <Button>
                <Plus className="h-4 w-4" />
                Add Visit
              </Button>
            </Link>
          </>
        }
      />

      {isAdmin ? (
      <Card className="mb-4" padding={false}>
        <div className="flex flex-col gap-2 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-xl">Vouchers</h3>
            <p className="text-sm text-muted">Create codes and apply them when saving a visit.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setVoucherOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add voucher
          </Button>
        </div>
        {vouchers.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No vouchers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-blush/50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Value</th>
                  <th className="px-5 py-3">Min spend</th>
                  <th className="px-5 py-3">Uses</th>
                  <th className="px-5 py-3">Expires</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => {
                  const status = voucherStatus(v)
                  return (
                    <tr key={v.id} className="border-t border-line/80">
                      <td className="px-5 py-3 font-medium tracking-wide">{v.code}</td>
                      <td className="px-5 py-3">{v.name}</td>
                      <td className="px-5 py-3">
                        {v.type === 'percent' ? `${v.value}%` : formatAED(v.value)}
                      </td>
                      <td className="px-5 py-3 text-muted">{v.minSpend ? formatAED(v.minSpend) : '—'}</td>
                      <td className="px-5 py-3 text-muted">
                        {v.usedCount}
                        {v.maxUses != null ? ` / ${v.maxUses}` : ''}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {v.expiresAt
                          ? new Date(v.expiresAt).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={status === 'active' ? 'active' : status === 'disabled' ? 'disabled' : 'Failed'} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            void updateVoucher(v.id, { active: !v.active })
                            setToast(`${v.code} ${v.active ? 'disabled' : 'enabled'}`)
                          }}
                        >
                          {v.active ? 'Disable' : 'Enable'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      ) : null}

      {sorted.length === 0 ? (
        <EmptyState
          title="No visits recorded yet"
          description="Your real customers are ready. Add the first visit and optionally apply a voucher."
          action={
            <Link to="/visits/new">
              <Button>
                <Plus className="h-4 w-4" />
                Add Visit
              </Button>
            </Link>
          }
        />
      ) : (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-blush/50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Services</th>
                  <th className="px-5 py-3">Staff</th>
                  <th className="px-5 py-3">Voucher</th>
                  <th className="px-5 py-3">Delivery</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Payment</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((v) => {
                  const customer = customers.find((c) => c.id === v.customerId)
                  return (
                    <tr key={v.id} className="border-t border-line/80">
                      <td className="px-5 py-3 whitespace-nowrap">
                        {new Date(v.visitDate).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <Link to={`/customers/${v.customerId}`} className="font-medium hover:text-rose">
                          {customer?.fullName ?? '—'}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {v.customerLocation ?? customer?.location ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {v.services.map((s) => s.serviceName).join(', ')}
                        {v.loyaltyRewardType ? (
                          <span className="ml-2">
                            <StatusPill status="Reward" />
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">{getStaffName(v.staffId)}</td>
                      <td className="px-5 py-3 text-muted">
                        {v.voucherCode
                          ? `${v.voucherCode}${v.voucherDiscount ? ` (−${formatAED(v.voucherDiscount)})` : ''}`
                          : '—'}
                      </td>
                      <td className="px-5 py-3 text-muted">{deliveryLabel(v.deliveryFee)}</td>
                      <td className="px-5 py-3 font-medium">{formatAED(v.finalTotal)}</td>
                      <td className="px-5 py-3 text-muted">{v.paymentMethod ?? '—'}</td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          to={`/visits/${v.id}/edit`}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-rose hover:bg-blush"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {isAdmin ? (
      <Modal
        open={voucherOpen}
        onClose={() => setVoucherOpen(false)}
        title="Create voucher"
        footer={
          <>
            <Button variant="ghost" onClick={() => setVoucherOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const result = await addVoucher({
                  code: form.code,
                  name: form.name || form.code,
                  type: form.type,
                  value: form.value,
                  minSpend: form.minSpend || undefined,
                  maxUses: form.maxUses || undefined,
                  expiresAt: form.expiresAt || undefined,
                  notes: form.notes || undefined,
                  active: true,
                })
                if ('error' in result) {
                  setToast(result.error)
                  return
                }
                setVoucherOpen(false)
                setForm({
                  code: '',
                  name: '',
                  type: 'fixed',
                  value: 50,
                  minSpend: 0,
                  maxUses: 100,
                  expiresAt: '',
                  notes: '',
                })
                setToast(`Voucher ${result.code} created`)
              }}
            >
              Save voucher
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Code"
            placeholder="BELLE50"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          />
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select
            label="Type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as VoucherType })}
          >
            <option value="fixed">Fixed AED amount</option>
            <option value="percent">Percentage %</option>
          </Select>
          <Input
            label={form.type === 'percent' ? 'Percent value' : 'AED value'}
            type="number"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Minimum spend (AED)"
              type="number"
              value={form.minSpend}
              onChange={(e) => setForm({ ...form, minSpend: Number(e.target.value) })}
            />
            <Input
              label="Max uses"
              type="number"
              value={form.maxUses}
              onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })}
            />
          </div>
          <Input
            label="Expiry date"
            type="date"
            value={form.expiresAt}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
          />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Modal>
      ) : null}

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </div>
  )
}

export function NewVisitPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { customers, services, vouchers, gifts, visits, addVisit, addCustomer } = useData()
  const presetCustomer = customers.find((c) => c.id === params.get('customerId'))

  const [phoneQuery, setPhoneQuery] = useState(presetCustomer ? formatLocalPhone(presetCustomer.phone) : '')
  const [lookupStatus, setLookupStatus] = useState<'idle' | 'found' | 'not_found'>(
    presetCustomer ? 'found' : 'idle',
  )
  const [customerId, setCustomerId] = useState(presetCustomer?.id ?? '')
  const [newCustomer, setNewCustomer] = useState({
    fullName: '',
    location: '',
    email: '',
  })
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 16))
  const [discount, setDiscount] = useState(0)
  const [voucherId, setVoucherId] = useState('')
  const [voucherCodeInput, setVoucherCodeInput] = useState('')
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(['Card'])
  const [deliveryFee, setDeliveryFee] = useState<number>(50)
  const [notes, setNotes] = useState('')
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [savingReceiver, setSavingReceiver] = useState(false)
  const [giftMode, setGiftMode] = useState<'none' | 'purchase' | 'redeem' | 'reward'>('none')
  const [receiverPhoneQuery, setReceiverPhoneQuery] = useState('')
  const [receiverLookupStatus, setReceiverLookupStatus] = useState<'idle' | 'found' | 'not_found'>('idle')
  const [receiverCustomerId, setReceiverCustomerId] = useState('')
  const [newReceiver, setNewReceiver] = useState({ fullName: '', location: '', email: '' })
  const [redeemGiftId, setRedeemGiftId] = useState('')
  const [rewardType, setRewardType] = useState<LoyaltyRewardType | ''>('')
  const [lines, setLines] = useState([{ serviceId: '', price: 0, quantity: 1 }])
  const activeServices = services.filter((s) => s.active)
  const pickerServices = useMemo(() => {
    if (giftMode === 'purchase') return activeServices
    return activeServices.filter((s) => s.category !== PACKAGE_SERVICE_CATEGORY)
  }, [activeServices, giftMode])

  const usableVouchers = vouchers.filter((v) => voucherStatus(v) === 'active')
  const selectedVoucher = vouchers.find((v) => v.id === voucherId)
  const selectedCustomer = customers.find((c) => c.id === customerId)
  const selectedReceiver = customers.find((c) => c.id === receiverCustomerId)
  const receiverValidGifts = useMemo(
    () =>
      gifts.filter(
        (g) => g.receiverCustomerId === customerId && g.status === 'valid',
      ),
    [gifts, customerId],
  )
  const selectedRedeemGift = gifts.find((g) => g.id === redeemGiftId)
  const availableRewards = useMemo(
    () => (selectedCustomer ? availableLoyaltyRewards(selectedCustomer, visits) : []),
    [selectedCustomer, visits],
  )
  const selectedReward = availableRewards.find((r) => r.type === rewardType)
  const monthlyCooldown = selectedCustomer ? premiumMonthlyCooldownDays(selectedCustomer.id, visits) : 0

  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.price * l.quantity, 0), [lines])
  const voucherDiscount = calcVoucherDiscount(selectedVoucher, subtotal)
  const totalDiscount = Math.min(subtotal, discount + voucherDiscount)
  const finalTotal = Math.max(subtotal - totalDiscount, 0) + deliveryFee

  const findCustomer = () => {
    const digits = phoneDigits(phoneQuery)
    if (digits.length < 7) {
      setError('Enter a phone number to search (at least 7 digits).')
      setLookupStatus('idle')
      setCustomerId('')
      return
    }
    const found = customers.find((c) => phonesMatch(c.phone, phoneQuery) || phonesMatch(c.whatsappPhone, phoneQuery))
    if (found) {
      setCustomerId(found.id)
      setPhoneQuery(formatLocalPhone(found.phone))
      setLookupStatus('found')
      setNewCustomer({ fullName: '', location: '', email: '' })
      setRedeemGiftId('')
      setError('')
      setToast(`Found ${found.fullName}`)
      return
    }
    setCustomerId('')
    setLookupStatus('not_found')
    setError('')
  }

  const clearCustomerSearch = () => {
    setPhoneQuery('')
    setCustomerId('')
    setLookupStatus('idle')
    setNewCustomer({ fullName: '', location: '', email: '' })
    setError('')
    setRedeemGiftId('')
  }

  const saveNewCustomer = async () => {
    if (savingCustomer) return
    if (!newCustomer.fullName.trim()) {
      setError('Enter the new customer name.')
      return
    }
    if (!phoneDigits(phoneQuery)) {
      setError('Phone number is required for the new customer.')
      return
    }
    if (!user?.id) {
      setError('You must be signed in to save a customer.')
      return
    }
    setSavingCustomer(true)
    setError('')
    try {
      const created = await addCustomer({
        fullName: newCustomer.fullName.trim(),
        phone: phoneQuery.trim(),
        email: newCustomer.email.trim() || undefined,
        location: newCustomer.location.trim() || undefined,
        createdBy: user.id,
      })
      if ('error' in created) {
        setError(created.error)
        return
      }
      setCustomerId(created.id)
      setPhoneQuery(formatLocalPhone(created.phone))
      setLookupStatus('found')
      setNewCustomer({ fullName: '', location: '', email: '' })
      setRedeemGiftId('')
      setToast(`Customer saved: ${created.fullName}`)
    } finally {
      setSavingCustomer(false)
    }
  }

  const findReceiver = () => {
    const digits = phoneDigits(receiverPhoneQuery)
    if (digits.length < 7) {
      setError('Enter the receiver phone (at least 7 digits).')
      setReceiverLookupStatus('idle')
      setReceiverCustomerId('')
      return
    }
    const found = customers.find(
      (c) => phonesMatch(c.phone, receiverPhoneQuery) || phonesMatch(c.whatsappPhone, receiverPhoneQuery),
    )
    if (found) {
      if (found.id === customerId) {
        setError('Receiver must be a different customer than the sender.')
        setReceiverLookupStatus('idle')
        setReceiverCustomerId('')
        return
      }
      setReceiverCustomerId(found.id)
      setReceiverPhoneQuery(formatLocalPhone(found.phone))
      setReceiverLookupStatus('found')
      setNewReceiver({ fullName: '', location: '', email: '' })
      setError('')
      setToast(`Receiver: ${found.fullName}`)
      return
    }
    setReceiverCustomerId('')
    setReceiverLookupStatus('not_found')
    setError('')
  }

  const clearReceiverSearch = () => {
    setReceiverPhoneQuery('')
    setReceiverCustomerId('')
    setReceiverLookupStatus('idle')
    setNewReceiver({ fullName: '', location: '', email: '' })
  }

  const saveNewReceiver = async () => {
    if (savingReceiver) return
    if (!newReceiver.fullName.trim()) {
      setError('Enter the gift receiver name.')
      return
    }
    if (!phoneDigits(receiverPhoneQuery)) {
      setError('Receiver phone is required.')
      return
    }
    if (!user?.id) {
      setError('You must be signed in to save a customer.')
      return
    }
    if (customerId && phonesMatch(receiverPhoneQuery, phoneQuery)) {
      setError('Receiver must be a different customer than the sender.')
      return
    }
    setSavingReceiver(true)
    setError('')
    try {
      const created = await addCustomer({
        fullName: newReceiver.fullName.trim(),
        phone: receiverPhoneQuery.trim(),
        email: newReceiver.email.trim() || undefined,
        location: newReceiver.location.trim() || undefined,
        createdBy: user.id,
      })
      if ('error' in created) {
        setError(created.error)
        return
      }
      setReceiverCustomerId(created.id)
      setReceiverPhoneQuery(formatLocalPhone(created.phone))
      setReceiverLookupStatus('found')
      setNewReceiver({ fullName: '', location: '', email: '' })
      setToast(`Receiver saved: ${created.fullName}`)
    } finally {
      setSavingReceiver(false)
    }
  }

  const setGiftModeSafe = (mode: 'none' | 'purchase' | 'redeem' | 'reward') => {
    setGiftMode(mode)
    setRedeemGiftId('')
    setRewardType('')
    if (mode !== 'purchase') {
      clearReceiverSearch()
    }
    setError('')
  }

  const applyLoyaltyReward = (type: LoyaltyRewardType | '') => {
    setRewardType(type)
    if (!type) return
    const reward = availableRewards.find((r) => r.type === type)
    if (!reward) return
    if (reward.locksToManiPedi) {
      const mp = findClassicManiPedi(activeServices)
      if (!mp) {
        setError('Classic Mani & Pedi is not in the menu.')
        return
      }
      setLines((prev) => {
        const rest = prev.filter((l) => l.serviceId && l.serviceId !== mp.id)
        return [{ serviceId: mp.id, price: 0, quantity: 1 }, ...rest]
      })
      setToast(`${reward.label} · AED 0`)
      return
    }
    setLines((prev) => {
      if (!prev.length) return [{ serviceId: '', price: 0, quantity: 1 }]
      return prev.map((l, i) => (i === 0 ? { ...l, price: 0 } : l))
    })
    setToast(`${reward.label} · first service at AED 0`)
  }

  const applyRedeemGift = (giftId: string) => {
    setRedeemGiftId(giftId)
    const gift = gifts.find((g) => g.id === giftId)
    if (!gift) return
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.serviceId === gift.serviceId)
      if (idx >= 0) {
        return prev.map((l, i) => (i === idx ? { ...l, price: 0, quantity: Math.max(1, l.quantity) } : l))
      }
      return [{ serviceId: gift.serviceId, price: 0, quantity: 1 }, ...prev]
    })
    setToast(`Gift applied: ${gift.serviceName} at AED 0`)
  }

  const addLine = () => {
    setLines((prev) => [...prev, { serviceId: '', price: 0, quantity: 1 }])
  }

  const applyCode = () => {
    const code = voucherCodeInput.trim().toUpperCase()
    const found = usableVouchers.find((v) => v.code === code)
    if (!found) {
      setError('Voucher code not found or not usable.')
      setVoucherId('')
      return
    }
    const amount = calcVoucherDiscount(found, subtotal)
    if (amount <= 0) {
      setError(
        found.minSpend && subtotal < found.minSpend
          ? `Minimum spend for this voucher is ${formatAED(found.minSpend)}.`
          : 'This voucher cannot be applied.',
      )
      setVoucherId('')
      return
    }
    setVoucherId(found.id)
    setError('')
    setToast(`Applied ${found.code}`)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (lines.length === 0) return

    let resolvedCustomerId = customerId

    if (lookupStatus === 'idle') {
      setError('Search for a customer by phone number first.')
      return
    }

    if (lookupStatus === 'not_found') {
      if (!newCustomer.fullName.trim()) {
        setError('Enter the new customer name.')
        return
      }
      if (!phoneDigits(phoneQuery)) {
        setError('Phone number is required for the new customer.')
        return
      }
      const created = await addCustomer({
        fullName: newCustomer.fullName.trim(),
        phone: phoneQuery.trim(),
        email: newCustomer.email.trim() || undefined,
        location: newCustomer.location.trim() || undefined,
        createdBy: user?.id ?? '',
      })
      if ('error' in created) {
        setError(created.error)
        return
      }
      resolvedCustomerId = created.id
    }

    if (!resolvedCustomerId) {
      setError('Select or create a customer before saving.')
      return
    }

    if (!user?.id) {
      setError('You must be signed in to save a visit.')
      return
    }

    let resolvedReceiverId = receiverCustomerId
    if (giftMode === 'purchase') {
      if (receiverLookupStatus === 'idle') {
        setError('Find the gift receiver by phone.')
        return
      }
      if (receiverLookupStatus === 'not_found') {
        if (!newReceiver.fullName.trim()) {
          setError('Enter the gift receiver name.')
          return
        }
        if (!phoneDigits(receiverPhoneQuery)) {
          setError('Receiver phone is required.')
          return
        }
        const createdReceiver = await addCustomer({
          fullName: newReceiver.fullName.trim(),
          phone: receiverPhoneQuery.trim(),
          email: newReceiver.email.trim() || undefined,
          location: newReceiver.location.trim() || undefined,
          createdBy: user.id,
        })
        if ('error' in createdReceiver) {
          setError(createdReceiver.error)
          return
        }
        resolvedReceiverId = createdReceiver.id
      }
      if (!resolvedReceiverId) {
        setError('Select or create a gift receiver.')
        return
      }
      if (resolvedReceiverId === resolvedCustomerId) {
        setError('Sender and receiver must be different.')
        return
      }
    }

    if (paymentMethods.length === 0) {
      setError('Tick every way they paid.')
      return
    }

    if (giftMode === 'redeem') {
      if (!redeemGiftId) {
        setError('Select a valid gift to redeem.')
        return
      }
    }

    if (giftMode === 'reward') {
      if (!rewardType) {
        setError('Choose which loyalty reward to redeem.')
        return
      }
      if (!availableRewards.some((r) => r.type === rewardType)) {
        setError('This loyalty reward is not available for this customer.')
        return
      }
    }

    if (lines.some((l) => !l.serviceId) || lines.some((l) => !services.find((s) => s.id === l.serviceId))) {
      setError('Choose a category and a service for every line.')
      return
    }

    const giftServiceLine = lines[0]
    const giftSvc = services.find((s) => s.id === giftServiceLine?.serviceId)

    setSaving(true)
    setError('')
    try {
    const result = await addVisit({
      customerId: resolvedCustomerId,
      staffId: user.id,
      visitDate: new Date(visitDate).toISOString(),
      discount,
      voucherId: voucherId || undefined,
      deliveryFee,
      paymentMethod: formatPaymentMethods(paymentMethods),
      notes: notes || undefined,
      services: lines.map((l) => {
        const svc = services.find((s) => s.id === l.serviceId)!
        return {
          serviceId: l.serviceId,
          serviceName: svc.name,
          price: l.price,
          quantity: l.quantity,
        }
      }),
      ...(giftMode === 'purchase' && giftSvc && giftServiceLine
        ? {
            giftPurchase: {
              receiverCustomerId: resolvedReceiverId,
              serviceId: giftSvc.id,
              serviceName: giftSvc.name,
              servicePrice: giftServiceLine.price,
            },
          }
        : {}),
      ...(giftMode === 'redeem' && redeemGiftId ? { giftRedeemId: redeemGiftId } : {}),
      ...(giftMode === 'reward' && rewardType ? { loyaltyRewardType: rewardType } : {}),
    })
    if ('error' in result) {
      setError(result.error)
      return
    }
    if (giftMode !== 'purchase' && result.thankYou === 'sent' && result.walletCard === 'sent') {
      setToast('Visit saved — feedback and My Belle wallet card sent')
    } else if (giftMode !== 'purchase' && result.thankYou === 'failed' && result.walletCard === 'sent') {
      setToast(`Visit saved — wallet card sent; feedback failed: ${result.thankYouError || 'see Message log'}`)
    } else if (giftMode !== 'purchase' && result.thankYou === 'sent' && result.walletCard === 'failed') {
      setToast(`Visit saved — feedback sent; wallet card failed: ${result.walletCardError || 'see Message log'}`)
    } else if (result.thankYou === 'sent' && giftMode !== 'purchase') {
      setToast('Visit saved — thank-you WhatsApp sent')
    } else if (giftMode === 'purchase') {
      if (result.giftNotice === 'sent' && result.thankYou === 'sent') {
        setToast('Visit saved — thank-you sent to sender, gift message sent to receiver')
      } else if (result.giftNotice === 'sent') {
        setToast(
          result.thankYou === 'failed'
            ? `Visit saved — gift message sent to receiver. Sender WhatsApp failed: ${result.thankYouError || 'see Message log'}`
            : 'Visit saved — gift message sent to receiver',
        )
      } else if (result.giftNotice === 'failed') {
        setToast(`Visit saved — gift created, but receiver WhatsApp failed: ${result.giftNoticeError || 'see Message log'}`)
      } else {
        setToast('Visit saved — gift created for receiver')
      }
    } else if (result.thankYou === 'failed') {
      const walletError =
        result.walletCard === 'failed' ? ` Wallet: ${result.walletCardError || 'see Message log'}` : ''
      setToast(`Visit saved — WhatsApp failed: ${result.thankYouError || 'see Message log'}.${walletError}`)
    } else if (giftMode === 'redeem') {
      setToast('Visit saved — gift redeemed')
    } else if (giftMode === 'reward') {
      setToast('Visit saved — loyalty reward redeemed')
    } else {
      setToast('Visit saved — spend & loyalty updated')
    }
    setTimeout(() => navigate(`/customers/${resolvedCustomerId}`), 800)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add visit" subtitle="Find the customer by phone, then record services." />
      <Card>
        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="rounded-2xl border border-line bg-blush/20 p-4 space-y-3">
            <h3 className="font-display text-xl">
              {giftMode === 'purchase' ? 'Sender (payer)' : giftMode === 'redeem' || giftMode === 'reward' ? 'Customer' : 'Customer'}
            </h3>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <Input
                label="Phone number"
                placeholder={PHONE_PLACEHOLDER}
                value={phoneQuery}
                onChange={(e) => {
                  setPhoneQuery(e.target.value)
                  if (lookupStatus !== 'idle') {
                    setLookupStatus('idle')
                    setCustomerId('')
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    findCustomer()
                  }
                }}
              />
              <Button type="button" onClick={findCustomer}>
                Find
              </Button>
              <Button type="button" variant="outline" onClick={clearCustomerSearch}>
                Clear
              </Button>
            </div>

            {lookupStatus === 'found' && selectedCustomer ? (
              <div className="rounded-xl border border-line bg-white px-4 py-3">
                <p className="font-medium text-ink">{selectedCustomer.fullName}</p>
                <p className="text-sm text-muted">{formatLocalPhone(selectedCustomer.phone)}</p>
                <p className="mt-1 text-sm text-muted">
                  Location:{' '}
                  <span className="font-medium text-ink">{selectedCustomer.location || 'Not set'}</span>
                  {' · '}
                  Tier: <span className="font-medium text-ink">{selectedCustomer.loyaltyTier}</span>
                  {' · '}
                  Spend: <span className="font-medium text-ink">{formatAED(selectedCustomer.lifetimeSpend)}</span>
                </p>
                <p className="mt-2 text-xs text-muted">
                  {getTierConfig(selectedCustomer.loyaltyTier).benefits}
                  {selectedCustomer.loyaltyTier === 'Gold' || selectedCustomer.loyaltyTier === 'Premium'
                    ? ` · ~${premiumThousandRewardsEarned(selectedCustomer.lifetimeSpend)}× AED 1,000 spend rewards`
                    : ''}
                </p>
              </div>
            ) : null}

            {lookupStatus === 'not_found' ? (
              <div className="space-y-3 rounded-xl border border-dashed border-rose/40 bg-white p-4">
                <p className="text-sm text-muted">
                  No customer with this number. Enter their details and save, or create them when you save the visit.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Full name"
                    value={newCustomer.fullName}
                    onChange={(e) => setNewCustomer({ ...newCustomer, fullName: e.target.value })}
                    required
                  />
                  <AreaSelect
                    value={newCustomer.location}
                    onChange={(location) => setNewCustomer({ ...newCustomer, location })}
                  />
                  <div className="sm:col-span-2">
                    <Input
                      label="Email (optional)"
                      type="email"
                      value={newCustomer.email}
                      onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted">Phone on file: {phoneQuery.trim() || '—'}</p>
                <Button type="button" onClick={() => void saveNewCustomer()} disabled={savingCustomer}>
                  {savingCustomer ? 'Saving…' : 'Save customer'}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-line bg-blush/20 p-4 space-y-3">
            <h3 className="font-display text-xl">Visit type</h3>
            <p className="text-xs text-muted">
              Gift purchase: this customer pays and earns loyalty. Redeem gift: apply a valid gift at AED 0. Redeem
              reward: Gold/Premium free loyalty service at AED 0 (delivery still paid).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={giftMode === 'none' ? 'primary' : 'outline'}
                onClick={() => setGiftModeSafe('none')}
              >
                Normal visit
              </Button>
              <Button
                type="button"
                size="sm"
                variant={giftMode === 'purchase' ? 'primary' : 'outline'}
                onClick={() => setGiftModeSafe('purchase')}
              >
                Gift purchase
              </Button>
              <Button
                type="button"
                size="sm"
                variant={giftMode === 'redeem' ? 'primary' : 'outline'}
                onClick={() => setGiftModeSafe('redeem')}
              >
                Redeem gift
              </Button>
              <Button
                type="button"
                size="sm"
                variant={giftMode === 'reward' ? 'primary' : 'outline'}
                onClick={() => setGiftModeSafe('reward')}
              >
                Redeem reward
              </Button>
            </div>

            {giftMode === 'purchase' ? (
              <div className="space-y-3 rounded-xl border border-dashed border-rose/40 bg-white p-4">
                <p className="text-sm font-medium text-ink">
                  Customer above is the sender (payer). First service line is the gifted service — including Belle
                  packages.
                </p>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <Input
                    label="Receiver phone"
                    placeholder={PHONE_PLACEHOLDER}
                    value={receiverPhoneQuery}
                    onChange={(e) => {
                      setReceiverPhoneQuery(e.target.value)
                      if (receiverLookupStatus !== 'idle') {
                        setReceiverLookupStatus('idle')
                        setReceiverCustomerId('')
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        findReceiver()
                      }
                    }}
                  />
                  <Button type="button" onClick={findReceiver}>
                    Find
                  </Button>
                  <Button type="button" variant="outline" onClick={clearReceiverSearch}>
                    Clear
                  </Button>
                </div>
                {receiverLookupStatus === 'found' && selectedReceiver ? (
                  <div className="rounded-xl border border-line bg-blush/20 px-4 py-3">
                    <p className="font-medium text-ink">{selectedReceiver.fullName}</p>
                    <p className="text-sm text-muted">{formatLocalPhone(selectedReceiver.phone)}</p>
                  </div>
                ) : null}
                {receiverLookupStatus === 'not_found' ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted">No receiver with this number — create them here.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label="Receiver full name"
                        value={newReceiver.fullName}
                        onChange={(e) => setNewReceiver({ ...newReceiver, fullName: e.target.value })}
                        required
                      />
                      <AreaSelect
                        value={newReceiver.location}
                        onChange={(location) => setNewReceiver({ ...newReceiver, location })}
                      />
                      <div className="sm:col-span-2">
                        <Input
                          label="Email (optional)"
                          type="email"
                          value={newReceiver.email}
                          onChange={(e) => setNewReceiver({ ...newReceiver, email: e.target.value })}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted">Phone on file: {receiverPhoneQuery.trim() || '—'}</p>
                    <Button type="button" onClick={() => void saveNewReceiver()} disabled={savingReceiver}>
                      {savingReceiver ? 'Saving…' : 'Save receiver'}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {giftMode === 'redeem' ? (
              <div className="space-y-3 rounded-xl border border-dashed border-rose/40 bg-white p-4">
                <p className="text-sm text-muted">
                  Customer above is the receiver. Choose one of their valid gifts to apply at AED 0.
                </p>
                {!customerId || lookupStatus !== 'found' ? (
                  <p className="text-sm text-muted">Find the receiving customer first.</p>
                ) : receiverValidGifts.length === 0 ? (
                  <p className="text-sm text-muted">No valid gifts for this customer.</p>
                ) : (
                  <Select
                    label="Valid gift"
                    value={redeemGiftId}
                    onChange={(e) => applyRedeemGift(e.target.value)}
                  >
                    <option value="">Select a gift…</option>
                    {receiverValidGifts.map((g) => {
                      const from = customers.find((c) => c.id === g.senderCustomerId)?.fullName ?? 'Someone'
                      return (
                        <option key={g.id} value={g.id}>
                          {g.code} — {g.serviceName} from {from} ({formatAED(g.servicePrice)})
                        </option>
                      )
                    })}
                  </Select>
                )}
                {selectedRedeemGift ? (
                  <p className="text-sm text-ink">
                    Applied: <span className="font-medium">{selectedRedeemGift.serviceName}</span> at AED 0
                  </p>
                ) : null}
              </div>
            ) : null}

            {giftMode === 'reward' ? (
              <div className="space-y-3 rounded-xl border border-dashed border-rose/40 bg-white p-4">
                <p className="text-sm text-muted">
                  Free My Belle reward. The service is AED 0 and does not add spend. Delivery is still charged.
                </p>
                {!customerId || lookupStatus !== 'found' ? (
                  <p className="text-sm text-muted">Find the customer first.</p>
                ) : availableRewards.length === 0 ? (
                  <p className="text-sm text-muted">
                    {selectedCustomer?.loyaltyTier === 'Regular'
                      ? 'Loyalty rewards start at Gold (AED 1,500 lifetime spend).'
                      : monthlyCooldown > 0
                        ? `Premium monthly free service is available again in ${monthlyCooldown} day${monthlyCooldown === 1 ? '' : 's'}.`
                        : 'No unused loyalty rewards for this customer right now.'}
                  </p>
                ) : (
                  <Select
                    label="Loyalty reward"
                    value={rewardType}
                    onChange={(e) => applyLoyaltyReward(e.target.value as LoyaltyRewardType | '')}
                  >
                    <option value="">Select reward…</option>
                    {availableRewards.map((r) => (
                      <option key={r.type} value={r.type}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                )}
                {selectedReward ? (
                  <p className="text-sm text-ink">
                    {selectedReward.detail}
                    {selectedReward.locksToManiPedi ? ' · Classic Mani & Pedi is applied at AED 0.' : ' · Choose the free service below.'}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-blush/40 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Recorded by</p>
              <p className="mt-1 font-medium text-ink">{user?.name ?? '—'}</p>
              <p className="text-xs text-muted">
                {user?.role === 'admin' ? 'Owner' : 'Staff'} · locked to your account
              </p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Date / time</span>
              <input
                type="datetime-local"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
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
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-xl">Services</h3>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-3.5 w-3.5" />
                Add service
              </Button>
            </div>
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-3 rounded-xl border border-line bg-blush/30 p-3 lg:flex-row lg:items-end"
                >
                  <ServicePicker
                    services={pickerServices}
                    value={line.serviceId}
                    disabled={Boolean(
                      (giftMode === 'redeem' &&
                        selectedRedeemGift &&
                        line.serviceId === selectedRedeemGift.serviceId) ||
                        (giftMode === 'reward' && selectedReward?.locksToManiPedi && index === 0),
                    )}
                    onChange={(svc) =>
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === index
                            ? {
                                ...l,
                                serviceId: svc?.id ?? '',
                                price:
                                  giftMode === 'reward' && i === 0 ? 0 : svc?.defaultPrice ?? 0,
                              }
                            : l,
                        ),
                      )
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    value={line.price}
                    disabled={Boolean(
                      (giftMode === 'redeem' &&
                        selectedRedeemGift &&
                        line.serviceId === selectedRedeemGift.serviceId) ||
                        (giftMode === 'reward' && Boolean(rewardType) && index === 0),
                    )}
                    onChange={(e) =>
                      setLines((prev) => prev.map((l, i) => (i === index ? { ...l, price: Number(e.target.value) } : l)))
                    }
                    className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm sm:w-28 disabled:opacity-60"
                    placeholder="Price"
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
                    placeholder="Qty"
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

          <div className="rounded-2xl border border-line bg-blush/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Ticket className="h-4 w-4 text-rose" />
              <h3 className="font-display text-xl">Voucher</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input
                label="Enter voucher code"
                placeholder="BELLE50"
                value={voucherCodeInput}
                onChange={(e) => setVoucherCodeInput(e.target.value.toUpperCase())}
              />
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={applyCode}>
                  Apply
                </Button>
              </div>
            </div>
            <div className="mt-3">
              <Select
                label="Or choose voucher"
                value={voucherId}
                onChange={(e) => {
                  setVoucherId(e.target.value)
                  setVoucherCodeInput(usableVouchers.find((v) => v.id === e.target.value)?.code ?? '')
                  setError('')
                }}
              >
                <option value="">No voucher</option>
                {usableVouchers.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} — {v.type === 'percent' ? `${v.value}%` : formatAED(v.value)}
                    {v.minSpend ? ` (min ${formatAED(v.minSpend)})` : ''}
                  </option>
                ))}
              </Select>
            </div>
            {selectedVoucher ? (
              <p className="mt-2 text-sm text-muted">
                {selectedVoucher.name}
                {voucherDiscount > 0
                  ? ` · saves ${formatAED(voucherDiscount)}`
                  : selectedVoucher.minSpend && subtotal < selectedVoucher.minSpend
                    ? ` · needs min spend ${formatAED(selectedVoucher.minSpend)}`
                    : ''}
              </p>
            ) : null}
          </div>

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
              <p className="font-display text-xl">
                {deliveryFee === 0 ? 'Free' : formatAED(deliveryFee)}
              </p>
            </div>
            <div className="rounded-xl bg-rose/10 px-4 py-3">
              <p className="text-xs text-muted">Final bill</p>
              <p className="font-display text-xl text-rose-deep">{formatAED(finalTotal)}</p>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-20 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm"
            />
          </label>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save visit'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </div>
  )
}
