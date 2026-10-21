import { useEffect, useId, useState } from 'react'
import { PlaceLookupError, searchPlaces, type Place } from '@/lib/placeName'
import { FinderBox, PinIcon } from './finder'

/**
 * "Change": the customer types a place and picks one the map knows, inside Sierra Leone.
 * Recent places first, so the second time is one tap. Nothing is hard-coded: a place the
 * map does not know cannot be chosen, and the screen says so instead of guessing.
 */
export function PlaceSearch({ recents, onPick }: { recents: Place[]; onPick: (place: Place) => void }) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Place[]>([])
  const [state, setState] = useState<'idle' | 'searching' | 'done' | 'failed'>('idle')
  // Bumped by Try again, so the same text is looked up once more.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setState('idle')
      return
    }
    const ctrl = new AbortController()
    setState('searching')
    const t = window.setTimeout(() => {
      searchPlaces(q, ctrl.signal)
        .then((found) => {
          if (ctrl.signal.aborted) return
          setHits(found)
          setState('done')
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return
          setHits([])
          setState(e instanceof PlaceLookupError ? 'failed' : 'done')
        })
    }, 500)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [query, attempt])

  const typing = query.trim().length >= 2
  const failed = typing && state === 'failed'
  // When the map cannot be reached, the recent places still work: show them under the message.
  const shown = typing && !failed ? hits : recents
  const heading = typing
    ? state === 'searching'
      ? 'Searching the map…'
      : failed
        ? 'Could not reach the map. Check your connection and try again.'
        : hits.length
          ? 'Places'
          : 'The map does not know that place. Try the nearest town or road.'
    : recents.length
      ? 'Recent places'
      : 'Type a neighbourhood, road or town.'

  return (
    <div className="mt-3 flex flex-col gap-2" role="group" aria-labelledby={`${id}-h`}>
      <FinderBox className="flex h-[3.5rem] items-center gap-3 px-4 focus-within:outline focus-within:outline-2 focus-within:outline-finder-link">
        <PinIcon />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search a place"
          placeholder="e.g. Aberdeen, Kissy Road, Bo"
          autoFocus
          enterKeyHint="search"
          className="h-full w-full min-w-0 bg-transparent text-base font-bold text-white outline-none placeholder:font-medium placeholder:text-finder-muted/80"
        />
      </FinderBox>
      <p id={`${id}-h`} className={`text-sm font-medium ${failed ? 'text-white' : 'text-finder-muted'}`} aria-live="polite">
        {heading}
      </p>
      {failed && (
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="flex h-chip items-center rounded-pill border-2 border-white px-5 text-base font-bold text-white">
            Try again
          </button>
          {recents.length > 0 && <span className="text-sm font-medium text-finder-muted">Your recent places still work.</span>}
        </div>
      )}
      {shown.length > 0 && (
        <ul className="flex flex-col">
          {shown.map((p) => (
            <li key={`${p.name}:${p.lat}:${p.lng}`} className="border-b border-finder-line last:border-b-0">
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex min-h-[3.5rem] w-full flex-col justify-center py-3 text-left"
              >
                <span className="block truncate text-base font-bold text-white">{p.name}</span>
                {p.detail && <span className="block truncate text-sm font-semibold text-finder-muted">{p.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
