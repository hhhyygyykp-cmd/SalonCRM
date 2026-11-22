import { useMemo, useState } from 'react'
import { Plus, Trash2, Wallet } from 'lucide-react'
import { formatAED } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import {
  Button,
  Card,
  EmptyState,
  Input,
  KpiCard,
  Modal,
  PageHeader,
  Select,
  Textarea,
  Toast,
} from '../components/ui'
import type { ExpenseCategory, PaymentMethod } from '../types'

const categories: ExpenseCategory[] = [
  'Supplies',
  'Products',
  'Car / Transport',
  'Rent',
  'Utilities',
  'Salary',
  'Maintenance',
  'Marketing',
  'Other',
]

export function ExpensesPage() {
  const { user } = useAuth()
  const { expenses, addExpense, deleteExpense, staffMembers } = useData()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | ExpenseCategory>('all')
  const [form, setForm] = useState({
    title: '',
    category: 'Supplies' as ExpenseCategory,
    amount: 0,
    expenseDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash' as PaymentMethod,
    vendor: '',
    notes: '',
  })

  const filtered = useMemo(
    () => (filter === 'all' ? expenses : expenses.filter((e) => e.category === filter)),
    [expenses, filter],
  )

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => +new Date(b.expenseDate) - +new Date(a.expenseDate)),
    [filtered],
  )

  const totals = useMemo(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthTotal = expenses
      .filter((e) => new Date(e.expenseDate) >= startOfMonth)
      .reduce((s, e) => s + e.amount, 0)
    const allTotal = expenses.reduce((s, e) => s + e.amount, 0)
    const byCategory = categories
      .map((c) => ({
        category: c,
        amount: expenses.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0),
      }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
    return { monthTotal, allTotal, byCategory }
  }, [expenses])

  const resetForm = () =>
    setForm({
      title: '',
      category: 'Supplies',
      amount: 0,
      expenseDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'Cash',
      vendor: '',
      notes: '',
    })

  return (
    <div>
      <PageHeader
        title="Costs & Expenses"
        subtitle="Track money you paid — supplies, car prep, products, rent, and more."
        actions={
          <Button
            onClick={() => {
              resetForm()
              setOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            Add cost
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <KpiCard label="This month" value={formatAED(totals.monthTotal)} accent="rose" />
        <KpiCard label="All recorded costs" value={formatAED(totals.allTotal)} />
        <KpiCard label="Entries" value={expenses.length} />
      </div>

      {totals.byCategory.length > 0 ? (
        <Card className="mb-4">
          <h3 className="font-display text-xl">By category</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {totals.byCategory.map((c) => (
              <div key={c.category} className="flex items-center justify-between rounded-xl bg-blush/40 px-3 py-2 text-sm">
                <span>{c.category}</span>
                <span className="font-medium">{formatAED(c.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            filter === 'all' ? 'bg-rose text-white' : 'border border-line bg-white text-muted'
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              filter === c ? 'bg-rose text-white' : 'border border-line bg-white text-muted'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title="No costs recorded yet"
          description="Add expenses like car preparing, buying products, supplies, or rent."
          action={
            <Button
              onClick={() => {
                resetForm()
                setOpen(true)
              }}
            >
              <Wallet className="h-4 w-4" />
              Add first cost
            </Button>
          }
        />
      ) : (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-blush/50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Title</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Vendor</th>
                  <th className="px-5 py-3">Payment</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">By</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr key={e.id} className="border-t border-line/80">
                    <td className="px-5 py-3 whitespace-nowrap">
                      {new Date(e.expenseDate).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{e.title}</p>
                      {e.notes ? <p className="text-xs text-muted">{e.notes}</p> : null}
                    </td>
                    <td className="px-5 py-3 text-muted">{e.category}</td>
                    <td className="px-5 py-3 text-muted">{e.vendor ?? '—'}</td>
                    <td className="px-5 py-3 text-muted">{e.paymentMethod ?? '—'}</td>
                    <td className="px-5 py-3 font-medium text-rose-deep">{formatAED(e.amount)}</td>
                    <td className="px-5 py-3 text-muted">
                      {staffMembers.find((s) => s.id === e.recordedBy)?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        className="inline-flex rounded-lg p-2 text-muted hover:bg-blush hover:text-danger"
                        onClick={() => setDeleteId(e.id)}
                        aria-label="Delete expense"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add cost"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const result = await addExpense({
                  title: form.title,
                  category: form.category,
                  amount: form.amount,
                  expenseDate: form.expenseDate,
                  paymentMethod: form.paymentMethod,
                  vendor: form.vendor || undefined,
                  notes: form.notes || undefined,
                  recordedBy: user?.id ?? '',
                })
                if ('error' in result) {
                  setToast(result.error)
                  return
                }
                setOpen(false)
                resetForm()
                setToast('Cost saved')
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="What did you pay for?"
            placeholder="Car preparing, nail supplies, perfume…"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Select
            label="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Amount (AED)"
              type="number"
              min={0}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
            <Input
              label="Date"
              type="date"
              value={form.expenseDate}
              onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Payment method"
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}
            >
              <option>Cash</option>
              <option>Card</option>
              <option>Tabby</option>
              <option>Transfer</option>
              <option>Other</option>
            </Select>
            <Input
              label="Vendor / shop (optional)"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
          </div>
          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
      </Modal>

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete this cost?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!deleteId) return
                try {
                  await deleteExpense(deleteId)
                  setDeleteId(null)
                  setToast('Cost removed')
                } catch (e) {
                  setToast(e instanceof Error ? e.message : 'Could not delete cost')
                }
              }}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          This removes the cost from Supabase. Visit and customer history are not affected.
        </p>
      </Modal>

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </div>
  )
}
