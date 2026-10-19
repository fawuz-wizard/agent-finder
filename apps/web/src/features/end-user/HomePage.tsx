import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { readRecent, whenLabel } from '@/lib/recent'
import { readPlaces, rememberPlace } from '@/lib/places'
import type { Place } from '@/lib/placeName'
import { useCoarseLocation } from '@/hooks/useCoarseLocation'
import { usePlaceName } from '@/hooks/usePlaceName'
import type { TransactionType } from '@/types/public'
import { TransactionTypeSelector } from './components/TransactionTypeSelector'
import { AmountInput } from './components/AmountInput'
import { ChevronIcon, FinderCta, FinderHeader, PinIcon } from './components/finder'
import { LocationPromptCard, LocationPromptSheet } from './components/LocationPrompt'
import { PlaceSearch } from './components/PlaceSearch'
import { pointFrom } from './searchPoint'
// Loaded only when a visit is waiting to be reported, so the API client stays out of the
// first customer payload.

/**
 * U1 — Home, as the "Agent finder page" frame draws it: where you are, what you need,
 * how much, one button. Recent shops underneath; the two help links at the foot.
 */
export default function HomePage() {
  const navigate = useNavigate()
  // Coming back from "Edit" on the results screen restores what was searched.
  const [params] = useSearchParams()
  const initialTx = params.get('tx')
  const [transaction, setTransaction] = useState<TransactionType | null>(
    initialTx === 'cash_out' || initialTx === 'deposit' ? initialTx : 'cash_out',
  )
  const [amount, setAmount] = useState(() => params.get('amount') ?? '')
  // A place the customer searched by hand. Coming back from Edit, a search marked by=place
  // was one; anything else was the live location, whatever label it carried.
  const [chosen, setChosen] = useState<Place | null>(() => {
    const p = pointFrom(params)
    const name = params.get('area')
    return params.get('by') === 'place' && p && name ? { name, detail: null, ...p } : null
  })
  const [pickPlace, setPickPlace] = useState(false)
  const [places, setPlaces] = useState(readPlaces)
  const [error, setError] = useState<string | null>(null)
  const [recent] = useState(readRecent)
  // Find agent tapped before the phone answered: search the moment it does.
  const [pending, setPending] = useState(false)
  const [askLocation, setAskLocation] = useState(false)
  // The phone's own position, blunted to ~110 m, so "agents around you" means around you.
  // No fixed area anywhere: without a position the customer searches a place on the map.
  const location = useCoarseLocation(true)
  // Live when the phone gave a position and the customer did not choose a place instead.
  const live = location.state === 'ready' && location.point !== null && chosen === null
  const place = usePlaceName(live ? location.point : null)
  const liveLabel = place.name ?? 'Your location'
  // While the phone is still answering there is no place to name yet: say so.
  const waiting = chosen === null && (location.state === 'idle' || location.state === 'locating')
  const shownLabel = chosen ? chosen.name : live ? liveLabel : waiting ? 'Finding your location…' : 'Your location'

  /** Every search carries a point: the phone's, or the chosen place's. */
  function go(target: 'live' | 'place') {
    if (!transaction) return
    const point = target === 'live' ? location.point : chosen
    if (!point) return
    const q = new URLSearchParams({ tx: transaction, area: target === 'live' ? liveLabel : chosen!.name })
    if (amount) q.set('amount', amount)
    q.set('lat', String(point.lat))
    q.set('lng', String(point.lng))
    if (target === 'place') q.set('by', 'place')
    else if (location.rough) q.set('rough', '1')
    navigate(`/search?${q.toString()}`)
  }

  function choosePlace(p: Place) {
    setChosen(p)
    setPlaces(rememberPlace(p))
    setPickPlace(false)
    setAskLocation(false)
  }

  /** The live position first. No position: say how to turn it on, or search a place. */
  function submit() {
    if (!transaction) {
      setError('Choose what you need first.')
      return
    }
    if (amount !== '' && Number(amount) <= 0) {
      setError('Enter an amount above SLE 0.')
      return
    }
    setError(null)
    if (chosen !== null) return go('place')
    if (live) return go('live')
    if (location.state === 'locating') return setPending(true)
    if (location.state === 'idle') {
      setPending(true)
      location.request()
      return
    }
    // Nothing to turn on: a phone with no location at all searches a place on the map.
    if (location.problem?.reason === 'unsupported') return setPickPlace(true)
    setAskLocation(true)
  }

  useEffect(() => {
    if (!pending) return
    if (location.state === 'ready') {
      setPending(false)
      go('live')
    } else if (location.state === 'denied' || location.state === 'unavailable') {
      setPending(false)
      if (location.problem?.reason === 'unsupported') setPickPlace(true)
      else setAskLocation(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, location.state])

  function retryLocation() {
    setPending(true)
    location.turnOn()
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-6 text-white">
      <FinderHeader back={params.get('from') === 'host' ? '/' : undefined} />

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setPickPlace((v) => !v)}
          aria-expanded={pickPlace}
          className="-ml-1 flex h-control min-w-0 items-center gap-3 px-1 text-md font-bold"
        >
          <PinIcon />
          <span className="truncate">{shownLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => setPickPlace((v) => !v)}
          aria-expanded={pickPlace}
          className="h-control shrink-0 text-md font-bold text-finder-link"
        >
          {pickPlace ? 'Close' : 'Change'}
        </button>
      </div>

      {chosen !== null ? (
        <p className="text-sm font-medium text-finder-muted" role="status">
          Searching around {chosen.name}
          {location.state === 'ready' && (
            <>
              {' · '}
              <button type="button" onClick={() => setChosen(null)} className="font-bold text-finder-link">
                Use my location
              </button>
            </>
          )}
        </p>
      ) : location.state === 'ready' || location.state === 'locating' || location.state === 'idle' ? (
        <p className="text-sm font-medium text-finder-muted" role="status">
          {location.state !== 'ready'
            ? 'Allow location when the phone asks'
            : location.rough
              ? 'Searching around your location · approximate, move outside for a better fix'
              : place.state === 'finding'
                ? 'Searching around your location · finding the place name…'
                : 'Searching around your location'}
        </p>
      ) : (
        location.problem && <LocationPromptCard problem={location.problem} onRetry={retryLocation} onSearchPlace={() => setPickPlace(true)} />
      )}

      {pickPlace && <PlaceSearch recents={places} onPick={choosePlace} />}

      <h1 className="mt-8 text-xl font-bold leading-tight">What do you need?</h1>
      <div className="mt-5">
        <TransactionTypeSelector value={transaction} onChange={setTransaction} />
      </div>
      <div className="mt-6">
        <AmountInput value={amount} onChange={setAmount} error={error} />
      </div>
      <FinderCta className="mt-6" onClick={submit} disabled={pending}>
        {pending ? 'Waiting for your location…' : 'Find agent'}
      </FinderCta>
      <LocationPromptSheet
        open={askLocation}
        problem={location.problem}
        onRetry={() => {
          setAskLocation(false)
          retryLocation()
        }}
        onSearchPlace={() => {
          setAskLocation(false)
          setPickPlace(true)
        }}
        onClose={() => setAskLocation(false)}
      />

      {recent.length > 0 && (
        <section className="mt-10 flex flex-col" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="text-xs font-bold uppercase tracking-wider text-finder-muted">
            Recent
          </h2>
          {recent.map((r) => (
            <div key={r.id} className="relative flex min-h-[3.5rem] items-center gap-3 border-b border-finder-line py-3 last:border-b-0">
              <span className="flex min-w-0 flex-1 flex-col">
                <Link to={`/agents/${r.id}?area=${encodeURIComponent(r.area)}`} className="truncate text-base font-bold after:absolute after:inset-0 after:content-['']">
                  {r.name}
                </Link>
                <span className="truncate text-sm font-medium text-finder-muted">
                  {r.area} · {whenLabel(r.at)}
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-finder-link">
                <ChevronIcon />
              </span>
            </div>
          ))}
        </section>
      )}

      <nav className="mt-auto flex w-full items-center justify-between gap-2 pt-10 text-base font-bold text-finder-link">
        <Link to="/how-availability-works" className="flex h-control items-center">
          How availability works
        </Link>
        <Link to="/report-a-visit" className="flex h-control items-center text-right">
          Report a visit
        </Link>
      </nav>

    </div>
  )
}
