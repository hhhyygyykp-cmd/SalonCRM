import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, Search, Snowflake, Sun, Trash2 } from 'lucide-react'
import { formatAED } from '../lib/format'
import { formatLocalPhone, phoneDigits, phonesMatch } from '../lib/phone'
import {
  MEMBERSHIP_PRODUCTS,
  canDeleteMembership,
  canRecordUsage,
  deriveMembershipStatus,
  formatDay,
  membershipBalanceLabel,
  todayYmd,
} from '../lib/memberships'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { Button, Card, EmptyState, Input, Modal, PageHeader, Select, StatusPill, Toast } from '../components/ui'
import type { CustomerMembership, MembershipStatus } from '../types'

function customerLabel(name: string, phone: string) {
  return `${name} · ${formatLocalPhone(phone)}`
}

export function MembersPage() {
  const { memberships, customers } = useData()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | MembershipStatus>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const qDigits = phoneDigits(query)
    return memberships.filter((m) => {
      const customer = customers.find((c) => c.id === m.customerId)
      const status = deriveMembershipStatus(m)
      const matchesQuery =
        !q ||
        m.productName.toLowerCase().includes(q) ||
        m.serviceName.toLowerCase().includes(q) ||
        (customer?.fullName.toLowerCase().includes(q) ?? false) ||
        (customer && formatLocalPhone(customer.phone).includes(q)) ||
        (customer && qDigits.length >= 4 && (phonesMatch(customer.phone, query) || phoneDigits(customer.phone).includes(qDigits)))
      return matchesQuery && (filter === 'all' || status === filter)
    })
  }, [memberships, customers, query, filter])

  return (
    <div>
      <PageHeader
        title="Memberships"
        subtitle="Belle subscription packages on existing customers. Delivery is charged on visits, not in the package price."
        actions={
          <Button onClick={() => navigate('/members/new')}>
            <Plus className="h-4 w-4" />
            Add package
          </Button>
        }
      />

      <Card>
        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customer, phone, or package…"
              className="w-full rounded-xl border border-line bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
            />
          </label>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | MembershipStatus)}>
            <option value="all">All packages</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="Frozen">Frozen</option>
            <option value="Completed">Completed</option>
            <option value="Expired">Expired</option>
          </Select>
        </div>
      </Card>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState
            title="No packages yet"
            description="Attach a Belle subscription to an existing customer. This is not a separate people list."
            action={
              <Button onClick={() => navigate('/members/new')}>
                <Plus className="h-4 w-4" />
                Add package
              </Button>
            }
          />
        ) : (
          <Card padding={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-blush/50 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-5 py-3 font-medium">Package</th>
                    <th className="px-5 py-3 font-medium">Balance</th>
                    <th className="px-5 py-3 font-medium">Purchased</th>
                    <th className="px-5 py-3 font-medium">Expires</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const customer = customers.find((c) => c.id === m.customerId)
                    return (
                      <tr key={m.id} className="border-t border-line/80 hover:bg-blush/30">
                        <td className="px-5 py-3">
                          {customer ? (
                            <Link to={`/customers/${customer.id}`} className="font-medium text-ink hover:text-rose">
                              {customer.fullName}
                            </Link>
                          ) : (
                            '—'
                          )}
                          <p className="text-xs text-muted">{customer ? formatLocalPhone(customer.phone) : ''}</p>
                        </td>
                        <td className="px-5 py-3">
                          <Link to={`/members/${m.id}`} className="font-medium text-ink hover:text-rose">
                            {m.productName}
                          </Link>
                          <p className="text-xs text-muted">{formatAED(m.price)}</p>
                        </td>
                        <td className="px-5 py-3 text-muted">{membershipBalanceLabel(m)}</td>
                        <td className="px-5 py-3 text-muted">{formatDay(m.purchaseDate)}</td>
                        <td className="px-5 py-3 text-muted">{formatDay(m.expiryDate)}</td>
                        <td className="px-5 py-3">
                          <StatusPill status={deriveMembershipStatus(m)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

export function NewMemberPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const { customers, addMembership } = useData()
  const preset = customers.find((c) => c.id === params.get('customerId'))
  const [customerId, setCustomerId] = useState(preset?.id ?? '')
  const [customerQuery, setCustomerQuery] = useState(
    preset ? customerLabel(preset.fullName, preset.phone) : '',
  )
  const [productId, setProductId] = useState(MEMBERSHIP_PRODUCTS[0].id)
  const [purchaseDate, setPurchaseDate] = useState(todayYmd())
  const [activateNow, setActivateNow] = useState(true)
  const [activationDate, setActivationDate] = useState(todayYmd())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedCustomer = customers.find((c) => c.id === customerId)
  const product = MEMBERSHIP_PRODUCTS.find((p) => p.id === productId)
  const matches = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    const qDigits = phoneDigits(customerQuery)
    if (!q) return customers.slice(0, 8)
    return customers
      .filter(
        (c) =>
          c.fullName.toLowerCase().includes(q) ||
          formatLocalPhone(c.phone).includes(q) ||
          (qDigits.length >= 4 && (phonesMatch(c.phone, customerQuery) || phoneDigits(c.phone).includes(qDigits))),
      )
      .slice(0, 8)
  }, [customers, customerQuery])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!customerId) {
      setError('Select an existing customer. Memberships are packages, not a separate people list.')
      return
    }
    if (!user?.id) {
      setError('You must be signed in.')
      return
    }
    setSaving(true)
    setError('')
    const result = await addMembership({
      customerId,
      productId,
      purchaseDate,
      activateNow,
      activationDate: activateNow ? activationDate : undefined,
      notes,
      createdBy: user.id,
    })
    setSaving(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    navigate(`/members/${result.id}`)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add package"
        subtitle="Attach one of the four Belle subscriptions to a customer already in the CRM."
      />
      <Card>
        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Input
              label="Customer"
              value={customerQuery}
              placeholder="Search name or phone…"
              onChange={(e) => {
                setCustomerQuery(e.target.value)
                setCustomerId('')
              }}
            />
            {selectedCustomer ? (
              <div className="rounded-xl border border-line bg-blush/20 px-4 py-3 text-sm">
                <p className="font-medium text-ink">{selectedCustomer.fullName}</p>
                <p className="text-muted">
                  {formatLocalPhone(selectedCustomer.phone)} · {selectedCustomer.loyaltyTier} ·{' '}
                  {formatAED(selectedCustomer.lifetimeSpend)}
                </p>
              </div>
            ) : (
              <ul className="overflow-hidden rounded-xl border border-line">
                {matches.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-muted">No matching customer. Add them under Customers first.</li>
                ) : (
                  matches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-blush/40"
                        onClick={() => {
                          setCustomerId(c.id)
                          setCustomerQuery(customerLabel(c.fullName, c.phone))
                        }}
                      >
                        <span className="font-medium">{c.fullName}</span>
                        <span className="text-muted">{formatLocalPhone(c.phone)}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          <div className="grid gap-3">
            <p className="text-sm font-medium">Package</p>
            {MEMBERSHIP_PRODUCTS.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                  productId === p.id ? 'border-rose bg-blush/30' : 'border-line bg-white'
                }`}
              >
                <span>
                  <input
                    type="radio"
                    className="sr-only"
                    name="product"
                    checked={productId === p.id}
                    onChange={() => setProductId(p.id)}
                  />
                  <span className="font-medium text-ink">{p.name}</span>
                  <span className="mt-0.5 block text-muted">
                    {p.model === 'monthly_cycle'
                      ? 'Classic Mani & Pedi · 1 session / month · unused months do not carry forward'
                      : `${p.totalSessions} sessions · valid ${p.validityMonths} months`}
                  </span>
                </span>
                <span className="shrink-0 font-medium">{formatAED(p.price)}</span>
              </label>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Purchase date"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              required
            />
            <label className="flex items-center gap-2 pt-7 text-sm">
              <input
                type="checkbox"
                checked={activateNow}
                onChange={(e) => setActivateNow(e.target.checked)}
              />
              Activate now
            </label>
            {activateNow ? (
              <Input
                label="Activation date"
                type="date"
                value={activationDate}
                onChange={(e) => setActivationDate(e.target.value)}
                required
              />
            ) : null}
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Notes</span>
            <textarea
              className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <p className="text-xs text-muted">
            Package price is salon revenue on the purchase date and counts toward My Belle lifetime spend, not visit
            count. Using a session later does not add revenue again. Delivery is not included — charge it on the visit
            as usual.
            {product?.model === 'monthly_cycle'
              ? ' Nail months are Available / Used / Expired. Do not treat this as a 12-session balance.'
              : ''}
          </p>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save package'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/members')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

export function MemberProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { memberships, customers, staffMembers, activateMembership, setMembershipFrozen, recordMembershipUsage, deleteMembership } =
    useData()
  const membership = memberships.find((m) => m.id === id)
  const customer = customers.find((c) => c.id === membership?.customerId)
  const [activationDate, setActivationDate] = useState(todayYmd())
  const [usageNotes, setUsageNotes] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!membership) {
    return (
      <EmptyState
        title="Package not found"
        description="This membership is not in the register."
        action={<Button onClick={() => navigate('/members')}>Back to memberships</Button>}
      />
    )
  }

  const status = deriveMembershipStatus(membership)
  const canUse = canRecordUsage(membership)
  const canDelete = canDeleteMembership(membership)
  const getStaffName = (staffId?: string) => staffMembers.find((s) => s.id === staffId)?.name ?? '—'

  const run = async (fn: () => Promise<CustomerMembership | { error: string }>, ok: string) => {
    setBusy(true)
    setError('')
    const result = await fn()
    setBusy(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setToast(ok)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={membership.productName}
        subtitle={`${membership.serviceName} · ${formatAED(membership.price)}`}
        actions={
          <>
            {customer ? (
              <Button variant="outline" onClick={() => navigate(`/customers/${customer.id}`)}>
                Customer profile
              </Button>
            ) : null}
            {status === 'Active' ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => run(() => setMembershipFrozen(membership.id, true), 'Package frozen')}
              >
                <Snowflake className="h-4 w-4" />
                Freeze
              </Button>
            ) : null}
            {status === 'Frozen' ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => run(() => setMembershipFrozen(membership.id, false), 'Package unfrozen')}
              >
                <Sun className="h-4 w-4" />
                Unfreeze
              </Button>
            ) : null}
            {canDelete ? (
              <Button variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
                Delete package
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Status</p>
          <div className="mt-2">
            <StatusPill status={status} />
          </div>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Balance</p>
          <p className="mt-2 text-sm font-medium">{membershipBalanceLabel(membership)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Activated</p>
          <p className="mt-2 font-display text-xl">{formatDay(membership.activationDate)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Expires</p>
          <p className="mt-2 font-display text-xl">{formatDay(membership.expiryDate)}</p>
        </Card>
      </div>

      <Card className="mt-4">
        <p className="text-xs uppercase tracking-[0.1em] text-muted">Customer</p>
        {customer ? (
          <div className="mt-2">
            <Link to={`/customers/${customer.id}`} className="font-medium text-ink hover:text-rose">
              {customer.fullName}
            </Link>
            <p className="text-sm text-muted">
              {formatLocalPhone(customer.phone)}
              {customer.location ? ` · ${customer.location}` : ''}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Customer missing</p>
        )}
        <p className="mt-3 text-xs text-muted">
          Purchased {formatDay(membership.purchaseDate)}. Delivery is not included in the package — charge it on the
          visit. Purchase counts toward My Belle spend.
        </p>
        {membership.notes ? <p className="mt-2 text-sm">{membership.notes}</p> : null}
      </Card>

      {status === 'Pending' ? (
        <Card className="mt-4">
          <h2 className="font-display text-2xl">Activate</h2>
          <p className="mt-1 text-sm text-muted">
            Activation starts validity
            {membership.model === 'monthly_cycle' ? ' and the 12 monthly cycles.' : '.'}
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Input
              label="Activation date"
              type="date"
              value={activationDate}
              onChange={(e) => setActivationDate(e.target.value)}
            />
            <Button
              disabled={busy}
              onClick={() => run(() => activateMembership(membership.id, activationDate), 'Package activated')}
            >
              Activate package
            </Button>
          </div>
        </Card>
      ) : null}

      {membership.model === 'monthly_cycle' ? (
        <Card className="mt-4">
          <h2 className="font-display text-2xl">Monthly cycles</h2>
          <p className="mt-1 text-sm text-muted">
            Classic Mani & Pedi, one session each month. Unused months expire and do not carry forward.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {membership.cycles.map((cycle) => (
              <div key={cycle.id} className="rounded-xl border border-line px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Month {cycle.cycleIndex}</p>
                  <StatusPill status={cycle.status} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {formatDay(cycle.startDate)} – {formatDay(cycle.endDate)}
                </p>
                {cycle.usedAt ? (
                  <p className="mt-1 text-xs text-muted">
                    Used {new Date(cycle.usedAt).toLocaleString('en-GB')} · {getStaffName(cycle.usedBy)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="mt-4">
          <h2 className="font-display text-2xl">Sessions</h2>
          <p className="mt-2 text-sm text-muted">
            {membership.usedSessions} used · {Math.max(0, membership.totalSessions - membership.usedSessions)} remaining
            of {membership.totalSessions}
          </p>
        </Card>
      )}

      <Card className="mt-4">
        <h2 className="font-display text-2xl">Record session</h2>
        <p className="mt-1 text-sm text-muted">
          After the service is delivered, mark one session used. This is staff-only — there is no Book Now link.
        </p>
        <label className="mt-4 block space-y-1.5">
          <span className="text-sm font-medium">Notes (optional)</span>
          <textarea
            className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
            rows={2}
            value={usageNotes}
            onChange={(e) => setUsageNotes(e.target.value)}
          />
        </label>
        <Button
          className="mt-3"
          disabled={busy || !canUse || !user?.id}
          onClick={() =>
            run(
              () => recordMembershipUsage(membership.id, user!.id, usageNotes),
              'Session recorded',
            )
          }
        >
          Record session as used
        </Button>
        {!canUse ? (
          <p className="mt-2 text-xs text-muted">
            {status === 'Frozen'
              ? 'Unfreeze the package before recording a session.'
              : status === 'Pending'
                ? 'Activate the package first.'
                : membership.model === 'monthly_cycle'
                  ? 'No session is available this month.'
                  : 'This package has no remaining sessions or has expired.'}
          </p>
        ) : null}
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </Card>

      <Card className="mt-4">
        <h2 className="font-display text-2xl">Usage history</h2>
        {membership.usages.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No sessions recorded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {membership.usages.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span>
                  {new Date(u.usedAt).toLocaleString('en-GB')}
                  {u.notes ? ` · ${u.notes}` : ''}
                </span>
                <span className="text-muted">{getStaffName(u.staffId)}</span>
              </li>
            ))}
          </ul>
        )}
        {!canDelete ? (
          <p className="mt-3 text-xs text-muted">This package cannot be deleted because a session has already been used.</p>
        ) : (
          <p className="mt-3 text-xs text-muted">
            Unused packages can be deleted. That removes the sale from revenue and My Belle spend.
          </p>
        )}
      </Card>

      <Modal
        open={confirmDelete}
        title="Delete this package?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>
              Keep package
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError('')
                const result = await deleteMembership(membership.id)
                setBusy(false)
                if ('error' in result) {
                  setConfirmDelete(false)
                  setError(result.error)
                  return
                }
                navigate('/members')
              }}
            >
              {busy ? 'Deleting…' : 'Delete package'}
            </Button>
          </>
        }
      >
        <p className="text-sm">
          {customer ? customer.fullName : 'This customer'} bought {membership.productName} for {formatAED(membership.price)} and
          has not used a session.
        </p>
        <p className="mt-2 text-sm text-muted">
          Deleting removes the package and takes {formatAED(membership.price)} off revenue and lifetime spend.
        </p>
      </Modal>

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </div>
  )
}
