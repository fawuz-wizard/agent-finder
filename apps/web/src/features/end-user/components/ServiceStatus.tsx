import { StatusDot, type StatusKind } from '@/design'
import type { PublicOutcome } from '@/types/public'

/** Maps the server's outcome onto the shared status indicator. Text always accompanies it. */
const DOT: Record<PublicOutcome, StatusKind> = {
  likely: 'fresh',
  limited: 'limited',
  expired: 'expired',
  closed: 'closed',
  hidden: 'hidden',
  not_set: 'notset',
}

const TONE: Record<PublicOutcome, string> = {
  likely: 'bg-success-tint text-success',
  limited: 'bg-warning-tint text-warning',
  expired: 'bg-warning-tint text-warning',
  closed: 'bg-danger-tint text-danger',
  hidden: 'bg-canvas text-muted',
  not_set: 'bg-canvas text-muted',
}

export function ServiceStatus({
  outcome,
  text,
  size = 'md',
}: {
  outcome: PublicOutcome
  text: string
  size?: 'md' | 'lg'
}) {
  return (
    <p
      className={`inline-flex items-center gap-2 rounded-pill px-3 ${size === 'lg' ? 'py-2 text-lg' : 'py-1.5 text-base'} font-semibold ${TONE[outcome]}`}
    >
      <StatusDot kind={DOT[outcome]} size={size === 'lg' ? 16 : 14} />
      {text}
    </p>
  )
}
