import type { InputHTMLAttributes, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { LogoMark } from '@/design'
import { useSession } from '@/features/auth/session'
import { FinderBox, PinIcon } from '@/features/end-user/components/finder'

/**
 * The Agent App's chrome, built from the customer module's pieces so both apps read as one
 * file: the strip, the "‹ Title" row, the pin-and-name row, 16 px section labels, 60 px
 * rows, the orange-edged card, the 60 px field. Three tabs at the foot.
 */

/** Who is signed in and which app this is: the customer module's host strip, for agents. */
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

/** The pin row from the finder's first screen: where, in 20 px bold, with one orange action. */
export function PlaceRow({ name, sub, action }: { name: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 text-white">
          <PinIcon />
        </span>
        <div className="min-w-0">
          <p className="truncate text-md font-bold leading-tight text-white">{name}</p>
          {sub && <p className="mt-0.5 text-sm font-semibold text-finder-muted">{sub}</p>}
        </div>
      </div>
      {action && <span className="shrink-0 text-md font-bold text-finder-link">{action}</span>}
    </div>
  )
}

/** "RECENT": the finder's section label. */
export function SectionLabel({ id, children, className = '' }: { id?: string | undefined; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={`text-base font-bold uppercase text-finder-muted ${className}`}>
      {children}
    </h2>
  )
}

/** A 60 px row with the inset glow: a label on the left, a value or an action on the right. */
export function Row({ label, value, action, className = '' }: { label: ReactNode; value?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <FinderBox className={`flex min-h-[60px] items-center justify-between gap-3 px-5 py-2 ${className}`}>
      <span className="min-w-0 text-base font-bold text-white">{label}</span>
      {action ?? <span className="min-w-0 text-right text-base font-bold text-finder-muted">{value}</span>}
    </FinderBox>
  )
}

/** The result card's frame: the orange edge on the left, the glow inside. */
export function EdgeCard({ children, className = '', ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <article className={`relative rounded-panel bg-finder-link ${className}`} {...rest}>
      <div className="ml-[9px] flex flex-col gap-2 rounded-panel bg-finder-bg px-4 py-4 text-white shadow-inset-finder">{children}</div>
    </article>
  )
}

/** A plain panel with the glow, for a chart or a form. */
export function Panel({ className = '', children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <FinderBox className={`flex flex-col gap-3 px-4 py-4 ${className}`} {...rest}>
      {children}
    </FinderBox>
  )
}

/** The finder's amount field: 60 px, "SLE" in front, the figure at 36 px. */
export function MoneyField({ id, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FinderBox className={`flex h-[60px] items-center gap-4 px-4 focus-within:outline focus-within:outline-2 focus-within:outline-finder-link ${className}`}>
      <span className="text-md font-bold text-finder-muted">SLE</span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="0"
        className="h-full w-full min-w-0 bg-transparent text-3xl font-bold tabular-nums text-white outline-none placeholder:text-finder-muted/50"
        {...rest}
      />
    </FinderBox>
  )
}

/** A 60 px text field in the same frame. */
export function TextField({ id, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FinderBox className={`flex h-[60px] items-center px-4 focus-within:outline focus-within:outline-2 focus-within:outline-finder-link ${className}`}>
      <input id={id} autoComplete="off" className="h-full w-full min-w-0 bg-transparent text-base font-medium text-white outline-none placeholder:text-finder-muted/60" {...rest} />
    </FinderBox>
  )
}

/** The 15 px label above a field. */
export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[15px] font-medium text-white">
      {children}
    </label>
  )
}

/** The finder's two states of a pill. */
export const PILL_ON = 'bg-finder-link text-finder-on-orange'
export const PILL_OFF = 'border-2 border-white bg-transparent text-white'

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
