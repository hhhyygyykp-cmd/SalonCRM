import { salonSettings } from '../data/mockData'
import { cn } from './ui'

export function BrandLogo({
  className,
  imgClassName,
  variant = 'light',
}: {
  className?: string
  imgClassName?: string
  variant?: 'light' | 'dark' | 'plain'
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden',
        variant === 'light' && 'rounded-2xl bg-white p-2 shadow-sm',
        variant === 'dark' && 'rounded-2xl bg-white/95 p-2',
        variant === 'plain' && '',
        className,
      )}
    >
      <img
        src="/belle-logo.svg"
        alt={salonSettings.salonName}
        className={cn('h-14 w-auto object-contain', imgClassName)}
      />
    </div>
  )
}
