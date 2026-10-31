import { NavLink, useLocation } from 'react-router-dom'
import { House, Map as MapIcon, Users, Wallet } from 'lucide-react'
import { LogoMark } from '@/design'
import { useSession } from '@/features/auth/session'

/**
 * The aggregator console's chrome, in the approved card design like the Agent App: the strip
 * with who is signed in, and four tabs at the foot: Home, Float, Agents, Network (the aggregator's own network; Orange's
 * national view is a separate account and screen). Profile opens
 * from the home header. The agent search lives on the Agents tab; the keyword search page stays
 * reachable by its address. The home screen carries its own dark header instead of the strip.
 */
export function AggregatorStrip() {
  const { session } = useSession()
  const { pathname } = useLocation()
  if (pathname === '/dealer' || pathname === '/dealer/') return null
  return (
    <div className="flex h-12 items-center justify-between gap-3 px-5 text-finder-ink">
      <span className="flex items-center gap-2 text-base font-bold">
        <LogoMark size={20} className="text-finder-ink" />
        <span className="sr-only">Aggregator App</span>
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-finder-muted">{session?.name}</span>
    </div>
  )
}

const TABS = [
  { to: '/dealer', label: 'Home', end: true, Icon: House },
  { to: '/dealer/float', label: 'Float', end: false, Icon: Wallet },
  { to: '/dealer/agents', label: 'Agents', end: false, Icon: Users },
  { to: '/dealer/network', label: 'Network', end: false, Icon: MapIcon },
]

/**
 * Home, Float, Agents, Network, as drawn in the approved design: 84 px, the orange marker on
 * top of the active tab, Lucide outline icons at 22 px. The bar never leaves the screen.
 */
export function DealerTabBar() {
  return (
    <nav aria-label="Aggregator sections" className="sticky bottom-0 mt-auto grid h-[84px] grid-cols-4 border-t border-design-nav-line bg-finder-card px-2 pb-6 pt-2.5">
      {TABS.map(({ to, label, end, Icon }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-1.5 text-[11px] font-bold ${isActive ? 'text-finder-link' : 'text-finder-tab-off'}`}>
          {({ isActive }) => (
            <>
              <span aria-hidden="true" className={`h-1 w-7 rounded-sm ${isActive ? 'bg-finder-accent' : 'bg-transparent'}`} />
              <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
