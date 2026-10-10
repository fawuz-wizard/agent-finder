import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { LogoMark } from '@/design'
import { useSession } from '@/features/auth/session'
import { FinderBox } from '@/features/end-user/components/finder'

/**
 * The Agent App's chrome, in the same language as the customer module: the dark surface,
 * Poppins, panels with the inset glow, one orange for actions. Three tabs at the foot.
 */

/** Who is signed in and which app this is. */
export function AgentStrip() {
  const { session } = useSession()
  return (
    <div className="flex h-12 items-center justify-between gap-3 px-5 text-white">
      <span className="flex items-center gap-2 text-base font-bold">
        <LogoMark size={22} className="text-white" />
        Agent App
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-finder-muted">{session?.name}</span>
    </div>
  )
}

/** A section of a screen: the file's panel, padded. */
export function Panel({ className = '', children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <FinderBox className={`flex flex-col gap-2 px-4 py-4 ${className}`} {...rest}>
      {children}
    </FinderBox>
  )
}

/** The small caps label above a panel's content. */
export function Label({ id, children }: { id?: string | undefined; children: ReactNode }) {
  return (
    <p id={id} className="text-xs font-bold uppercase tracking-wider text-finder-muted">
      {children}
    </p>
  )
}

/** The screen's title row: what this screen is, in the file's 24 px. */
export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="flex flex-col gap-0.5">
      <h1 className="text-xl font-bold leading-tight text-white">{children}</h1>
      {sub && <p className="text-sm font-semibold text-finder-muted">{sub}</p>}
    </header>
  )
}

/* The three tabs: one icon family, 2 px strokes, filled when active. */
type IconProps = { active: boolean }
const fillWhenActive = (active: boolean) => (active ? 'currentColor' : 'none')

function DashboardIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="2" fill={fillWhenActive(active)} fillOpacity="0.25" />
      <rect x="13" y="3" width="8" height="5" rx="2" fill={fillWhenActive(active)} fillOpacity="0.25" />
      <rect x="13" y="10" width="8" height="11" rx="2" fill={fillWhenActive(active)} fillOpacity="0.25" />
      <rect x="3" y="13" width="8" height="8" rx="2" fill={fillWhenActive(active)} fillOpacity="0.25" />
    </svg>
  )
}
function ServicesIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="13" rx="3" fill={fillWhenActive(active)} fillOpacity="0.25" />
      <path d="M2 10h20M6 15h4" />
    </svg>
  )
}
function ProfileIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" fill={fillWhenActive(active)} fillOpacity="0.25" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

const TABS = [
  { to: '/agent', label: 'Dashboard', end: true, Icon: DashboardIcon },
  { to: '/agent/services', label: 'Services', end: false, Icon: ServicesIcon },
  { to: '/agent/profile', label: 'Profile', end: false, Icon: ProfileIcon },
]

/** Dashboard, Services, Profile. The active one is orange; the bar never leaves the screen. */
export function AgentTabBar() {
  return (
    <nav aria-label="Agent sections" className="sticky bottom-0 mt-auto flex bg-finder-bg pb-[env(safe-area-inset-bottom)] shadow-inset-finder">
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
