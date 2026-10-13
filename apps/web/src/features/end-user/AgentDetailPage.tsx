import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Skeleton } from '@/design'
import { customerApi } from '@/services/customerApi'
import { ApiRequestError } from '@/lib/api'
import { rememberRecent } from '@/lib/recent'
import { TRANSACTION_LABELS, type TransactionType } from '@/types/public'
import { ServiceStatus } from './components/ServiceStatus'
import { FreshnessBadge } from './components/FreshnessBadge'
import { DistanceLabel } from './components/DistanceLabel'
import { ErrorState } from './components/states'
import { FinderCta, FinderHeader, PinIcon } from './components/finder'
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
const StarIcon = (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="text-finder-star">
    <path d="M9 1.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L9 13.3l-4.6 2.5.9-5.2L1.5 7l5.2-.7z" fill="currentColor" />
  </svg>
)
/**
 * Agent detail, as the "Agent details page" frames draw it: a picture of the shop, then a
 * sheet, dark like the rest of the module, with the name, how far and whether it is open, rating, where, phone, the
 * services, the hours, and Call / Get Directions at the foot. Our own answer to the
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
        <FinderHeader back={() => history.back()} />
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

  const services = ['Orange Money', ...(Object.keys(TRANSACTION_LABELS) as TransactionType[]).map((k) => TRANSACTION_LABELS[k])]

  return (
    <div className="flex flex-1 flex-col bg-finder-bg text-white">
      {/* The shop's picture, as the agent took it. Until they add one, the network's own mark. */}
      <div className="relative flex h-[13rem] items-end justify-center overflow-hidden bg-finder-line text-white">
        {photoSrc(agent.photo_url) && (
          <img src={photoSrc(agent.photo_url)!} alt={`${agent.name}, photographed by the agent`} className="absolute inset-0 h-full w-full object-cover" />
        )}
        <button
          type="button"
          onClick={() => history.back()}
          aria-label="Back"
          className="absolute left-3 top-3 flex h-control w-control items-center justify-center rounded-pill bg-finder-bg/60 text-white"
        >
          <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true">
            <path d="M12 1L3 9l9 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {!photoSrc(agent.photo_url) && (
          <span className="mb-10 text-finder-link">
            <PinIcon size={56} />
          </span>
        )}
      </div>

      <div className="-mt-5 flex flex-1 flex-col rounded-t-panel bg-finder-bg px-5 pb-28 pt-6 shadow-inset-finder">
        <h1 className="text-xl font-bold leading-tight">{agent.name}</h1>
        <div className="mt-3 flex flex-col gap-2">
          <Row icon={ClockIcon}>
            <DistanceLabel metres={agent.distance_m} />
            <span aria-hidden="true">•</span>
            <span className={`font-semibold ${agent.open_now ? 'text-finder-open' : 'text-finder-muted'}`}>
              {agent.open_now ? 'Open now' : 'Hours vary'}
            </span>
            {agent.verified_label && <span className="rounded-pill bg-finder-line px-2 py-0.5 text-xs font-semibold text-white">{agent.verified_label}</span>}
          </Row>
          {agent.rating_count != null && agent.rating_count >= 3 && agent.rating_average != null && (
            <Row icon={StarIcon}>
              <span className="font-semibold text-finder-star">{agent.rating_average}</span>
              <span>[{agent.rating_count} ratings]</span>
            </Row>
          )}
          <Row icon={<PinIcon size={18} />}>{agent.area}</Row>
          {agent.call_url && <Row icon={PhoneIcon}>{phoneText(agent.call_url)}</Row>}
        </div>

        {/* The request, how fresh the picture is, and a caution when there is one. No praise:
            "can likely handle" read like a reputation badge here, so the good case says nothing. */}
        <section className="mt-5 flex flex-col gap-2 rounded-field bg-finder-bg p-4 shadow-inset-finder" aria-label="Your request">
          <p className="text-xs font-bold uppercase tracking-wider text-finder-muted">{agent.request_label}</p>
          {agent.outcome !== 'likely' && <ServiceStatus outcome={agent.outcome} text={agent.outcome_text} size="lg" />}
          <FreshnessBadge state={agent.freshness} text={agent.freshness_text} />
        </section>

        <h2 className="mt-6 text-xl font-bold">Services</h2>
        <ul className="mt-3 flex flex-wrap gap-3">
          {services.map((s) => (
            <li key={s} className="flex h-10 items-center rounded-field bg-finder-line px-4 text-[0.95rem] font-semibold text-white">
              {s}
            </li>
          ))}
        </ul>

        <h2 className="mt-6 text-xl font-bold">Opening Hours</h2>
        <p className="mt-3 text-base font-medium text-finder-muted">{agent.hours_text}</p>

        <section className="mt-6 rounded-field bg-finder-bg p-4 shadow-inset-finder">
          <h2 className="text-base font-bold">Rate this agent</h2>
          <p className="mt-1 text-sm font-medium text-finder-muted">Any Max it user can rate. You do not need a completed transaction.</p>
          {ratingState === 'sent' ? (
            <p className="mt-3 text-sm font-semibold text-finder-likely" role="status">Thanks. Your rating was submitted.</p>
          ) : (
            <>
              <div role="radiogroup" aria-label="Rating out of five" className="mt-3 flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} out of 5`}
                    onClick={() => setRating((current) => (current === n ? (n === 1 ? null : n - 1) : n))}
                    className={`h-12 flex-1 rounded-field text-2xl transition-colors ${rating !== null && n <= rating ? 'bg-finder-link text-finder-on-orange' : 'bg-finder-line text-finder-muted'}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              {ratingError && <p className="mt-2 text-sm font-semibold text-danger" role="alert">{ratingError}</p>}
              <button
                type="button"
                onClick={() => void submitRating()}
                disabled={!rating || ratingState === 'sending'}
                className="mt-3 h-[2.5rem] w-full rounded-field bg-finder-link text-base font-semibold text-finder-on-orange transition-opacity disabled:opacity-40"
              >
                {ratingState === 'sending' ? 'Submitting…' : 'Submit rating'}
              </button>
            </>
          )}
          <p className="mt-2 text-xs font-medium text-finder-muted">One rating per agent per browser every 24 hours.</p>
        </section>

        <p className="mt-6 text-sm font-medium text-finder-muted">
          We estimate availability from recent transaction activity. It can change, so confirm with the agent when you arrive.
        </p>
        <Link
          to="/report-a-visit"
          state={{ agentId: agent.id, agentName: agent.name }}
          className="mt-2 flex h-control items-center self-start text-base font-bold text-finder-link"
        >
          Report a visit
        </Link>
      </div>

      <div className="sticky bottom-0 mx-auto flex w-full max-w-[480px] gap-5 bg-finder-bg px-5 pb-6 pt-3">
        {agent.call_url && (
          <a href={agent.call_url} className={actionClass}>
            {PhoneIcon}
            Call
          </a>
        )}
        <Link to={directionsPath} className={actionClass}>
          {DirectionsIcon}
          Get Directions
        </Link>
      </div>
    </div>
  )
}
