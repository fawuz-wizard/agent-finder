import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AREAS } from '@/lib/reference'
import { readRecent, whenLabel } from '@/lib/recent'
import { useCoarseLocation } from '@/hooks/useCoarseLocation'
import type { TransactionType } from '@/types/public'
import { TransactionTypeSelector } from './components/TransactionTypeSelector'
import { AmountInput } from './components/AmountInput'
import { FinderBox, FinderCta, FinderHeader, PinIcon } from './components/finder'
import { LocationPromptCard, LocationPromptSheet } from './components/LocationPrompt'
// Loaded only when a visit is waiting to be reported, so the API client stays out of the
// first customer payload.
const OutcomePrompt = lazy(() => import('./OutcomePrompt').then((m) => ({ default: m.OutcomePrompt })))

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
  const [area, setArea] = useState<string>(() => params.get('area') ?? AREAS[0])
  const [pickArea, setPickArea] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recent] = useState(readRecent)
  // Find agent tapped before the phone answered: search the moment it does.
  const [pending, setPending] = useState(false)
  const [askLocation, setAskLocation] = useState(false)
  // The phone's own position, blunted to ~110 m, so "agents around you" means around you. The
  // area stays as the label and as the fallback when the position is denied or unavailable.
  const location = useCoarseLocation(true)

  function go(withPoint: boolean) {
    if (!transaction) return
    const q = new URLSearchParams({ tx: transaction, area })
    if (amount) q.set('amount', amount)
    if (withPoint && location.point) {
      q.set('lat', String(location.point.lat))
      q.set('lng', String(location.point.lng))
    }
    navigate(`/search?${q.toString()}`)
  }

  /** The live position first. No position: say how to turn it on before offering the area. */
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
    if (location.state === 'ready') return go(true)
    if (location.state === 'locating') return setPending(true)
    if (location.state === 'idle') {
      setPending(true)
      location.request()
      return
    }
    // Nothing to turn on: a phone with no location at all searches around the area.
    if (location.problem?.reason === 'unsupported') return go(false)
    setAskLocation(true)
  }

  useEffect(() => {
    if (!pending) return
    if (location.state === 'ready') {
      setPending(false)
      go(true)
    } else if (location.state === 'denied' || location.state === 'unavailable') {
      setPending(false)
      if (location.problem?.reason === 'unsupported') go(false)
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
          onClick={() => setPickArea((v) => !v)}
          aria-expanded={pickArea}
          className="-ml-1 flex h-control min-w-0 items-center gap-3 px-1 text-md font-bold"
        >
          <PinIcon />
          <span className="truncate">{area}</span>
        </button>
        <button
          type="button"
          onClick={() => setPickArea((v) => !v)}
          aria-expanded={pickArea}
          className="h-control shrink-0 text-md font-bold text-finder-link"
        >
          Change
        </button>
      </div>

      {location.state === 'ready' || location.state === 'locating' || location.state === 'idle' ? (
        <p className="text-sm font-medium text-finder-muted" role="status">
          {location.state === 'ready' ? 'Searching around your location' : 'Finding your location…'}
        </p>
      ) : (
        location.problem && <LocationPromptCard problem={location.problem} area={area} onRetry={retryLocation} />
      )}

      {pickArea && (
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Choose your area">
          {AREAS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={a === area}
              onClick={() => {
                setArea(a)
                setPickArea(false)
              }}
              className={`h-chip rounded-pill px-4 text-base font-bold ${a === area ? 'bg-finder-link text-finder-on-orange' : 'border-2 border-white text-white'}`}
            >
              {a}
            </button>
          ))}
        </div>
      )}

      <h1 className="mt-5 text-xl font-bold leading-tight">What do you need?</h1>
      <div className="mt-5">
        <TransactionTypeSelector value={transaction} onChange={setTransaction} />
      </div>
      <div className="mt-4">
        <AmountInput value={amount} onChange={setAmount} error={error} />
      </div>
      <FinderCta className="mt-5" onClick={submit} disabled={pending}>
        {pending ? 'Finding your location…' : 'Find agent'}
      </FinderCta>
      <LocationPromptSheet
        open={askLocation}
        problem={location.problem}
        area={area}
        onRetry={() => {
          setAskLocation(false)
          retryLocation()
        }}
        onUseArea={() => {
          setAskLocation(false)
          go(false)
        }}
        onClose={() => setAskLocation(false)}
      />

      {recent.length > 0 && (
        <section className="mt-6 flex flex-col gap-2" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="text-base font-bold uppercase text-finder-muted">
            Recent
          </h2>
          {recent.map((r) => (
            <FinderBox key={r.id} className="flex min-h-[60px] items-center justify-between gap-3 px-5 py-2 text-base font-bold">
              <Link to={`/agents/${r.id}?area=${encodeURIComponent(r.area)}`} className="min-w-[45%] flex-1 truncate">
                {r.name}
              </Link>
              <span className="min-w-0 truncate text-finder-muted">
                {r.area} · {whenLabel(r.at)}
              </span>
            </FinderBox>
          ))}
        </section>
      )}

      <nav className="mt-auto flex w-full items-center justify-between gap-2 pt-8 text-base font-bold text-finder-link">
        <Link to="/how-availability-works" className="flex h-control items-center">
          How availability works
        </Link>
        <Link to="/report-a-visit" className="flex h-control items-center text-right">
          Report a visit
        </Link>
      </nav>

      <Suspense fallback={null}>
        <OutcomePrompt />
      </Suspense>
    </div>
  )
}
