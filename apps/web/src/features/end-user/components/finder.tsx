import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/design'

/**
 * The customer module's chrome, as drawn in the Om Agent Finder file: the host app's
 * strip, the "‹ Agent Finder" row, the icons and the one big button.
 */

/** The Orange Money app's own top strip. Decorative here: the module is embedded under it. */
export function HostStrip() {
  return (
    <div aria-hidden="true" className="flex h-11 items-center gap-4 px-[1.1rem] pt-2 text-base font-semibold text-white">
      <svg width="24" height="18" viewBox="0 0 24 18" className="shrink-0">
        <path d="M1 2h22M1 9h22M1 16h22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="flex items-center gap-3">
        072416283
        <CaretIcon />
      </span>
    </div>
  )
}

export function FinderHeader({ title = 'Agent Finder', back, action }: { title?: string; back?: string | (() => void) | undefined; action?: ReactNode }) {
  const arrow = (
    <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true">
      <path d="M12 1L3 9l9 8" fill="currentColor" />
    </svg>
  )
  const backClass = '-ml-2 flex h-control w-control shrink-0 items-center justify-center text-white'
  return (
    <header className="flex h-control items-center gap-2">
      {typeof back === 'string' ? (
        <Link to={back} aria-label="Back" className={backClass}>
          {arrow}
        </Link>
      ) : back ? (
        <button type="button" onClick={back} aria-label="Back" className={backClass}>
          {arrow}
        </button>
      ) : null}
      <p className="truncate text-md font-bold text-white">{title}</p>
      {action && <span className="ml-auto">{action}</span>}
    </header>
  )
}

/** 60 px, orange, white text. The only filled button on a customer screen. */
export function FinderCta({ className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-[3.5rem] w-full items-center justify-center rounded-action bg-finder-cta text-md font-bold text-finder-on-orange',
        'transition-[filter] hover:brightness-95 active:brightness-90 disabled:opacity-45',
        className,
      )}
      {...rest}
    />
  )
}

/** A row with the inset glow the file uses instead of borders. */
export function FinderBox({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-field bg-finder-bg shadow-inset-finder', className)} {...rest} />
}

/** Icon sizes are given in px for a 16 px root and rendered in rem, so they follow the scale. */
const rem = (px: number) => `${px / 16}rem`

export function PinIcon({ size = 20 }: { size?: number }) {
  return (
    <svg style={{ width: rem(size), height: rem(size) }} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" fill="currentColor" />
      <circle cx="12" cy="10" r="2.6" fill="var(--color-finder-bg)" />
    </svg>
  )
}

export function CaretIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 4l5 6 5-6z" fill="currentColor" />
    </svg>
  )
}

export function TickIcon({ size = 16 }: { size?: number }) {
  return (
    <svg style={{ width: rem(size), height: rem(size) }} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ChevronIcon({ size = 20 }: { size?: number }) {
  return (
    <svg style={{ width: rem(size), height: rem(size) }} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <path d="M7.5 4.5L13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Bottom sheet on the dark surface: one question, two buttons. Escape or the scrim closes. */
export function FinderSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-[480px] flex-col gap-4 rounded-t-panel bg-finder-bg px-5 pb-8 pt-6 text-white shadow-inset-finder"
      >
        <h2 className="text-md font-bold">{title}</h2>
        {children}
      </div>
    </div>
  )
}
