import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, Skeleton } from '@/design'
import { customerApi } from '@/services/customerApi'
import { ApiRequestError } from '@/lib/api'
import { usePendingVisit } from '@/hooks/usePendingVisit'
import type { AgentDetail, TransactionType } from '@/types/public'
import { RouteMap } from '@/features/map'
import { ServiceStatus } from './components/ServiceStatus'
import { FreshnessBadge } from './components/FreshnessBadge'
import { DistanceLabel } from './components/DistanceLabel'
import { ErrorState } from './components/states'
import { pointFrom } from './searchPoint'

function ratingToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Agent detail — the outcome restated against the customer's own request, then directions. */
export default function AgentDetailPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { visit, remember } = usePendingVisit()
  // Shop details always appear before the map. Looking at either is not a visit:
  // only "I'm going there" starts the outcome question.
  const [showMap, setShowMap] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const [rating, setRating] = useState<number | null>(null)
  const [ratingState, setRatingState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [ratingError, setRatingError] = useState<string | null>(null)

  const tx = (params.get('tx') as TransactionType | null) ?? null
  const amount = params.get('amount') ? Number(params.get('amount')) : null
  const area = params.get('area') ?? 'Lumley'
  const point = pointFrom(params)
  const pointKey = point ? `${point.lat},${point.lng}` : ''

  useEffect(() => {
    if (showMap) mapRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [showMap])

  async function submitRating() {
    if (!rating || ratingState === 'sending') return
    setRatingState('sending')
    setRatingError(null)
    try {
      await customerApi.report({
        agent_id: id,
        transaction: null,
        amount_sle: null,
        answer: 'did_not_go',
        rating,
        comment: null,
        source: 'direct',
        client_token: ratingToken(),
      })
      setRatingState('sent')
    } catch (e) {
      setRatingState('idle')
      setRatingError(e instanceof ApiRequestError ? e.error.message : e instanceof Error ? e.message : 'We could not save your rating. Please try again.')
    }
  }

  useEffect(() => {
    const ctrl = new AbortController()
    setError(null)
    customerApi
      .agent(id, { transaction: tx, amount_sle: amount, area, ...(point ?? {}) }, ctrl.signal)
      .then(setAgent)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(
          e instanceof ApiRequestError
            ? e.error.message
            : 'We could not find that agent. It may have been removed from the network.',
        )
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tx, amount, area, pointKey])

  if (error) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <ErrorState message={error} />
        <Link to="/find">
          <Button size="control">Search again</Button>
        </Link>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col bg-app-bg text-white">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-3 bg-app-bg px-4 py-3">
        <button type="button" onClick={() => history.back()} aria-label="Back" className="-ml-2 flex h-control w-control items-center justify-center rounded-card text-2xl leading-none text-muted">
          ‹
        </button>
        <p className="truncate text-base font-bold text-white">Agent Finder</p>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 pb-32">
        <div className="overflow-hidden rounded-xl bg-app-surface">
          <div className="flex h-36 items-end bg-gradient-to-br from-app-surface via-app-surface to-app-surface p-4 text-sm text-white/80">Shop location · {agent.area}</div>
          <div className="p-4">
          <p className="flex items-center gap-2 text-sm text-white/65">◷ &nbsp;{agent.open_now ? 'Open now' : 'Hours vary'}</p>
          <h1 className="mt-2 text-xl font-bold leading-tight">{agent.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-white/60">
            <DistanceLabel metres={agent.distance_m} />
            {agent.verified_label && (
              <span className="rounded-pill bg-canvas px-2 py-0.5 text-xs font-semibold text-muted">{agent.verified_label}</span>
            )}
          </p>
          {agent.rating_count != null && agent.rating_count >= 3 && agent.rating_average != null && (
            <p className="mt-1 text-sm text-app-star">★ &nbsp;{agent.rating_average} ({agent.rating_count} ratings)</p>
          )}
          <p className="mt-1 text-sm text-white/60">⌖ &nbsp;{agent.area}</p>
          <h2 className="mt-4 font-bold">Services</h2>
          <p className="mt-2 text-sm text-white/70">Orange Money · {agent.request_label.replace(/^For /, '').split(' · ')[0]}</p>
          <h2 className="mt-4 font-bold">Opening Hours</h2>
          <p className="mt-2 text-sm text-white/70">{agent.hours_text}</p>
          </div>
        </div>

        <Card className="border-white/10 bg-app-card text-white">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">{agent.request_label}</p>
            <ServiceStatus outcome={agent.outcome} text={agent.outcome_text} size="lg" />
            <FreshnessBadge state={agent.freshness} text={agent.freshness_text} />
            <p className="text-sm text-muted">{agent.hours_text}</p>
          </div>
        </Card>

        <div ref={mapRef} id="agent-directions-map" className={showMap ? 'scroll-mt-4' : 'hidden'}>
          {showMap && (
            <RouteMap
              agent={{ name: agent.name, lat: agent.lat, lng: agent.lng }}
              origin={agent.origin}
              distance_m={agent.distance_m}
              originIsSimulated={!point}
              directions_url={agent.directions_url}
              going={visit?.agentId === agent.id}
              onGoing={() => remember({ agentId: agent.id, agentName: agent.name, transaction: tx, amount })}
            />
          )}
        </div>

        <Card className="border-white/10 bg-app-card text-white">
          <h2 className="font-bold">Rate this agent</h2>
          <p className="mt-1 text-sm text-white/60">Any Max it user can rate. You do not need a completed transaction.</p>
          {ratingState === 'sent' ? (
            <p className="mt-3 text-sm font-semibold text-app-success" role="status">Thanks. Your rating was submitted.</p>
          ) : (
            <>
              <div role="radiogroup" aria-label="Rating out of five" className="mt-3 flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} out of 5`} onClick={() => setRating((current) => current === n ? (n === 1 ? null : n - 1) : n)} className={`h-12 flex-1 rounded-card border text-2xl transition-colors ${rating !== null && n <= rating ? 'border-brand bg-brand text-ink' : 'border-white/20 bg-app-surface text-white/70'}`}>★</button>
                ))}
              </div>
              {ratingError && <p className="mt-2 text-sm text-red-300" role="alert">{ratingError}</p>}
              <button type="button" onClick={() => void submitRating()} disabled={!rating || ratingState === 'sending'} className="mt-3 h-control w-full rounded-card bg-brand text-base font-bold text-ink transition-opacity disabled:opacity-50">{ratingState === 'sending' ? 'Submitting…' : 'Submit rating'}</button>
            </>
          )}
          <p className="mt-2 text-xs text-white/45">One rating per agent per browser every 24 hours.</p>
        </Card>

        <Card className="bg-app-surface text-white">
          <h2 className="text-base font-bold">What this means</h2>
          <p className="mt-1 text-sm text-muted">
            We estimate availability from recent transaction activity. It can change, so confirm with the agent when you arrive.
          </p>
        </Card>

        <Link
          to="/report-a-visit"
          state={{ agentId: agent.id, agentName: agent.name }}
          className="-mx-2 flex h-control items-center self-start rounded-card px-2 text-base font-semibold text-brand-text"
        >
          Report a visit
        </Link>
      </div>

      <div className="sticky bottom-0 mx-auto flex w-full max-w-3xl flex-col gap-2 border-t border-white/10 bg-app-bg p-4">
        <button
          type="button"
          aria-expanded={showMap}
          aria-controls="agent-directions-map"
          onClick={() => setShowMap((v) => !v)}
          className="inline-flex h-cta w-full items-center justify-center rounded-cta bg-brand px-4 text-lg font-bold text-ink shadow-lg shadow-black/20 transition-transform active:scale-[0.99]"
        >
          {showMap ? 'Hide map & route' : 'Get directions'}
        </button>
        {agent.call_url && (
          <a
            href={agent.call_url}
            className="inline-flex h-control w-full items-center justify-center rounded-card border-2 border-brand-deep text-base font-semibold text-brand-text"
          >
            Call agent
          </a>
        )}
      </div>
    </div>
  )
}
