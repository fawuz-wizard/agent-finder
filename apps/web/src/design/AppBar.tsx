import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from './cn'

export interface AppBarProps {
  title: string
  subtitle?: ReactNode
  /** A route to go back to; renders the chevron aligned with the title. */
  back?: string
  onBack?: () => void
  /** One action on the right: a link or a button, already styled. */
  action?: ReactNode
  className?: string
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

/**
 * The screen header of the operator app: title on the left, one action on the right, the
 * back control aligned with the title's first line. Boosted's app bar: white, black type,
 * a 2px rule underneath — never a shadow.
 */
export function AppBar({ title, subtitle, back, onBack, action, className }: AppBarProps) {
  const backClass = '-ml-2 flex h-control w-control shrink-0 items-center justify-center text-ink'
  return (
    <header className={cn('flex items-start gap-1 border-b-2 border-line bg-paper px-4 py-3', className)}>
      {back && (
        <Link to={back} aria-label="Back" className={backClass}>
          <Chevron />
        </Link>
      )}
      {!back && onBack && (
        <button type="button" onClick={onBack} aria-label="Back" className={backClass}>
          <Chevron />
        </button>
      )}
      <div className="min-w-0 flex-1 self-center">
        <h1 className="text-xl font-bold leading-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="-mr-2 flex shrink-0 self-center">{action}</div>}
    </header>
  )
}

/** The text-only action that sits in an AppBar: a link or a button that reads as one. */
export function BarAction({ to, onClick, children, disabled }: { to?: string; onClick?: () => void; children: ReactNode; disabled?: boolean }) {
  const cls = 'flex h-control items-center px-2 text-base font-bold text-brand-text disabled:opacity-45'
  if (to) return <Link to={to} className={cls}>{children}</Link>
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  )
}
