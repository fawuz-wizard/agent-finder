import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Banner, Button } from '@/design'
import { useSearch } from '@/hooks/useSearch'
import { usePendingVisit } from '@/hooks/usePendingVisit'
import type { AgentResult, SearchRequest, TransactionType } from '@/types/public'
import { AgentResultCard } from './components/AgentResultCard'
import { EmptyState, ErrorState, LoadingResults, OfflineBanner } from './components/states'

function parse(params: URLSearchParams): SearchRequest | null {
  const tx = params.get('tx') as TransactionType | null
  if (tx !== 'cash_out' && tx !== 'deposit' && tx !== 'send') return null
  const raw = params.get('amount')
  const amount = raw && Number(raw) > 0 ? Number(raw) : null
  return { transaction: tx, amount_sle: amount, area: params.get('area') ?? 'Lumley', radius_m: 2000 }
}

/**
 * U3 — Results. The backend ranks, phrases and explains; this screen renders what it sent
 * and re-queries every 30 s while visible. No ranking logic lives here.
 */
type View = 'recommended' | 'nearest'

export default function ResultsPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const req = useMemo(() => parse(params), [params])
  const { state, data, error, stale, lastUpdated, refresh } = useSearch(req)
  const { remember } = usePendingVisit()
  const [showMore, setShowMore] = useState(false)
  // The view lives in the URL so a shared or refreshed link opens the same way.
  const view: View = params.get('view') === 'nearest' ? 'nearest' : 'recommended'
  const setView = (next: View) => {
    const q = new URLSearchParams(params)
    if (next === 'nearest') q.set('view', 'nearest')
    else q.delete('view')
    setParams(q, { replace: true })
  }

  // Nearest: every agent the search returned, in plain distance order, with the same
  // honest phrases. The recommendation keeps its mark so the customer can still see
  // which one we would send them to.
  const byDistance = useMemo(() => {
    if (!data) return []
    // Only the top recommendation is marked here — in distance order a second "we
    // recommend this" would compete with the first and tell the customer nothing.
    const topId = data.recommended[0]?.id
    return [...data.recommended, ...data.closer_not_serving, ...data.results]
      .map((a) => ({ ...a, isRecommended: a.id === topId }))
      .sort((x, y) => x.distance_m - y.distance_m || x.id.localeCompare(y.id))
  }, [data])

  if (!req) {
    return (
      <div className="p-4">
        <EmptyState
          title="Tell us what you need"
          body="Choose a transaction and an amount to see agents near you."
          actions={
            <Link to="/find">
              <Button size="control" block={false}>
                Start again
              </Button>
            </Link>
          }
        />
      </div>
    )
  }

  const onDirections = (a: AgentResult) =>
    remember({ agentId: a.id, agentName: a.name, transaction: req.transaction, amount: req.amount_sle })

  const detailTo = (id: string) =>
    `/agents/${id}?tx=${req.transaction}${req.amount_sle ? `&amount=${req.amount_sle}` : ''}&area=${encodeURIComponent(req.area)}`

  const summary = data
    ? `${data.query.transaction_label}${data.query.amount_label ? ` · ${data.query.amount_label}` : ''} · ${data.query.area}`
    : 'Searching…'

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-paper px-4 py-3">
        <Link to="/find" aria-label="Back" className="-ml-2 flex h-control w-control items-center justify-center rounded-card text-2xl leading-none text-muted">
          ‹
        </Link>
        <p className="truncate text-base font-bold">{summary}</p>
        <button
          type="button"
          onClick={() => navigate(`/find?${params.toString()}`)}
          className="ml-auto h-control px-2 text-base font-semibold text-brand-text"
        >
          Edit
        </button>
      </header>

      <div className="flex flex-col gap-4 p-4">
        {stale && <OfflineBanner since={lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null} />}
        {data?.banner && <Banner tone="warning">{data.banner}</Banner>}

        {state === 'loading' && <LoadingResults />}
        {state === 'error' && error && <ErrorState message={error} onRetry={refresh} />}

        {data && state !== 'loading' && (
          <>
            <div role="tablist" aria-label="How to order the agents" className="flex rounded-cta border border-line bg-canvas p-1">
              {(['recommended', 'nearest'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`h-control flex-1 rounded-card text-base font-bold capitalize ${
                    view === v ? 'bg-paper text-ink shadow-sm' : 'text-muted'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            <p className="text-sm text-muted">
              {view === 'recommended'
                ? 'Agents update their own status. We show how recent it is.'
                : 'In distance order. Check the phrase before you walk.'}
            </p>

            {view === 'nearest' &&
              byDistance.map((a) => (
                <AgentResultCard
                  key={a.id}
                  agent={a.isRecommended ? { ...a, why: `Our recommendation for ${data.query.amount_label ?? 'this request'}.` } : a}
                  to={detailTo(a.id)}
                  recommended={a.isRecommended}
                  onDirections={onDirections}
                />
              ))}

            {view === 'recommended' && data.recommended.length > 0 && (
              <section className="flex flex-col gap-3" aria-labelledby="sec-best">
                <h2 id="sec-best" className="text-sm font-bold uppercase tracking-wider text-muted">
                  Recommended — can handle your request
                </h2>
                {data.recommended.map((a) => (
                  <AgentResultCard key={a.id} agent={a} to={detailTo(a.id)} recommended onDirections={onDirections} />
                ))}
              </section>
            )}

            {view === 'recommended' && data.closer_not_serving.length > 0 && (
              <section className="flex flex-col gap-3" aria-labelledby="sec-closer">
                <h2 id="sec-closer" className="text-sm font-bold uppercase tracking-wider text-muted">
                  On your way — you will pass these
                </h2>
                {data.closer_not_serving.map((a) => (
                  <AgentResultCard key={a.id} agent={a} to={detailTo(a.id)} onDirections={onDirections} />
                ))}
              </section>
            )}

            {data.recommended.length === 0 && data.results.length === 0 && data.closer_not_serving.length === 0 && (
              <EmptyState
                title="No agent is likely to handle this right now"
                body={`Near ${data.query.area}, no agent has a fresh status for this request.`}
                actions={
                  <div className="flex flex-col gap-2 self-stretch">
                    <Button size="control" onClick={() => navigate(`/find?${params.toString()}`)}>
                      Change transaction or amount
                    </Button>
                  </div>
                }
              />
            )}

            {view === 'recommended' && data.results.length > 0 &&
              (showMore ? (
                <section className="flex flex-col gap-3" aria-labelledby="sec-more">
                  <h2 id="sec-more" className="text-sm font-bold uppercase tracking-wider text-muted">
                    Other agents nearby
                  </h2>
                  {data.results.map((a) => (
                    <AgentResultCard key={a.id} agent={a} to={detailTo(a.id)} onDirections={onDirections} />
                  ))}
                </section>
              ) : (
                <Button variant="secondary" size="control" onClick={() => setShowMore(true)}>
                  See more agents ({data.results.length})
                </Button>
              ))}

            <p className="pb-2 text-center text-sm text-muted" aria-live="polite">
              {state === 'refreshing'
                ? 'Refreshing…'
                : `Refreshes every 30 s · updated ${lastUpdated?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? 'just now'}`}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
