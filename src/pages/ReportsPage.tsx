import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import { daysSince, formatAED } from '../lib/format'
import { hasAddedWallet } from '../lib/customerLinks'
import { packageRevenue, salonRevenue, visitRevenue } from '../lib/revenue'
import { useData } from '../context/DataContext'
import { Button, Card, EmptyState, Input, KpiCard, PageHeader, Toast } from '../components/ui'

export function ReportsPage() {
  const { customers, visits, memberships } = useData()
  const [from, setFrom] = useState('2026-01-01')
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [toast, setToast] = useState('')

  const stats = useMemo(() => {
    const inactive30 = customers.filter((c) => (daysSince(c.lastVisitAt) ?? 0) >= 30).length
    const inactive60 = customers.filter((c) => (daysSince(c.lastVisitAt) ?? 0) >= 60).length
    const inactive90 = customers.filter((c) => (daysSince(c.lastVisitAt) ?? 0) >= 90).length
    const visitRev = visitRevenue(visits, from, to)
    const packageRev = packageRevenue(memberships, from, to)
    const totalRevenue = salonRevenue(visits, memberships, from, to)
    const avgSpend = customers.length
      ? Math.round(customers.reduce((s, c) => s + c.lifetimeSpend, 0) / customers.length)
      : 0
    const avgVisits = customers.length
      ? (customers.reduce((s, c) => s + c.totalVisits, 0) / customers.length).toFixed(1)
      : '0'

    const profileUpdated = customers.filter((c) => Boolean(c.profileUpdatedAt)).length
    const walletAdded = customers.filter(hasAddedWallet).length

    return {
      inactive30,
      inactive60,
      inactive90,
      visitRev,
      packageRev,
      totalRevenue,
      avgSpend,
      avgVisits,
      profileUpdated,
      walletAdded,
    }
  }, [customers, visits, memberships, from, to])

  const revenueByCustomer = [...customers]
    .filter((c) => c.lifetimeSpend > 0)
    .sort((a, b) => b.lifetimeSpend - a.lifetimeSpend)
    .slice(0, 8)

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Visit totals plus Belle package purchases. Using a session does not add revenue again."
        actions={
          <Button variant="outline" onClick={() => setToast('CSV export will connect when the backend is ready')}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button type="button" variant="secondary" onClick={() => setToast('Range is applied as you change the dates')}>
            Date range
          </Button>
        </div>
      </Card>

      <h2 className="mb-3 font-display text-2xl">Customer reports</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
        <KpiCard label="Returning customers" value={customers.filter((c) => c.totalVisits > 1).length} />
        <KpiCard label="Gold customers" value={customers.filter((c) => c.loyaltyTier === 'Gold').length} accent="gold" />
        <KpiCard label="Premium customers" value={customers.filter((c) => c.loyaltyTier === 'Premium').length} accent="premium" />
        <KpiCard label="Inactive 30+ days" value={stats.inactive30} />
        <KpiCard label="Customers with visits" value={customers.filter((c) => c.totalVisits > 0).length} />
      </div>

      <h2 className="mb-3 mt-8 font-display text-2xl">Revenue & visits</h2>
      {visits.length === 0 && memberships.length === 0 ? (
        <EmptyState
          title="No visit or revenue history yet"
          description="Once staff record visits or sell a package, revenue will appear here."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total revenue" value={formatAED(stats.totalRevenue)} accent="gold" />
            <KpiCard label="Visit revenue" value={formatAED(stats.visitRev)} />
            <KpiCard label="Package sales" value={formatAED(stats.packageRev)} />
            <KpiCard label="Visits recorded" value={visits.length} />
            <KpiCard label="Avg visits / customer" value={stats.avgVisits} />
            <KpiCard label="Avg lifetime spend" value={formatAED(stats.avgSpend)} />
          </div>
          <Card className="mt-4" padding={false}>
            <div className="border-b border-line px-5 py-4">
              <h3 className="font-display text-xl">Revenue by customer</h3>
            </div>
            <table className="min-w-full text-sm">
              <tbody>
                {revenueByCustomer.map((c) => (
                  <tr key={c.id} className="border-t border-line/80">
                    <td className="px-5 py-3">{c.fullName}</td>
                    <td className="px-5 py-3 text-right font-medium">{formatAED(c.lifetimeSpend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <h2 className="mb-3 mt-8 font-display text-2xl">Retention</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Inactive 30 days" value={stats.inactive30} />
        <KpiCard label="Inactive 60 days" value={stats.inactive60} />
        <KpiCard label="Inactive 90 days" value={stats.inactive90} />
      </div>

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </div>
  )
}
