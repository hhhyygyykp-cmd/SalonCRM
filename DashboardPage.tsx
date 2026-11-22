import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MessageCircle } from 'lucide-react'
import { daysSince, formatAED } from '../lib/format'
import { formatCustomerArea } from '../lib/areas'
import { formatLocalPhone } from '../lib/phone'
import { hasAddedWallet } from '../lib/customerLinks'
import { localYmd, monthLabel, monthStartYmd, salonRevenue, ymdOf } from '../lib/revenue'
import { useData } from '../context/DataContext'
import { Button, Card, EmptyState, KpiCard, LoyaltyBadge, PageHeader } from '../components/ui'

export function DashboardPage() {
  const { customers, visits, memberships, settings, expenses } = useData()
  const [reminderFilter, setReminderFilter] = useState<30 | 60 | 90>(30)

  const inactive = (minDays: number) =>
    customers.filter((c) => {
      const d = daysSince(c.lastVisitAt)
      return d !== null && d >= minDays
    })

  const stats = useMemo(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const visitedToday = customers.filter((c) => c.lastVisitAt && new Date(c.lastVisitAt) >= startOfDay).length
    const visitedThisMonth = customers.filter((c) => c.lastVisitAt && new Date(c.lastVisitAt) >= startOfMonth).length
    const newThisMonth = customers.filter((c) => new Date(c.createdAt) >= startOfMonth).length

    const today = localYmd(now)
    const monthStart = monthStartYmd(now)
    const revenueToday = salonRevenue(visits, memberships, today, today)
    const revenueMonth = salonRevenue(visits, memberships, monthStart, today)
    const costsMonth = expenses
      .filter((e) => new Date(e.expenseDate) >= startOfMonth)
      .reduce((sum, e) => sum + e.amount, 0)
    const totalCosts = expenses.reduce((sum, e) => sum + e.amount, 0)

    return {
      visitedToday,
      visitedThisMonth,
      newThisMonth,
      revenueToday,
      revenueMonth,
      costsMonth,
      totalCosts,
      gold: customers.filter((c) => c.loyaltyTier === 'Gold').length,
      premium: customers.filter((c) => c.loyaltyTier === 'Premium').length,
      profileUpdated: customers.filter((c) => Boolean(c.profileUpdatedAt)).length,
      walletAdded: customers.filter(hasAddedWallet).length,
      inactive30: inactive(30).length,
      inactive60: inactive(60).length,
      inactive90: inactive(90).length,
    }
  }, [customers, visits, memberships, expenses])

  const tierDistribution = [
    { name: 'Regular', value: customers.filter((c) => c.loyaltyTier === 'Regular').length, color: '#C5CBB8' },
    { name: 'Gold', value: stats.gold, color: '#B8953B' },
    { name: 'Premium', value: stats.premium, color: '#1E4D8C' },
  ]

  const reminderCandidates = inactive(reminderFilter)
    .sort((a, b) => (daysSince(b.lastVisitAt) ?? 0) - (daysSince(a.lastVisitAt) ?? 0))
    .slice(0, 10)

  const hasVisitAnalytics = visits.length > 0 || memberships.length > 0

  const popularServices = useMemo(() => {
    const counts = new Map<string, number>()
    for (const v of visits) {
      for (const s of v.services) {
        counts.set(s.serviceName, (counts.get(s.serviceName) ?? 0) + s.quantity)
      }
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [visits])

  const revenueByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const v of visits) {
      const key = monthLabel(ymdOf(v.visitDate))
      map.set(key, (map.get(key) ?? 0) + (Number(v.finalTotal) || 0))
    }
    for (const m of memberships) {
      const key = monthLabel(ymdOf(m.purchaseDate))
      map.set(key, (map.get(key) ?? 0) + (Number(m.price) || 0))
    }
    return [...map.entries()].map(([month, revenue]) => ({ month, revenue }))
  }, [visits, memberships])

  const visitsByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const v of visits) {
      const key = new Date(v.visitDate).toLocaleString('en-GB', { month: 'short' })
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()].map(([month, visits]) => ({ month, visits }))
  }, [visits])

  const newCustomersByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of customers) {
      const key = new Date(c.createdAt).toLocaleString('en-GB', { month: 'short' })
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()].map(([month, count]) => ({ month, count }))
  }, [customers])

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${customers.length} real customers · ${settings.whatsapp}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total customers" value={customers.length} accent="rose" />
        <Link to="/customers?profile=updated" className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40">
          <KpiCard
            label="Updated their details"
            value={stats.profileUpdated}
            hint="Submitted the public profile form"
            accent="rose"
          />
        </Link>
        <Link to="/customers?wallet=1" className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40">
          <KpiCard
            label="Added wallet"
            value={stats.walletAdded}
            hint="Tapped Add to Apple or Google Wallet"
          />
        </Link>
        <KpiCard label="New this month" value={stats.newThisMonth} />
        <KpiCard label="Visited today" value={stats.visitedToday} />
        <KpiCard label="Visited this month" value={stats.visitedThisMonth} />
        <KpiCard label="Revenue today" value={formatAED(stats.revenueToday)} />
        <KpiCard label="Revenue this month" value={formatAED(stats.revenueMonth)} accent="gold" />
        <KpiCard label="Costs this month" value={formatAED(stats.costsMonth)} />
        <KpiCard label="Gold customers" value={stats.gold} accent="gold" />
        <KpiCard label="Premium customers" value={stats.premium} accent="premium" />
        <KpiCard label="Inactive 30+ days" value={stats.inactive30} />
        <KpiCard label="Inactive 60+ days" value={stats.inactive60} />
        <KpiCard label="Inactive 90+ days" value={stats.inactive90} />
      </div>
      <p className="mt-3 text-xs text-muted">
        Revenue is visits plus package purchases on the purchase date. Using a membership session does not add revenue
        again. Delivery stays on the visit.
      </p>

      {!hasVisitAnalytics ? (
        <Card className="mt-6">
          <EmptyState
            title="No visits recorded yet"
            description="Customer names and phones are loaded from your sheet. Charts and revenue will appear once you add visits or sell a package."
            action={
              <Link to="/visits/new">
                <Button>Record first visit</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <h3 className="font-display text-2xl">Revenue by month</h3>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueByMonth}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#535C49" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#535C49" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#E8DFD9" strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fill: '#7A706A', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#7A706A', fontSize: 12 }} />
                    <Tooltip formatter={(v) => formatAED(Number(v))} />
                    <Area type="monotone" dataKey="revenue" stroke="#535C49" fill="url(#rev)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <h3 className="font-display text-2xl">Loyalty mix</h3>
              <div className="mt-2 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={tierDistribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                      {tierDistribution.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="font-display text-2xl">Visits & new customers</h3>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={visitsByMonth.map((v, i) => ({
                      month: v.month,
                      visits: v.visits,
                      newCustomers: newCustomersByMonth[i]?.count ?? 0,
                    }))}
                  >
                    <CartesianGrid stroke="#E8DFD9" strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fill: '#7A706A', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#7A706A', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="visits" fill="#3E4437" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="newCustomers" fill="#C5CBB8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <h3 className="font-display text-2xl">Most popular services</h3>
              <div className="mt-4 h-56">
                {popularServices.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-muted">No service history yet</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={popularServices} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid stroke="#E8DFD9" strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fill: '#7A706A', fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#7A706A', fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#B8953B" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      <Card className="mt-6" padding={false}>
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-2xl">Customers who may need a reminder</h3>
            <p className="text-sm text-muted">Based on last recorded visit. Empty until visits are saved.</p>
          </div>
          <div className="flex gap-2">
            {[30, 60, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setReminderFilter(d as 30 | 60 | 90)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  reminderFilter === d ? 'bg-rose text-white' : 'bg-blush text-muted hover:text-ink'
                }`}
              >
                {d}+ days
              </button>
            ))}
          </div>
        </div>
        {reminderCandidates.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No inactive customers yet — add visits to track return reminders.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-blush/50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Area</th>
                  <th className="px-5 py-3 font-medium">Last visit</th>
                  <th className="px-5 py-3 font-medium">Days</th>
                  <th className="px-5 py-3 font-medium">Tier</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {reminderCandidates.map((c) => (
                  <tr key={c.id} className="border-t border-line/80">
                    <td className="px-5 py-3">
                      <Link to={`/customers/${c.id}`} className="font-medium text-ink hover:text-rose">
                        {c.fullName}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted">{formatLocalPhone(c.phone)}</td>
                    <td className="px-5 py-3 text-muted">{formatCustomerArea(c.location) ?? '—'}</td>
                    <td className="px-5 py-3 text-muted">
                      {c.lastVisitAt
                        ? new Date(c.lastVisitAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-5 py-3">{daysSince(c.lastVisitAt)} days</td>
                    <td className="px-5 py-3">
                      <LoyaltyBadge tier={c.loyaltyTier} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link to={`/customers/${c.id}`}>
                        <Button size="sm" variant="outline">
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
