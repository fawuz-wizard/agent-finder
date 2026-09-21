import { NavLink } from 'react-router-dom'

type IconProps = { active: boolean }

/* Five outline icons from one family: 2px stroke, round joins, a light fill when active. */
const fillWhenActive = (active: boolean) => (active ? 'currentColor' : 'none')

function HomeIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" fill={fillWhenActive(active)} fillOpacity="0.15" />
    </svg>
  )
}
function AvailabilityIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="10" rx="5" />
      <circle cx="16" cy="12" r="3" fill="currentColor" />
    </svg>
  )
}
function FloatIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4h6l-1.5 3h-3z" fill={fillWhenActive(active)} fillOpacity="0.15" />
      <path d="M8 7c-3.5 2.5-5 6-4 10 .6 2.3 2.7 3 8 3s7.4-.7 8-3c1-4-.5-7.5-4-10z" fill={fillWhenActive(active)} fillOpacity="0.15" />
      <path d="M12 11v6M10 13h3a1.5 1.5 0 0 1 0 3h-3" />
    </svg>
  )
}
function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
    </svg>
  )
}
function ProfileIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" fill={fillWhenActive(active)} fillOpacity="0.15" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

const TABS = [
  { to: '/agent', label: 'Home', end: true, Icon: HomeIcon },
  { to: '/agent/availability', label: 'Availability', end: false, Icon: AvailabilityIcon },
  { to: '/agent/float', label: 'Float', end: false, Icon: FloatIcon },
  { to: '/agent/dashboard', label: 'Dashboard', end: false, Icon: DashboardIcon },
  { to: '/agent/profile', label: 'Profile', end: false, Icon: ProfileIcon },
]

/** The agent's five modules. Everything common is two taps from Home. */
export function AgentTabBar() {
  return (
    <nav aria-label="Agent sections" className="sticky bottom-0 mt-auto flex border-t border-line bg-paper">
      {TABS.map(({ to, label, end, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex h-[62px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
              isActive ? 'text-brand-text' : 'text-muted'
            }`
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
