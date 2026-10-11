import { NavLink } from 'react-router-dom'
import { LogoMark } from '@/design'
import { useSession } from '@/features/auth/session'
import { DashboardIcon, ProfileIcon, type IconProps } from '@/features/agent/components/agentChrome'

/**
 * The aggregator console's chrome, on the finder's design like the Agent App: the strip
 * with who is signed in, and four tabs at the foot. Dashboard, Agents, Search, Profile.
 */
export function AggregatorStrip() {
  const { session } = useSession()
  return (
    <div className="flex h-12 items-center justify-between gap-3 px-5 text-white">
      <span className="flex items-center gap-2 text-base font-bold">
        <LogoMark size={20} className="text-white" />
        Aggregator App
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-finder-muted">{session?.name}</span>
    </div>
  )
}

const fillWhenActive = (active: boolean) => (active ? 'currentColor' : 'none')

function AgentsIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" fill={fillWhenActive(active)} fillOpacity="0.25" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17" cy="9" r="2.5" fill={fillWhenActive(active)} fillOpacity="0.25" />
      <path d="M16 14.5c3 0 5.5 2 5.5 5" />
    </svg>
  )
}
function SearchIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" fill={fillWhenActive(active)} fillOpacity="0.25" />
      <path d="M15.5 15.5L21 21" />
    </svg>
  )
}

const TABS = [
  { to: '/dealer', label: 'Dashboard', end: true, Icon: DashboardIcon },
  { to: '/dealer/agents', label: 'Agents', end: false, Icon: AgentsIcon },
  { to: '/dealer/search', label: 'Search', end: false, Icon: SearchIcon },
  { to: '/dealer/profile', label: 'Profile', end: false, Icon: ProfileIcon },
]

/** Dashboard, Agents, Search, Profile. The active one is orange; the bar never leaves the screen. */
export function DealerTabBar() {
  return (
    <nav aria-label="Aggregator sections" className="sticky bottom-0 mt-auto flex bg-finder-bg pb-[env(safe-area-inset-bottom)] shadow-inset-finder">
      {TABS.map(({ to, label, end, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-bold ${isActive ? 'text-finder-link' : 'text-finder-muted'}`
          }
        >
          {({ isActive }) => (
            <>
              <Icon active={isActive} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
