import { NavLink } from 'react-router-dom'

const cls = 'h-[22px] w-[22px]'
const Dashboard = () => (
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" />
    <rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" />
  </svg>
)
const Agents = () => (
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <circle cx="17" cy="9" r="2.5" /><path d="M16 14.5c3 0 5.5 2 5.5 5" />
  </svg>
)
const Float = () => (
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4h6l-1.5 3h-3z" /><path d="M8 7c-3.5 2.5-5 6-4 10 .6 2.3 2.7 3 8 3s7.4-.7 8-3c1-4-.5-7.5-4-10z" /><path d="M12 11v6M10 13h3a1.5 1.5 0 0 1 0 3h-3" />
  </svg>
)
const Attention = () => (
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 2.5 20h19z" /><path d="M12 9.5v4.5" /><circle cx="12" cy="17" r="0.6" fill="currentColor" />
  </svg>
)
const Profile = () => (
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
)

const TABS = [
  { to: '/dealer', label: 'Dashboard', end: true, Icon: Dashboard },
  { to: '/dealer/agents', label: 'Agents', end: false, Icon: Agents },
  { to: '/dealer/float', label: 'Float', end: false, Icon: Float },
  { to: '/dealer/attention', label: 'Attention', end: false, Icon: Attention },
  { to: '/dealer/profile', label: 'Profile', end: false, Icon: Profile },
]

export function DealerTabBar() {
  return (
    <nav aria-label="Dealer sections" className="sticky bottom-0 mt-auto flex border-t border-line bg-paper">
      {TABS.map(({ to, label, end, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex h-[62px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive ? 'text-brand-text' : 'text-muted'}`
          }
        >
          <Icon />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
