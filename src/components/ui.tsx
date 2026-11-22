import clsx from 'clsx'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { PAYMENT_METHODS, type PaymentMethod } from '../types'
import { togglePaymentMethod } from '../lib/payment'

export function cn(...classes: Array<string | false | null | undefined>) {
  return clsx(classes)
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2.5 text-sm',
        size === 'lg' && 'px-5 py-3 text-base',
        variant === 'primary' && 'bg-rose text-white hover:bg-rose-deep shadow-sm shadow-rose/20',
        variant === 'secondary' && 'bg-blush text-ink hover:bg-rose-soft/50',
        variant === 'ghost' && 'bg-transparent text-muted hover:bg-blush hover:text-ink',
        variant === 'outline' && 'border border-line bg-white text-ink hover:border-rose/40 hover:bg-blush/40',
        variant === 'danger' && 'bg-danger text-white hover:bg-danger/90',
        className,
      )}
      {...props}
    />
  )
}

export function Card({
  children,
  className,
  padding = true,
}: {
  children: ReactNode
  className?: string
  padding?: boolean
}) {
  return (
    <div className={cn('rounded-2xl border border-line/80 bg-white shadow-[0_8px_30px_rgba(42,36,33,0.04)]', padding && 'p-5 md:p-6', className)}>
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl md:text-4xl text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function Input({
  label,
  hint,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }) {
  return (
    <label className="block space-y-1.5">
      {label ? <span className="text-sm font-medium text-ink">{label}</span> : null}
      <input
        className={cn(
          'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-rose/50 focus:ring-2 focus:ring-rose/15',
          error && 'border-danger focus:border-danger focus:ring-danger/15',
          className,
        )}
        {...props}
      />
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

export function Textarea({
  label,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block space-y-1.5">
      {label ? <span className="text-sm font-medium text-ink">{label}</span> : null}
      <textarea
        className={cn(
          'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-rose/50 focus:ring-2 focus:ring-rose/15 min-h-24',
          className,
        )}
        {...props}
      />
    </label>
  )
}

export function Select({
  label,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block space-y-1.5">
      {label ? <span className="text-sm font-medium text-ink">{label}</span> : null}
      <select
        className={cn(
          'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-rose/50 focus:ring-2 focus:ring-rose/15',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  )
}

export function PaymentChecklist({
  label = 'Payment',
  hint = 'Tick every method they used',
  value,
  onChange,
}: {
  label?: string
  hint?: string
  value: PaymentMethod[]
  onChange: (next: PaymentMethod[]) => void
}) {
  return (
    <fieldset className="block space-y-1.5">
      <legend className="text-sm font-medium text-ink">{label}</legend>
      <p className="text-xs text-muted">{hint}</p>
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-white px-3 py-3">
        {PAYMENT_METHODS.map((method) => {
          const checked = value.includes(method)
          return (
            <label
              key={method}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm',
                checked ? 'bg-blush/70 text-ink' : 'text-ink hover:bg-blush/40',
              )}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line text-rose accent-[#C4A484]"
                checked={checked}
                onChange={() => onChange(togglePaymentMethod(value, method))}
              />
              {method}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function LoyaltyBadge({ tier }: { tier: 'Regular' | 'Gold' | 'Premium' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide',
        tier === 'Regular' && 'bg-blush text-muted',
        tier === 'Gold' && 'bg-gold-soft text-gold',
        tier === 'Premium' && 'bg-[#1E4D8C]/15 text-[#1E4D8C]',
      )}
    >
      {tier}
    </span>
  )
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'Delivered' ||
    status === 'Read' ||
    status === 'active' ||
    status === 'Valid' ||
    status === 'Active' ||
    status === 'Available' ||
    status === 'Completed' ||
    status === 'Reward'
      ? 'bg-success/10 text-success'
      : status === 'Failed' || status === 'disabled' || status === 'Expired'
        ? 'bg-danger/10 text-danger'
        : status === 'Sent' ||
            status === 'Queued' ||
            status === 'Used' ||
            status === 'Paused' ||
            status === 'Frozen' ||
            status === 'Pending' ||
            status === 'Upcoming'
          ? 'bg-warning/10 text-warning'
          : 'bg-blush text-muted'

  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize', tone)}>{status}</span>
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white/60 px-6 py-16 text-center">
      <h3 className="font-display text-2xl text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <button aria-label="Close" className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg animate-fade-up rounded-2xl border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="font-display text-2xl">{title}</h3>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-muted hover:bg-blush">
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  )
}

export function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string | number
  hint?: string
  accent?: 'rose' | 'gold' | 'premium' | 'default'
}) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className={cn(
          'absolute inset-y-0 left-0 w-1',
          accent === 'rose' && 'bg-rose',
          accent === 'gold' && 'bg-gold',
          accent === 'premium' && 'bg-premium',
          (!accent || accent === 'default') && 'bg-rose-soft',
        )}
      />
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  )
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[60] animate-fade-up rounded-xl border border-line bg-ink px-4 py-3 text-sm text-white shadow-lg">
      <div className="flex items-center gap-3">
        <span>{message}</span>
        <button onClick={onClose} className="text-white/70 hover:text-white">
          ✕
        </button>
      </div>
    </div>
  )
}
