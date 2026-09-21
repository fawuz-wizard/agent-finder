import type { FreshnessState } from '@/types/public'

/**
 * Renders the server's freshness state. The browser never computes age — it only draws
 * the four-step clock and prints the sentence the API sent.
 */
const FILL: Record<FreshnessState, number> = { fresh: 1, aging: 0.66, may_have_changed: 0.33, expired: 0 }
const COLOUR: Record<FreshnessState, string> = {
  fresh: 'text-muted',
  aging: 'text-warning',
  may_have_changed: 'text-warning',
  expired: 'text-danger',
}

export function FreshnessBadge({ state, text }: { state: FreshnessState; text: string }) {
  const fill = FILL[state]
  return (
    <p className={`flex items-center gap-2 text-sm ${COLOUR[state]}`}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
        <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {fill >= 1 && <circle cx="7" cy="7" r="6" fill="currentColor" />}
        {fill > 0 && fill < 1 && (
          <path
            d={`M7 7 L7 1 A6 6 0 ${fill > 0.5 ? 1 : 0} 1 ${7 + 6 * Math.sin(2 * Math.PI * fill)} ${7 - 6 * Math.cos(2 * Math.PI * fill)} Z`}
            fill="currentColor"
          />
        )}
      </svg>
      <span>{text}</span>
    </p>
  )
}
