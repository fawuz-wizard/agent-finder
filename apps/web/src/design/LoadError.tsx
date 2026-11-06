import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, WifiOff } from 'lucide-react'
import { causeOf, type Cause } from './loadCause'

const HELP: Record<Cause, string> = {
  offline: 'Check your data or Wi-Fi. Nothing is lost; this is only the connection.',
  slow: 'Your signal looks weak. Try again, or move to a spot with better signal.',
  server: 'Something went wrong on our side. Try again in a moment.',
}

const ICON = { offline: WifiOff, slow: Clock, server: AlertTriangle }

/**
 * A load that failed, said plainly: never a blank list, "Nothing new" or "Loading…" forever.
 * `what` names the thing ("your agents"); the line under it says whether it was the phone's
 * connection, a slow signal or the server.
 */
export function LoadError({
  what,
  error,
  onRetry,
  note,
  className = '',
}: {
  what: string
  error?: string | null
  onRetry?: () => void
  /** An extra sentence for this screen, e.g. why a form is hidden. */
  note?: string
  className?: string
}) {
  const cause = causeOf(error)
  const Icon = ICON[cause]
  return (
    <div role="alert" className={`flex items-start gap-3.5 rounded-panel bg-finder-card p-4 shadow-inset-finder ${className}`}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-finder-tile">
        <Icon aria-hidden="true" className="h-5 w-5 text-finder-link" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-extrabold">Couldn&apos;t load {what}</p>
        <p className="mt-1 text-sm leading-snug text-finder-muted">
          {note ? `${note} ` : ''}
          {HELP[cause]}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 h-11 rounded-[12px] bg-finder-accent px-5 text-[15px] font-bold text-finder-on-orange transition-transform active:scale-[0.97]"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

/** A short line for an action that failed (a button press), under the button. */
export function ActionError({ error, className = '' }: { error: string | null; className?: string }) {
  if (!error) return null
  return (
    <p role="alert" className={`text-sm font-semibold text-design-red ${className}`}>
      {causeOf(error) === 'server' ? error : `Couldn't send. ${HELP[causeOf(error)]}`}
    </p>
  )
}

/**
 * Shown while something is still loading after `afterMs`: the wait is not stuck, the signal is
 * slow, and there is a way to start again.
 */
export function SlowHint({ afterMs = 10_000, onRetry, className = '' }: { afterMs?: number; onRetry?: () => void; className?: string }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), afterMs)
    return () => clearTimeout(t)
  }, [afterMs])
  if (!show) return null
  return (
    <div role="status" className={`flex items-start gap-3.5 rounded-panel bg-finder-card p-4 shadow-inset-finder ${className}`}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-finder-tile">
        <Clock aria-hidden="true" className="h-5 w-5 text-finder-link" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-extrabold">Taking longer than usual</p>
        <p className="mt-1 text-sm leading-snug text-finder-muted">Your signal looks slow. We&apos;ll keep trying, or you can try again now.</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 h-11 rounded-[12px] bg-finder-accent px-5 text-[15px] font-bold text-finder-on-orange transition-transform active:scale-[0.97]"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
