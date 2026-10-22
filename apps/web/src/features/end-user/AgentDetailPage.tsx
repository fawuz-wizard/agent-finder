import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Skeleton } from '@/design'
import { customerApi } from '@/services/customerApi'
import { ApiRequestError } from '@/lib/api'
import { rememberRecent } from '@/lib/recent'
import { ServedLikelihood } from './components/ServedLikelihood'
import { FreshnessBadge } from './components/FreshnessBadge'
import { DistanceLabel } from './components/DistanceLabel'
import { ErrorState } from './components/states'
import { FinderCta, FinderHeader, PinIcon } from './components/finder'
import { useBack } from './useBack'
import { DirectionsIcon, PhoneIcon, actionClass } from './components/actions'
import { requestFrom, useAgentDetail } from './useAgentDetail'
import { photoSrc } from '@/lib/photo'

function ratingToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** "tel:+23272416283" → "+232 72 416 283", as the file prints it. */
function phoneText(callUrl: string): string {
  const digits = callUrl.replace(/^tel:/, '').replace(/[^\d+]/g, '')
  const m = /^\+?232(\d{2})(\d{3})(\d{3})$/.exec(digits)
  return m ? `+232 ${m[1]} ${m[2]} ${m[3]}` : digits
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-[0.95rem] font-medium text-finder-muted">
      <span aria-hidden="true" className="flex w-5 shrink-0 justify-center text-finder-muted">
        {icon}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2">{children}</span>
    </p>
  )
}

const ClockIcon = (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9 5v4.5l3 1.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)
const PinSmall = (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" fill="currentColor" />
    <circle cx="12" cy="10" r="2.6" fill="var(--color-finder-bg)" />
  </svg>
)
const StarIcon = (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="text-finder-star">
    <path d="M9 1.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L9 13.3l-4.6 2.5.9-5.2L1.5 7l5.2-.7z" fill="currentColor" />
  </svg>
)
/**
 * Agent detail, as the "Agent details page" frames draw it: a picture of the shop, then a
 * sheet, dark like the rest of the module, with the name, how far and whether it is open, rating, where, phone, the
 * hours, and Call / Get directions at the foot. Our own answer to the
 * customer's request sits right under the name, because that is what they came for.
 * Shop details always come before the map: Get Directions opens the next screen.
 */
