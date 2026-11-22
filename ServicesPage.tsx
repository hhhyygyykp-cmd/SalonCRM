import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { formatAED } from '../lib/format'
import { SERVICE_CATEGORY_ORDER, orderedServiceCategories } from '../lib/serviceCatalog'
import { useData } from '../context/DataContext'
import { Button, Card, Input, Modal, PageHeader, Select, StatusPill, Textarea, Toast } from '../components/ui'

export function ServicesPage() {
  const { services, addService } = useData()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState({
    name: '',
    category: 'Nails — Classic',
    defaultPrice: 100,
    description: '',
    active: true,
  })

  const grouped = useMemo(() => {
    const list = filter === 'all' ? services : services.filter((s) => s.category === filter)
    const map = new Map<string, typeof services>()
    for (const s of list) {
      if (!map.has(s.category)) map.set(s.category, [])
      map.get(s.category)!.push(s)
    }
    return [...map.entries()]
  }, [services, filter])

  const categories = useMemo(() => {
    return orderedServiceCategories([...services, ...SERVICE_CATEGORY_ORDER.map((category) => ({ category }) as const)])
  }, [services])

  return (
    <div>
      <PageHeader
        title="Services"
        subtitle="Official Belle Beauty Lounge menu & pricing (AED)."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Add service
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            filter === 'all' ? 'bg-rose text-white' : 'border border-line bg-white text-muted'
          }`}
        >
          All ({services.length})
        </button>
        {categories.map((c) => {
          const count = services.filter((s) => s.category === c).length
          if (!count && !SERVICE_CATEGORY_ORDER.includes(c)) return null
          return (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                filter === c ? 'bg-rose text-white' : 'border border-line bg-white text-muted'
              }`}
            >
              {c} ({count})
            </button>
          )
        })}
      </div>

      <div className="space-y-4">
        {grouped.map(([category, items]) => (
          <Card key={category} padding={false}>
            <div className="border-b border-line bg-blush/40 px-5 py-3">
              <h3 className="font-display text-xl text-ink">{category}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Service</th>
                    <th className="px-5 py-3 font-medium">Price</th>
                    <th className="px-5 py-3 font-medium">Notes</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id} className="border-t border-line/80">
                      <td className="px-5 py-3 font-medium">{s.name}</td>
                      <td className="px-5 py-3 whitespace-nowrap">{formatAED(s.defaultPrice)}</td>
                      <td className="px-5 py-3 text-muted">{s.description ?? '—'}</td>
                      <td className="px-5 py-3">
                        <StatusPill status={s.active ? 'active' : 'disabled'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add service"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await addService({
                  name: form.name || 'New Service',
                  category: form.category,
                  defaultPrice: form.defaultPrice,
                  description: form.description,
                  active: form.active,
                })
                setOpen(false)
                setToast('Service saved')
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Service name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Input
            label="Default price (AED)"
            type="number"
            value={form.defaultPrice}
            onChange={(e) => setForm({ ...form, defaultPrice: Number(e.target.value) })}
          />
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
      </Modal>
      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </div>
  )
}
