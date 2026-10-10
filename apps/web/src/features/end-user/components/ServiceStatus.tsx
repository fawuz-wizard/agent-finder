import { StatusDot, type StatusKind } from '@/design'
import type { PublicOutcome } from '@/types/public'
import { TickIcon } from './finder'

/**
 * The server's outcome as the file's status pill: green with a tick when the agent can
 * likely handle the request, amber for every other answer. Shape and words carry the
 * meaning; the colour reinforces it.
 */
const DOT: Record<PublicOutcome, StatusKind> = {
  likely: 'fresh',
  unknown: 'notset',
  limited: 'limited',
  expired: 'expired',
  closed: 'closed',
  hidden: 'hidden',
  not_set: 'notset',
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
  const likely = outcome === 'likely'
  return (
    <p
      className={`inline-flex max-w-full items-center gap-2 rounded-tag px-3 font-semibold ${
        size === 'lg' ? 'min-h-[40px] py-2 text-base' : 'min-h-[33px] py-1 text-sm'
      } ${likely ? 'bg-finder-likely-tint text-finder-likely' : 'bg-finder-limited-tint text-finder-limited'}`}
    >
      {likely ? <TickIcon size={size === 'lg' ? 18 : 16} /> : <StatusDot kind={DOT[outcome]} size={size === 'lg' ? 16 : 14} />}
      <span className="min-w-0">{text}</span>
    </p>
  )
}
