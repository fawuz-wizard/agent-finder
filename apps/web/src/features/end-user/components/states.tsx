import type { ReactNode } from 'react'
import { FinderPill } from './finder'

/** Three rows of grey bars in the shape of a result, on the dark surface. No shimmer (cheap CPUs). */
export function LoadingResults({ label = 'Finding available agents…' }: { label?: string }) {
  return (
    <div className="flex flex-col" aria-busy="true" aria-live="polite">
      <p className="text-sm font-medium text-finder-muted">{label}</p>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="flex flex-col gap-4 border-b border-finder-line py-6 last:border-b-0">
          <div className="flex justify-between">
            <span className="h-5 w-[55%] rounded-pill bg-finder-line" />
            <span className="h-4 w-[15%] rounded-pill bg-finder-line" />
          </div>
          <span className="h-3.5 w-[40%] rounded-pill bg-finder-line" />
          <span className="h-1.5 w-full rounded-pill bg-finder-line" />
        </div>
      ))}
    </div>
  )
}

/** A heading, a sentence and the way out. No box: the words carry it. */
export function EmptyState({ title, body, actions }: { title: string; body: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 py-6">
      <h2 className="text-xl font-bold leading-tight">{title}</h2>
      <p className="text-base font-medium text-finder-muted">{body}</p>
      {actions}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4 py-6" role="alert">
      <h2 className="text-xl font-bold leading-tight">Something went wrong on our side</h2>
      <p className="text-base font-medium text-finder-muted">{message}</p>
      {onRetry && <FinderPill onClick={onRetry}>Try again</FinderPill>}
    </div>
  )
}

export function OfflineBanner({ since, onRetry }: { since?: string | null; onRetry?: () => void }) {
  return (
    <p
      role="status"
      className="flex min-h-chip items-center gap-2 rounded-field bg-finder-line px-3 py-1 text-sm font-medium text-finder-muted"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
        <path d="M2 2l12 12M8 12h.01M4.5 8.5a5 5 0 016 0M2 6a9 9 0 0112 0" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
      <span className="min-w-0 flex-1">{since ? `You're offline — showing results from ${since}` : "You're offline"}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="flex h-chip shrink-0 items-center px-2 text-base font-bold text-finder-link">
          Retry
        </button>
      )}
    </p>
  )
}
