import type { LocationProblem } from '@/lib/location'
import { FinderBox, FinderCta, FinderSheet } from './finder'

/**
 * The platform searches around the phone's live position. When the phone will not give
 * one, the customer is told why and how to turn it on, with the named area as the way
 * out. Inline on the home screen; as a sheet when they tap Find agent regardless.
 */
export function LocationPromptCard({
  problem,
  area,
  onRetry,
}: {
  problem: LocationProblem
  area: string
  onRetry: () => void
}) {
  return (
    <FinderBox className="mt-3 flex flex-col gap-3 px-4 py-4" role="status">
      <p className="text-base font-bold">{problem.title}</p>
      <p className="text-sm font-medium text-finder-muted">
        {problem.reason === 'unsupported'
          ? `Location off — searching around ${area}.`
          : `${problem.advice} Until then we search around ${area}.`}
      </p>
      {problem.reason !== 'unsupported' && (
        <button
          type="button"
          onClick={onRetry}
          className="h-chip self-start rounded-pill bg-finder-link px-5 text-base font-bold text-finder-on-orange"
        >
          Turn on location
        </button>
      )}
    </FinderBox>
  )
}

export function LocationPromptSheet({
  open,
  problem,
  area,
  onRetry,
  onUseArea,
  onClose,
}: {
  open: boolean
  problem: LocationProblem | null
  area: string
  onRetry: () => void
  onUseArea: () => void
  onClose: () => void
}) {
  const p = problem ?? { reason: 'unsupported' as const, title: 'This phone cannot share its location.', advice: 'Choose an area instead.' }
  return (
    <FinderSheet open={open} onClose={onClose} title="Turn on your location">
      <p className="text-base font-medium">{p.title}</p>
      <p className="text-sm font-medium text-finder-muted">
        {p.reason === 'unsupported'
          ? `We can search around ${area} instead.`
          : `${p.advice} Agents are then listed by how far they are from you.`}
      </p>
      {p.reason !== 'unsupported' && <FinderCta onClick={onRetry}>Turn on location</FinderCta>}
      <button type="button" onClick={onUseArea} className="h-control text-base font-bold text-finder-link">
        Search around {area} instead
      </button>
    </FinderSheet>
  )
}