export default function AgentDetailPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { agent, error } = useAgentDetail(id, requestFrom(params))
  const [rating, setRating] = useState<number | null>(null)
  const [ratingState, setRatingState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [ratingError, setRatingError] = useState<string | null>(null)
  const directionsPath = `/agents/${id}/directions${params.toString() ? `?${params.toString()}` : ''}`
  // Back: the results the customer came from, or, on a pasted link, the search with the same request.
  const back = useBack(params.get('tx') ? `/search?${params.toString()}` : '/find')

  useEffect(() => {
    if (agent) rememberRecent({ id: agent.id, name: agent.name, area: agent.area })
  }, [agent])

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

  if (error) {
    return (
      <div className="flex flex-col gap-4 px-5 py-4 text-white">
        <FinderHeader back={back} />
        <ErrorState message={error} />
        <Link to="/find">
          <FinderCta>Search again</FinderCta>
        </Link>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="flex flex-col gap-3 px-5 py-4" aria-busy="true">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  }

  const photo = photoSrc(agent.photo_url)
  const backButton = (
    <button
      type="button"
      onClick={back}
      aria-label="Back"
      className="absolute left-3 top-3 flex h-control w-control items-center justify-center rounded-pill bg-finder-bg/60 text-white"
    >
      <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true">
        <path d="M12 1L3 9l9 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )

  return (
    <div className="flex flex-1 flex-col bg-finder-bg text-white">
      {/* The shop's picture, as the agent took it. Until they add one, the space waits with the network's mark: shorter, so the name is still in the first screen. */}
      <div className={`relative flex items-end justify-center overflow-hidden bg-finder-line text-white ${photo ? 'h-[13rem]' : 'h-[9rem]'}`}>
        {photo ? (
          <img src={photo} alt={`${agent.name}, photographed by the agent`} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="mb-9 text-finder-link" aria-hidden="true">
            <PinIcon size={44} />
          </span>
        )}
        {backButton}
      </div>

      <div className="-mt-5 flex flex-1 flex-col rounded-t-panel bg-finder-bg px-5 pb-32 pt-6 shadow-inset-finder">
        <h1 className="text-xl font-bold leading-tight">{agent.name}</h1>
        <div className="mt-4 flex flex-col gap-2">
          <Row icon={ClockIcon}>
            <DistanceLabel metres={agent.distance_m} />
            <span aria-hidden="true">•</span>
            <span className={`font-semibold ${agent.open_now ? 'text-finder-open' : 'text-finder-muted'}`}>
              {agent.open_now ? 'Open now' : 'Closed now'}
            </span>
            {agent.verified_label && <span className="rounded-pill bg-finder-line px-2 py-0.5 text-xs font-semibold text-white">{agent.verified_label}</span>}
          </Row>
          {agent.rating_count != null && agent.rating_count >= 3 && agent.rating_average != null && (
            <Row icon={StarIcon}>
              <span className="font-semibold text-finder-star">{agent.rating_average}</span>
              <span>[{agent.rating_count} ratings]</span>
            </Row>
          )}
          <Row icon={PinSmall}>{agent.area}</Row>
          {agent.call_url && <Row icon={PhoneIcon}>{phoneText(agent.call_url)}</Row>}
        </div>

        {/* The answer to the customer's own request: how likely they are to be served, as a
            round figure that is never 100, with how fresh the picture is. No figure and nothing
            to caution about means nothing here: a verdict would read like praise. */}
        {(agent.served_pct != null || agent.outcome !== 'likely') && (
          <section className="mt-8 flex flex-col gap-3" aria-label="Your request">
            <ServedLikelihood agent={agent} size="lg" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {agent.served_pct != null && <span className="text-sm font-semibold text-finder-muted">{agent.request_label}</span>}
              <FreshnessBadge state={agent.freshness} text={agent.freshness_text} />
            </div>
          </section>
        )}

        <h2 className="mt-8 text-lg font-bold">Hours</h2>
        <p className="mt-2 text-base font-medium text-finder-muted">{agent.hours_text}</p>

        <section className="mt-10" aria-labelledby="rate-heading">
          <h2 id="rate-heading" className="text-lg font-bold">Rate this agent</h2>
          <p className="mt-2 text-sm font-medium text-finder-muted">Anyone can rate, before or after a visit.</p>
          {ratingState === 'sent' ? (
            <p className="mt-4 text-base font-semibold text-finder-likely" role="status">Thanks. Your rating was submitted.</p>
          ) : (
            <>
              <div role="radiogroup" aria-label="Rating out of five" className="mt-4 flex gap-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} out of 5`}
                    onClick={() => setRating(n)}
                    className={`h-control flex-1 rounded-field text-2xl transition-colors ${rating !== null && n <= rating ? 'bg-finder-link text-finder-on-orange' : 'bg-finder-line text-finder-muted'}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              {ratingError && <p className="mt-3 text-sm font-semibold text-danger" role="alert">{ratingError}</p>}
              <button
                type="button"
                onClick={() => void submitRating()}
                disabled={!rating || ratingState === 'sending'}
                className="mt-4 h-chip rounded-pill bg-finder-link px-6 text-base font-bold text-finder-on-orange transition-opacity disabled:opacity-40"
              >
                {ratingState === 'sending' ? 'Submitting…' : rating ? `Submit ${rating}-star rating` : 'Submit rating'}
              </button>
            </>
          )}
          <p className="mt-3 text-xs font-medium text-finder-muted">One rating per shop per day from this phone.</p>
        </section>

        <div className="mt-10 border-t border-finder-line pt-6">
          <p className="text-sm font-medium text-finder-muted">
            The figure comes from recent activity at the shop, never from its cash. It can change before you arrive.
          </p>
          <Link
            to="/report-a-visit"
            state={{ agentId: agent.id, agentName: agent.name }}
            className="mt-1 flex h-control items-center self-start text-base font-bold text-finder-link"
          >
            Report a visit
          </Link>
        </div>
      </div>

      <div className="sticky bottom-0 mx-auto flex w-full max-w-[480px] gap-3 border-t border-finder-line bg-finder-bg px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        {agent.call_url && (
          <a href={agent.call_url} className={actionClass}>
            {PhoneIcon}
            Call
          </a>
        )}
        <Link to={directionsPath} className={`${actionClass} flex-[1.4]`}>
          {DirectionsIcon}
          Get directions
        </Link>
      </div>
    </div>
  )
}
