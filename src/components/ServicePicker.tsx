import { useEffect, useState } from 'react'
import { formatAED } from '../lib/format'
import { orderedServiceCategories, servicesInCategory } from '../lib/serviceCatalog'
import type { ServiceItem } from '../types'

const selectClass =
  'w-full min-w-0 rounded-xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/15 disabled:opacity-60'

export function ServicePicker({
  services,
  value,
  onChange,
  disabled,
}: {
  services: ServiceItem[]
  value: string
  onChange: (service: ServiceItem | null) => void
  disabled?: boolean
}) {
  const selected = services.find((s) => s.id === value)
  const [category, setCategory] = useState(selected?.category ?? '')
  const categories = orderedServiceCategories(services)
  const options = category ? servicesInCategory(services, category) : []

  useEffect(() => {
    if (selected?.category) setCategory(selected.category)
  }, [selected?.id, selected?.category])

  return (
    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
      <label className="block min-w-0 space-y-1">
        <span className="text-xs font-medium text-muted">Category</span>
        <select
          className={selectClass}
          value={category}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value
            setCategory(next)
            onChange(null)
          }}
        >
          <option value="">Select category…</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-0 space-y-1">
        <span className="text-xs font-medium text-muted">Service</span>
        <select
          className={selectClass}
          value={value}
          disabled={disabled || !category}
          onChange={(e) => {
            const svc = services.find((s) => s.id === e.target.value)
            onChange(svc ?? null)
          }}
        >
          <option value="">{category ? 'Select service…' : 'Choose a category first'}</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {formatAED(s.defaultPrice)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
