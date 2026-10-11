import type { LocationProblem } from '@/lib/location'
import { FinderBox, FinderCta, FinderSheet } from './finder'

/**
 * The platform searches around the phone's live position. When the phone will not give
 * one, the customer is told why and how to turn it on, with a place search as the way out.
 * Inline on the home screen; as a sheet when they tap Find agent regardless.
 */
export function LocationPromptCard({
  problem,
  onRetry,
  onSearchPlace,
}: {
  problem: LocationProblem
  onRetry: () => void
  onSearchPlace: () => void
}) {
  return (
    <FinderBox className="mt-3 flex flex-col gap-3 px-4 py-4" role="status">
      <p className="text-base font-bold">{problem.title}</p>
      <p className="text-sm font-medium text-finder-muted">{problem.advice}</p>
      <div className="flex flex-wrap gap-3">
        {problem.reason !== 'unsupported' && (
          <button
            type="button"
            onClick={onRetry}
            className="h-chip rounded-pill bg-finder-link px-5 text-base font-bold text-finder-on-orange"
          >
            Turn on location
          </button>
        )}
        <button type="button" onClick={onSearchPlace} className="h-chip rounded-pill border-2 border-white px-5 text-base font-bold text-white">
          Search a place instead
        </button>
      </div>
    </FinderBox>
  )
}

export function LocationPromptSheet({
  open,
  problem,
  onRetry,
  onSearchPlace,
  onClose,
}: {
  open: boolean
  problem: LocationProblem | null
  onRetry: () => void
  onSearchPlace: () => void
  onClose: () => void
}) {
  const p = problem ?? { reason: 'unsupported' as const, title: 'This phone cannot share its location.', advice: 'Search a place instead.' }
  return (
    <FinderSheet open={open} onClose={onClose} title="Turn on your location">
      <p className="text-base font-medium">{p.title}</p>
      <p className="text-sm font-medium text-finder-muted">
        {p.reason === 'unsupported' ? 'Type the place you are in, or one you are going to.' : `${p.advice} Agents are then listed by how far they are from you.`}
      </p>
      {p.reason !== 'unsupported' && <FinderCta onClick={onRetry}>Turn on location</FinderCta>}
      <button type="button" onClick={onSearchPlace} className="h-control text-base font-bold text-finder-link">
        Search a place instead
      </button>
    </FinderSheet>
  )
}
