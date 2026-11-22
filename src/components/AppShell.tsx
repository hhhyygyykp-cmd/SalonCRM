import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Scissors,
  Settings,
  IdCard,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { Button, cn } from './ui'
import { BrandLogo } from './BrandLogo'
import { WhatsAppNotifier } from './WhatsAppNotifier'
import { useWhatsAppUnread } from '../lib/useWhatsAppUnread'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/members', label: 'Memberships', icon: IdCard },
  { to: '/visits', label: 'Visits', icon: CalendarDays },
  { to: '/services', label: 'Services', icon: Scissors },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { to: '/expenses', label: 'Costs', icon: Wallet, adminOnly: true },
  { to: '/reports', label: 'Reports', icon: BarChart3, adminOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings, adminOnly: true },
]

export function AppShell() {
  const { user, logout, isAdmin } = useAuth()
  const { loadError, refresh, settings } = useData()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const unreadChats = useWhatsAppUnread(Boolean(user))

  const items = navItems.filter((item) => !item.adminOnly || isAdmin)

  const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-white/10 px-4 py-5">
        <BrandLogo imgClassName="h-20 md:h-24" />
        <p className="mt-3 text-center text-[11px] uppercase tracking-[0.2em] text-white/65">Staff CRM</p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                  isActive ? 'bg-white text-rose-deep shadow-sm' : 'text-white/75 hover:bg-white/10 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {item.to === '/whatsapp' && unreadChats > 0 ? (
                    <span
                      className={cn(
                        'ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                        isActive ? 'bg-rose text-white' : 'bg-white text-rose-deep',
                      )}
                    >
                      {unreadChats > 99 ? '99+' : unreadChats}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-auto border-t border-white/10 p-4">
        <div className="mb-3 rounded-xl bg-white/10 px-3 py-3">
          <p className="text-sm font-medium text-white">{user?.name}</p>
          <p className="text-xs text-white/60">
            {settings.salonName ? `${settings.salonName} · ` : ''}
            {user?.role === 'admin' ? 'Owner · full access' : 'Staff · customers, members, visits, WhatsApp'}
          </p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-white/80 hover:bg-white/10 hover:text-white"
          onClick={async () => {
            await logout()
            navigate('/login')
          }}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  )

  const pageTitle =
    items.find((i) => (i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to)))?.label ??
    settings.salonName

  return (
    <div className="min-h-screen lg:pl-[260px]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] overflow-y-auto bg-gradient-to-b from-rose-deep to-[#2f342a] lg:block">
        <Sidebar />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-[280px] overflow-y-auto bg-gradient-to-b from-rose-deep to-[#2f342a] shadow-xl">
            <button className="absolute right-3 top-3 rounded-lg p-2 text-white/80" onClick={() => setMobileOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-cream/90 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
            <div className="flex items-center gap-3">
              <button
                className="rounded-xl border border-line bg-white p-2 text-ink lg:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <BrandLogo variant="plain" className="hidden sm:flex" imgClassName="h-10" />
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted">{settings.salonName}</p>
                <p className="font-display text-xl text-ink">{pageTitle}</p>
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <Button variant="outline" size="sm" onClick={() => navigate('/customers/new')}>
                New Customer
              </Button>
              <Button size="sm" onClick={() => navigate('/visits/new')}>
                Add Visit
              </Button>
            </div>
          </div>
        </header>

        <main className={cn('px-4 py-5 md:px-6 md:py-7', location.pathname.startsWith('/whatsapp') && 'overflow-hidden py-4 md:py-5')}>
          <div className="animate-fade-up mx-auto max-w-7xl">
            {loadError ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-soft bg-blush px-4 py-3 text-sm text-rose-deep">
                <p>Could not refresh data from the server. Your last loaded data is still shown. {loadError}</p>
                <Button size="sm" variant="outline" onClick={() => void refresh()}>
                  Retry
                </Button>
              </div>
            ) : null}
            <WhatsAppNotifier enabled={Boolean(user)} />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
