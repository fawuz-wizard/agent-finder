import type { ReactNode } from 'react'
import { Button, ResultCardSkeleton } from '@/design'
import { FinderBox } from './finder'

export function LoadingResults({ label = 'Finding available agents…' }: { label?: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <p className="text-sm font-medium text-finder-muted">{label}</p>
      <ResultCardSkeleton />
      <ResultCardSkeleton />
      <ResultCardSkeleton />
    </div>
  )
}

export function EmptyState({
  title,
  body,
  actions,
}: {
  title: string
  body: string
  actions?: ReactNode
}) {
  return (
    <FinderBox className="px-5 py-4">
      <div className="flex flex-col items-start gap-3 py-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-base text-finder-muted">{body}</p>
        {actions}
      </div>
    </FinderBox>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <FinderBox className="px-5 py-4">
      <div className="flex flex-col items-start gap-3 py-2" role="alert">
        <h2 className="text-lg font-bold">Something went wrong</h2>
        <p className="text-base text-finder-muted">{message}</p>
        {onRetry && (
          <Button variant="secondary" size="control" block={false} onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </FinderBox>
  )
}

export function OfflineBanner({ since }: { since?: string | null }) {
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-field bg-finder-line px-3 py-2 text-sm font-medium text-finder-muted"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
        <path d="M2 2l12 12M8 12h.01M4.5 8.5a5 5 0 016 0M2 6a9 9 0 0112 0" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
      {since ? `You're offline — showing results from ${since}` : "You're offline"}
    </p>
  )
}
