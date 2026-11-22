import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Search } from 'lucide-react'
import { daysSince, formatAED } from '../lib/format'
import { formatLocalPhone, phoneDigits, phonesMatch } from '../lib/phone'
import { formatCustomerArea } from '../lib/areas'
import { useData } from '../context/DataContext'
import type { LoyaltyTier } from '../types'
import { Button, Card, EmptyState, Input, LoyaltyBadge, PageHeader, Select } from '../components/ui'
import { hasAddedWallet, needsProfileUpdate } from '../lib/customerLinks'

type FilterKey =
  | 'all'
  | LoyaltyTier
  | 'new'
  | 'recent'
  | 'inactive30'
  | 'inactive60'
  | 'inactive90'
  | 'needsUpdate'
  | 'updated'
  | 'walletAdded'

function filterFromParams(params: URLSearchParams): FilterKey {
  if (params.get('profile') === 'updated') return 'updated'
  if (params.get('profile') === 'needs') return 'needsUpdate'
  if (params.get('wallet') === '1') return 'walletAdded'
  const inactive = params.get('inactive')
  if (inactive === '30') return 'inactive30'
  if (inactive === '60') return 'inactive60'
  if (inactive === '90') return 'inactive90'
  return 'all'
}

export function CustomersPage() {
  const { customers } = useData()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>(() => filterFromParams(params))
  const [minSpend, setMinSpend] = useState('')
  const [maxSpend, setMaxSpend] = useState('')

  useEffect(() => {
    const next = filterFromParams(params)
    if (next !== 'all') setFilter(next)
  }, [params])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return customers.filter((c) => {
      const qDigits = phoneDigits(query)
      const matchesQuery =
        !q ||
        c.fullName.toLowerCase().includes(q) ||
        formatLocalPhone(c.phone).includes(q) ||
        formatLocalPhone(c.whatsappPhone).includes(q) ||
        (qDigits.length >= 4 && (phonesMatch(c.phone, query) || phoneDigits(c.phone).includes(qDigits))) ||
        (formatCustomerArea(c.location)?.toLowerCase().includes(q) ?? false)

      const days = daysSince(c.lastVisitAt)
      const createdDays = daysSince(c.createdAt) ?? 999

      let matchesFilter = true
      if (filter === 'Regular' || filter === 'Gold' || filter === 'Premium') matchesFilter = c.loyaltyTier === filter
      if (filter === 'new') matchesFilter = createdDays <= 30
      if (filter === 'recent') matchesFilter = days !== null && days <= 14
      if (filter === 'inactive30') matchesFilter = days !== null && days >= 30
      if (filter === 'inactive60') matchesFilter = days !== null && days >= 60
      if (filter === 'inactive90') matchesFilter = days !== null && days >= 90
      if (filter === 'needsUpdate') matchesFilter = needsProfileUpdate(c)
      if (filter === 'updated') matchesFilter = Boolean(c.profileUpdatedAt)
      if (filter === 'walletAdded') matchesFilter = hasAddedWallet(c)

      const min = minSpend ? Number(minSpend) : 0
      const max = maxSpend ? Number(maxSpend) : Infinity
      const matchesSpend = c.lifetimeSpend >= min && c.lifetimeSpend <= max

      return matchesQuery && matchesFilter && matchesSpend
    })
  }, [customers, query, filter, minSpend, maxSpend])

  const profileUpdatedCount = customers.filter((c) => Boolean(c.profileUpdatedAt)).length
  const walletAddedCount = customers.filter(hasAddedWallet).length

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} customers · ${profileUpdatedCount} updated details · ${walletAddedCount} added wallet`}
        actions={
          <Button onClick={() => navigate('/customers/new')}>
            <Plus className="h-4 w-4" />
            New Customer
          </Button>
        }
      />

      <Card>
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_0.7fr_0.7fr]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone, area…"
              className="w-full rounded-xl border border-line bg-white py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15"
            />
          </label>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)}>
            <option value="all">All customers</option>
            <option value="Regular">Regular</option>
            <option value="Gold">Gold</option>
            <option value="Premium">Premium</option>
            <option value="new">New customers</option>
            <option value="recent">Recently visited</option>
            <option value="inactive30">Inactive 30+ days</option>
            <option value="inactive60">Inactive 60+ days</option>
            <option value="inactive90">Inactive 90+ days</option>
            <option value="updated">Updated by customer</option>
            <option value="needsUpdate">Not yet updated by customer</option>
            <option value="walletAdded">Added wallet</option>
          </Select>
          <Input placeholder="Min spend" type="number" value={minSpend} onChange={(e) => setMinSpend(e.target.value)} />
          <Input placeholder="Max spend" type="number" value={maxSpend} onChange={(e) => setMaxSpend(e.target.value)} />
        </div>
      </Card>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState
            title="No customers found"
            description="Try another phone number or create a new customer."
            action={
              <Button onClick={() => navigate('/customers/new')}>
                <Plus className="h-4 w-4" />
                New Customer
              </Button>
            }
          />
        ) : (
          <Card padding={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-blush/50 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Phone</th>
                    <th className="px-5 py-3 font-medium">Area</th>
                    <th className="px-5 py-3 font-medium">Tier</th>
                    <th className="px-5 py-3 font-medium">Lifetime</th>
                    <th className="px-5 py-3 font-medium">Visits</th>
                    <th className="px-5 py-3 font-medium">Last visit</th>
                    <th className="px-5 py-3 font-medium">Last services</th>
                    <th className="px-5 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-t border-line/80 hover:bg-blush/30">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Link to={`/customers/${c.id}`} className="font-medium text-ink hover:text-rose">
                            {c.fullName}
                          </Link>
                          {c.profileUpdatedAt ? (
                            <span className="rounded-full bg-blush px-1.5 py-0.5 text-[10px] font-medium text-rose-deep">
                              Updated
                            </span>
                          ) : null}
                          {hasAddedWallet(c) ? (
                            <span className="rounded-full bg-cream px-1.5 py-0.5 text-[10px] font-medium text-ink/70">
                              Wallet
                            </span>
                          ) : null}
                          <Link
                            to={`/customers/${c.id}?edit=1`}
                            className="inline-flex rounded-lg p-1 text-rose hover:bg-blush"
                            title="Edit customer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted">{formatLocalPhone(c.phone)}</td>
                      <td className="px-5 py-3 text-muted">{formatCustomerArea(c.location) ?? '—'}</td>
                      <td className="px-5 py-3">
                        <LoyaltyBadge tier={c.loyaltyTier} />
                      </td>
                      <td className="px-5 py-3">{formatAED(c.lifetimeSpend)}</td>
                      <td className="px-5 py-3">{c.totalVisits}</td>
                      <td className="px-5 py-3 text-muted">
                        {c.lastVisitAt
                          ? `${new Date(c.lastVisitAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${daysSince(c.lastVisitAt)}d`
                          : '—'}
                      </td>
                      <td className="px-5 py-3 text-muted">{c.lastServices.join(', ') || '—'}</td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          to={`/customers/${c.id}?edit=1`}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-rose hover:bg-blush"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
