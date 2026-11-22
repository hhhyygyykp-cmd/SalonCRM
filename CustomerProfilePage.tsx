import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CalendarPlus, Copy, Link2, MessageCircle, Pencil, Plus, WalletCards } from 'lucide-react'
import { daysSince, formatAED } from '../lib/format'
import { formatCustomerArea } from '../lib/areas'
import { formatLocalPhone, PHONE_PLACEHOLDER } from '../lib/phone'
import { isWhatsAppWindowOpen, whatsappWindowLabel } from '../lib/whatsapp'
import { buildTemplateComponents, templateLanguage } from '../lib/whatsappTemplates'
import { getTierConfig, loyaltyRewardLabel } from '../lib/loyalty'
import { canRecordUsage, deriveMembershipStatus, membershipBalanceLabel } from '../lib/memberships'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { AreaSelect } from '../components/AreaSelect'
import { Button, Card, EmptyState, LoyaltyBadge, Modal, PageHeader, Select, StatusPill, Toast } from '../components/ui'
import type { Customer, TimelineEvent } from '../types'
import {
  customerUpdateLink,
  customerWalletLink,
  fillCustomerPlaceholders,
  PROFILE_UPDATE_WHATSAPP,
  walletAddedLabel,
} from '../lib/customerLinks'

export function CustomerProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const {
    customers,
    visits,
    messages,
    gifts,
    memberships,
    sendWhatsApp,
    updateCustomer,
    recordMembershipUsage,
    whatsappTemplates,
    staffMembers,
    settings,
  } = useData()
  const customer = customers.find((c) => c.id === id)
  const getStaffName = (staffId: string) => staffMembers.find((s) => s.id === staffId)?.name ?? '—'
  const getCustomerName = (customerId: string) => customers.find((c) => c.id === customerId)?.fullName ?? '—'
  const [params, setParams] = useSearchParams()
  const [waOpen, setWaOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(() => params.get('edit') === '1')
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editDraft, setEditDraft] = useState({
    fullName: '',
    phone: '',
    location: '',
    email: '',
    birthday: '',
    notes: '',
  })
  const [templateId, setTemplateId] = useState('')
  const [messageBody, setMessageBody] = useState('')
  const [toast, setToast] = useState('')

  const openEdit = (c: Customer) => {
    setEditDraft({
      fullName: c.fullName,
      phone: formatLocalPhone(c.phone),
      location: c.location ?? '',
      email: c.email ?? '',
      birthday: c.birthday ? c.birthday.slice(0, 10) : '',
      notes: c.notes ?? '',
    })
    setEditError('')
    setEditOpen(true)
  }

  const closeEdit = () => {
    setEditOpen(false)
    if (params.get('edit')) {
      const next = new URLSearchParams(params)
      next.delete('edit')
      setParams(next, { replace: true })
    }
  }

  useEffect(() => {
    if (params.get('edit') !== '1' || !customer) return
    openEdit(customer)
    // Populate once when landing with ?edit=1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id])

  const activeTemplates = useMemo(
    () => whatsappTemplates.filter((t) => t.active),
    [whatsappTemplates],
  )

  const customerVisits = useMemo(
    () => visits.filter((v) => v.customerId === id).sort((a, b) => +new Date(b.visitDate) - +new Date(a.visitDate)),
    [visits, id],
  )

  const customerMessages = useMemo(
    () => messages.filter((m) => m.customerId === id).sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt)),
    [messages, id],
  )

  const giftsReceived = useMemo(
    () =>
      gifts
        .filter((g) => g.receiverCustomerId === id)
        .sort((a, b) => +new Date(b.purchasedAt) - +new Date(a.purchasedAt)),
    [gifts, id],
  )
  const giftsSent = useMemo(
    () =>
      gifts
        .filter((g) => g.senderCustomerId === id)
        .sort((a, b) => +new Date(b.purchasedAt) - +new Date(a.purchasedAt)),
    [gifts, id],
  )
  const receivedValid = giftsReceived.filter((g) => g.status === 'valid')
  const receivedUsed = giftsReceived.filter((g) => g.status === 'used')
  const sentValid = giftsSent.filter((g) => g.status === 'valid')
  const sentUsed = giftsSent.filter((g) => g.status === 'used')
  const customerMemberships = useMemo(
    () => memberships.filter((m) => m.customerId === id),
    [memberships, id],
  )

  const timeline: TimelineEvent[] = useMemo(() => {
    if (!customer) return []
    const events: TimelineEvent[] = [
      {
        id: 'created',
        type: 'created',
        date: customer.createdAt,
        title: 'Customer created',
        subtitle: `Added by ${getStaffName(customer.createdBy)}`,
      },
      ...customerVisits.map((v) => ({
        id: v.id,
        type: 'visit' as const,
        date: v.visitDate,
        title: 'Visit',
        subtitle: v.services.map((s) => s.serviceName).join(', '),
        amount: v.finalTotal,
      })),
      ...customerMessages.map((m) => ({
        id: m.id,
        type: 'whatsapp' as const,
        date: m.sentAt,
        title: 'WhatsApp reminder',
        subtitle: whatsappTemplates.find((t) => t.id === m.templateId)?.name,
        status: m.status,
      })),
    ]
    return events.sort((a, b) => +new Date(b.date) - +new Date(a.date))
  }, [customer, customerVisits, customerMessages, whatsappTemplates])

  if (!customer) {
    return (
      <EmptyState
        title="Customer not found"
        description="This profile is not in your customer list."
        action={<Button onClick={() => navigate('/customers')}>Back to customers</Button>}
      />
    )
  }

  const fillTemplate = (templateIdValue: string) => {
    const selectedTemplate = whatsappTemplates.find((t) => t.id === templateIdValue)
    if (!selectedTemplate) return ''
    return fillCustomerPlaceholders(selectedTemplate.body, customer, settings.salonName)
  }

  const copyUpdateLink = async () => {
    const link = customerUpdateLink(customer.walletToken)
    try {
      await navigator.clipboard.writeText(link)
      setToast('Update link copied')
    } catch {
      setToast(link)
    }
  }

  const copyWalletLink = async () => {
    const link = customerWalletLink(customer.walletToken)
    if (!link) {
      setToast('This customer has no wallet card yet — save a visit first')
      return
    }
    try {
      await navigator.clipboard.writeText(link)
      setToast('Wallet link copied')
    } catch {
      setToast(link)
    }
  }

  const sendUpdateInvite = async () => {
    const link = customerUpdateLink(customer.walletToken)
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      /* still send */
    }
    const result = await sendWhatsApp({
      customerId: customer.id,
      templateId: 'manual',
      phone: customer.whatsappPhone,
      triggerType: 'Profile update invite',
      preview: fillCustomerPlaceholders(PROFILE_UPDATE_WHATSAPP, customer, settings.salonName),
      sentBy: user?.name ?? 'Staff',
      forceText: true,
    })
    if (!('error' in result)) {
      setToast('WhatsApp sent with their form link')
      return
    }
    setToast(`Link copied. WhatsApp could not send the custom link (${result.error})`)
  }

  const openWhatsApp = () => {
    setTemplateId('')
    setMessageBody(
      `Hi ${customer.fullName.split(' ')[0]}, thank you for choosing ${settings.salonName}. We would love to see you again soon.`,
    )
    setWaOpen(true)
  }

  const saveEdit = async () => {
    if (!editDraft.fullName.trim() || !editDraft.phone.trim()) {
      setEditError('Full name and phone are required.')
      return
    }
    setEditSaving(true)
    const result = await updateCustomer(customer.id, {
      fullName: editDraft.fullName,
      phone: editDraft.phone,
      location: editDraft.location,
      email: editDraft.email,
      birthday: editDraft.birthday,
      notes: editDraft.notes,
    })
    setEditSaving(false)
    if ('error' in result) {
      setEditError(result.error)
      return
    }
    closeEdit()
    setToast('Customer updated')
  }
  return (
    <div>
      <PageHeader
        title={customer.fullName}
        subtitle={`${formatLocalPhone(customer.phone)}${formatCustomerArea(customer.location) ? ` · ${formatCustomerArea(customer.location)}` : ''}`}
        actions={
          <>
            <Button onClick={() => openEdit(customer)}>
              <Pencil className="h-4 w-4" />
              Edit customer
            </Button>
            <Button variant="outline" onClick={() => navigate(`/visits/new?customerId=${customer.id}`)}>
              <CalendarPlus className="h-4 w-4" />
              Add Visit
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/whatsapp?chat=${customer.id}`)}>
              <MessageCircle className="h-4 w-4" />
              Open chat
            </Button>
            <Button variant="outline" onClick={openWhatsApp}>
              Send template
            </Button>
            <Button
              variant="outline"
              disabled={!customer.walletToken}
              onClick={() => {
                if (!customer.walletToken) return
                window.open(`/w/${customer.walletToken}`, '_blank', 'noopener,noreferrer')
              }}
            >
              <WalletCards className="h-4 w-4" />
              Preview wallet
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card className="xl:col-span-2">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Loyalty</p>
          <div className="mt-2">
            <LoyaltyBadge tier={customer.loyaltyTier} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">{getTierConfig(customer.loyaltyTier).benefits}</p>
          <div
            className={`mt-4 overflow-hidden rounded-2xl text-white ${
              customer.loyaltyTier === 'Premium'
                ? 'bg-[#1E4D8C]'
                : customer.loyaltyTier === 'Gold'
                  ? 'bg-[#7A5C28]'
                  : 'bg-[#4B533F]'
            }`}
          >
            <div className="px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.16em] opacity-80">Belle Beauty Lounge</p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-90">{customer.loyaltyTier}</p>
              </div>
              <p className="mt-2 font-display text-xl">Hi, {customer.fullName.trim().split(/\s+/)[0] || customer.fullName}</p>
              <p className="mt-2 text-xs opacity-90">
                {formatAED(customer.lifetimeSpend)} spent · {customer.totalVisits} visits
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            This is a staff preview. Use Preview wallet to see the customer card and Add to Wallet buttons.
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Lifetime spend</p>
          <p className="mt-2 font-display text-2xl">{formatAED(customer.lifetimeSpend)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Visits</p>
          <p className="mt-2 font-display text-2xl">{customer.totalVisits}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Last visit</p>
          <p className="mt-2 font-display text-2xl">
            {customer.lastVisitAt
              ? new Date(customer.lastVisitAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              : '—'}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Days since</p>
          <p className="mt-2 font-display text-2xl">{daysSince(customer.lastVisitAt) ?? '—'}</p>
        </Card>
      </div>

      {customer.notes ? (
        <Card className="mt-4">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Notes</p>
          <p className="mt-2 text-sm">{customer.notes}</p>
        </Card>
      ) : null}

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Memberships</h2>
            <p className="mt-1 text-sm text-muted">
              Belle packages on this customer. Delivery is charged on visits.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate(`/members/new?customerId=${customer.id}`)}>
            <Plus className="h-4 w-4" />
            Add package
          </Button>
        </div>
        {customerMemberships.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No subscription packages yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {customerMemberships.map((m) => {
              const status = deriveMembershipStatus(m)
              return (
                <li key={m.id} className="rounded-xl border border-line px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/members/${m.id}`} className="font-medium text-ink hover:text-rose">
                      {m.productName}
                    </Link>
                    <StatusPill status={status} />
                  </div>
                  <p className="mt-1 text-muted">{membershipBalanceLabel(m)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/members/${m.id}`)}>
                      Open
                    </Button>
                    {canRecordUsage(m) && user?.id ? (
                      <Button
                        size="sm"
                        onClick={async () => {
                          const result = await recordMembershipUsage(m.id, user.id)
                          if ('error' in result) setToast(result.error)
                          else setToast('Session recorded')
                        }}
                      >
                        Record session
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-2xl">Gifts received</h2>
          {giftsReceived.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No gifts received yet.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {receivedValid.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-muted">Valid</p>
                  <ul className="mt-2 space-y-2">
                    {receivedValid.map((g) => (
                      <li key={g.id} className="rounded-xl border border-line bg-blush/20 px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-ink">{g.serviceName}</span>
                          <StatusPill status="Valid" />
                        </div>
                        <p className="mt-1 text-muted">
                          Code {g.code} · from {getCustomerName(g.senderCustomerId)} ·{' '}
                          {new Date(g.purchasedAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {receivedUsed.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-muted">Used</p>
                  <ul className="mt-2 space-y-2">
                    {receivedUsed.map((g) => (
                      <li key={g.id} className="rounded-xl border border-line px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-ink">{g.serviceName}</span>
                          <StatusPill status="Used" />
                        </div>
                        <p className="mt-1 text-muted">
                          From {getCustomerName(g.senderCustomerId)}
                          {g.redeemedAt
                            ? ` · redeemed ${new Date(g.redeemedAt).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}`
                            : ''}
                          {g.redeemVisitId ? ` · visit ${g.redeemVisitId}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-2xl">Gifts sent</h2>
          {giftsSent.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No gifts sent yet.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {sentValid.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-muted">Valid</p>
                  <ul className="mt-2 space-y-2">
                    {sentValid.map((g) => (
                      <li key={g.id} className="rounded-xl border border-line bg-blush/20 px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-ink">{g.serviceName}</span>
                          <StatusPill status="Valid" />
                        </div>
                        <p className="mt-1 text-muted">
                          To {getCustomerName(g.receiverCustomerId)} · code {g.code} ·{' '}
                          {new Date(g.purchasedAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {sentUsed.length > 0 ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-muted">Used</p>
                  <ul className="mt-2 space-y-2">
                    {sentUsed.map((g) => (
                      <li key={g.id} className="rounded-xl border border-line px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-ink">{g.serviceName}</span>
                          <StatusPill status="Used" />
                        </div>
                        <p className="mt-1 text-muted">
                          To {getCustomerName(g.receiverCustomerId)}
                          {g.redeemedAt
                            ? ` · redeemed ${new Date(g.redeemedAt).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}`
                            : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <h2 className="font-display text-2xl">Visit history</h2>
          {customerVisits.length === 0 ? (
            <EmptyState
              title="No visits yet"
              description="Record the first visit for this customer."
              action={
                <Button onClick={() => navigate(`/visits/new?customerId=${customer.id}`)}>Add Visit</Button>
              }
            />
          ) : (
            customerVisits.map((visit) => (
              <Card key={visit.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-xl">
                      Visit —{' '}
                      {new Date(visit.visitDate).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </h3>
                    <p className="text-sm text-muted">Staff: {getStaffName(visit.staffId)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-display text-xl text-rose-deep">{formatAED(visit.finalTotal)}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/visits/${visit.id}/edit`)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit visit
                    </Button>
                  </div>
                </div>
                <ul className="mt-4 space-y-2 border-t border-line pt-4">
                  {visit.services.map((s) => (
                    <li key={`${visit.id}-${s.serviceId}`} className="flex justify-between text-sm">
                      <span>
                        {s.serviceName}
                        {s.quantity > 1 ? ` × ${s.quantity}` : ''}
                      </span>
                      <span className="text-muted">{formatAED(s.price * s.quantity)}</span>
                    </li>
                  ))}
                </ul>
                {(visit.discount > 0 ||
                  (visit.voucherDiscount ?? 0) > 0 ||
                  visit.deliveryFee != null ||
                  visit.paymentMethod ||
                  visit.customerLocation ||
                  visit.notes ||
                  visit.giftPurchaseId ||
                  visit.giftRedeemId ||
                  visit.loyaltyRewardType) && (
                  <div className="mt-3 space-y-1 text-sm text-muted">
                    {visit.discount > 0 ? <p>Extra discount: {formatAED(visit.discount)}</p> : null}
                    {visit.voucherCode ? (
                      <p>
                        Voucher {visit.voucherCode}
                        {visit.voucherDiscount ? ` (−${formatAED(visit.voucherDiscount)})` : ''}
                      </p>
                    ) : null}
                    {visit.deliveryFee != null ? (
                      <p>
                        Delivery:{' '}
                        {visit.deliveryFee === 0 ? 'Free delivery' : formatAED(visit.deliveryFee)}
                      </p>
                    ) : null}
                    {visit.paymentMethod ? <p>Paid: {visit.paymentMethod}</p> : null}
                    {visit.customerLocation ? <p>Location: {visit.customerLocation}</p> : null}
                    {visit.giftPurchaseId ? <p>Gift purchase linked</p> : null}
                    {visit.giftRedeemId ? <p>Gift redeemed on this visit</p> : null}
                    {visit.loyaltyRewardType ? <p>Loyalty reward: {loyaltyRewardLabel(visit.loyaltyRewardType)}</p> : null}
                    {visit.notes ? <p>Notes: {visit.notes}</p> : null}
                  </div>
                )}
              </Card>
            ))
          )}

          <h2 className="pt-2 font-display text-2xl">Communication history</h2>
          <Card padding={false}>
            {customerMessages.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">No WhatsApp messages yet.</p>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="bg-blush/50 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Channel</th>
                    <th className="px-5 py-3">Template</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Trigger</th>
                  </tr>
                </thead>
                <tbody>
                  {customerMessages.map((m) => (
                    <tr key={m.id} className="border-t border-line">
                      <td className="px-5 py-3">
                        {new Date(m.sentAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-5 py-3">WhatsApp</td>
                      <td className="px-5 py-3">{whatsappTemplates.find((t) => t.id === m.templateId)?.name}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-0.5">
                          <StatusPill status={m.status} />
                          {m.sendMode ? (
                            <span className="text-[11px] capitalize text-muted">{m.sendMode}</span>
                          ) : null}
                          {m.status === 'Failed' && m.errorMessage ? (
                            <span className="text-[11px] text-rose-deep line-clamp-2">{m.errorMessage}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted">{m.triggerType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div>
          <h2 className="font-display text-2xl">Timeline</h2>
          <Card className="mt-4">
            <ol className="relative space-y-5 border-l border-line pl-5">
              {timeline.map((event) => (
                <li key={event.id} className="relative">
                  <span className="absolute -left-[1.55rem] top-1.5 h-2.5 w-2.5 rounded-full bg-rose" />
                  <p className="text-xs text-muted">
                    {new Date(event.date).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="font-medium text-ink">{event.title}</p>
                  {event.subtitle ? <p className="text-sm text-muted">{event.subtitle}</p> : null}
                  {event.amount != null ? <p className="text-sm text-rose-deep">{formatAED(event.amount)}</p> : null}
                  {event.status ? (
                    <div className="mt-1">
                      <StatusPill status={event.status} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </Card>

          <Card className="mt-4">
            <p className="text-xs uppercase tracking-[0.1em] text-muted">Wallet card link</p>
            <p className="mt-1 text-sm text-muted">
              Personal loyalty card for this customer. Use this on WhatsApp — every customer has a different ending.
            </p>
            <input
              readOnly
              className="mt-3 w-full rounded-xl border border-line bg-cream/50 px-3.5 py-2.5 text-xs text-ink"
              value={customerWalletLink(customer.walletToken) || 'No wallet yet — save a visit to create it'}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={!customer.walletToken} onClick={() => void copyWalletLink()}>
                <Copy className="h-3.5 w-3.5" />
                Copy wallet link
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!customer.walletToken}
                onClick={() => {
                  if (!customer.walletToken) return
                  window.open(customerWalletLink(customer.walletToken), '_blank', 'noopener,noreferrer')
                }}
              >
                <WalletCards className="h-3.5 w-3.5" />
                Open card
              </Button>
            </div>
          </Card>

          <Card className="mt-4">
            <p className="text-xs uppercase tracking-[0.1em] text-muted">Send this link on WhatsApp</p>
            <p className="mt-1 text-sm text-muted">
              They tap it, fill their name / area / birthday, and it saves on this profile.
            </p>
            <input
              readOnly
              className="mt-3 w-full rounded-xl border border-line bg-cream/50 px-3.5 py-2.5 text-xs text-ink"
              value={customerUpdateLink(customer.walletToken)}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void copyUpdateLink()}>
                <Copy className="h-3.5 w-3.5" />
                Copy link
              </Button>
              <Button size="sm" variant="outline" onClick={() => void sendUpdateInvite()}>
                <Link2 className="h-3.5 w-3.5" />
                WhatsApp this link
              </Button>
            </div>
          </Card>

          <Card className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.1em] text-muted">Quick details</p>
              <button
                type="button"
                onClick={() => openEdit(customer)}
                className="inline-flex items-center gap-1 text-xs font-medium text-rose hover:underline"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Area</dt>
                <dd>{formatCustomerArea(customer.location) ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">WhatsApp</dt>
                <dd>{formatLocalPhone(customer.whatsappPhone)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Email</dt>
                <dd>{customer.email ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Birthday</dt>
                <dd>
                  {customer.birthday
                    ? new Date(customer.birthday).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Details form</dt>
                <dd>
                  {customer.profileUpdatedAt
                    ? `Updated ${new Date(customer.profileUpdatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                    : 'Not yet'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Wallet</dt>
                <dd>{walletAddedLabel(customer)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Last services</dt>
                <dd className="text-right">{customer.lastServices.join(', ') || '—'}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      <Modal
        open={waOpen}
        onClose={() => setWaOpen(false)}
        title="Send WhatsApp"
        footer={
          <>
            <Button variant="ghost" onClick={() => setWaOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!messageBody.trim()) {
                  setToast('Message text is required')
                  return
                }
                const tpl = whatsappTemplates.find((t) => t.id === templateId)
                const walletLink = customerWalletLink(customer.walletToken)
                const result = await sendWhatsApp({
                  customerId: customer.id,
                  templateId: templateId || 'manual',
                  phone: customer.whatsappPhone,
                  triggerType: 'Manual Send',
                  preview: messageBody.trim(),
                  sentBy: user?.name ?? 'Staff',
                  forceTemplate: Boolean(tpl?.whatsappTemplateName),
                  metaTemplateName: tpl?.whatsappTemplateName || undefined,
                  language: templateLanguage(tpl),
                  templateComponents: buildTemplateComponents(tpl?.whatsappTemplateName, {
                    customer,
                    salonName: settings.salonName || 'Belle Beauty Lounge',
                    walletLink,
                    templateBody: tpl?.body,
                  }),
                })
                setWaOpen(false)
                if ('error' in result) {
                  setToast(result.error)
                  return
                }
                const mode = result.sendMode === 'template' ? 'template' : 'message'
                setToast(`WhatsApp ${mode} sent`)
              }}
            >
              Send Message
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Customer: <span className="font-medium text-ink">{customer.fullName}</span>
            <span className="mt-1 block text-xs">
              {whatsappWindowLabel(customer.lastWhatsappInboundAt)}
              {isWhatsAppWindowOpen(customer.lastWhatsappInboundAt)
                ? ' — your typed text will be sent'
                : ' — pick an approved template; custom text only works after they message you'}
            </span>
          </p>
          <Select
            label="Template"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value)
              setMessageBody(fillTemplate(e.target.value))
            }}
          >
            <option value="">Custom text</option>
            {(activeTemplates.length ? activeTemplates : whatsappTemplates).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.whatsappTemplateName === 'service_feedback' ? ' (after visit)' : ''}
              </option>
            ))}
          </Select>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">Message (editable)</span>
            <textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              className="min-h-32 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={closeEdit}
        title="Edit customer"
        footer={
          <>
            <Button variant="ghost" onClick={closeEdit} disabled={editSaving}>
              Cancel
            </Button>
            <Button type="submit" form="edit-customer-form" disabled={editSaving}>
              {editSaving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <form id="edit-customer-form" className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void saveEdit() }}>
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Full name</span>
            <input
              className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
              value={editDraft.fullName}
              required
              onChange={(e) => setEditDraft((d) => ({ ...d, fullName: e.target.value }))}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Phone / WhatsApp</span>
            <input
              className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
              value={editDraft.phone}
              required
              placeholder={PHONE_PLACEHOLDER}
              onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))}
            />
          </label>
          <AreaSelect
            value={editDraft.location}
            onChange={(location) => setEditDraft((d) => ({ ...d, location }))}
          />
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
              value={editDraft.email}
              onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Birthday</span>
            <input
              type="date"
              className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
              value={editDraft.birthday}
              onChange={(e) => setEditDraft((d) => ({ ...d, birthday: e.target.value }))}
            />
          </label>
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Notes</span>
            <textarea
              className="min-h-24 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
              value={editDraft.notes}
              onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </label>
          {editError ? <p className="text-sm text-danger sm:col-span-2">{editError}</p> : null}
        </form>
      </Modal>

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </div>
  )
}

export function NewCustomerPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addCustomer } = useData()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [birthday, setBirthday] = useState('')
  const [notes, setNotes] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!fullName.trim() || !phone.trim()) {
      setError('Full name and phone are required.')
      return
    }
    const result = await addCustomer({
      fullName,
      phone,
      email,
      birthday,
      notes,
      location,
      createdBy: user?.id ?? '',
    })
    if ('error' in result) {
      setError(result.error)
      return
    }
    setToast('Customer saved')
    setTimeout(() => navigate(`/visits/new?customerId=${result.id}`), 500)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New customer" subtitle="Fast registration — then go straight to recording a visit." />
      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Full name</span>
              <input
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Phone / WhatsApp</span>
              <input
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={PHONE_PLACEHOLDER}
                required
              />
            </label>
            <AreaSelect value={location} onChange={setLocation} />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Email (optional)</span>
              <input
                type="email"
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Birthday (optional)</span>
              <input
                type="date"
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
              />
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Notes</span>
              <textarea
                className="min-h-24 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Save & add visit</Button>
            <Button type="button" variant="outline" onClick={() => navigate('/customers')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
      <p className="mt-4 text-sm text-muted">
        Looking for someone?{' '}
        <Link to="/customers" className="text-rose">
          Search customers
        </Link>
      </p>
      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </div>
  )
}
