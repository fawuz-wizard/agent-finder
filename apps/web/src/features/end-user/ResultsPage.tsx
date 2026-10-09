import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Banner, Button } from '@/design'
import { useSearch } from '@/hooks/useSearch'
import type { SearchRequest, TransactionType } from '@/types/public'
import { AgentResultCard } from './components/AgentResultCard'
import { EmptyState, ErrorState, LoadingResults, OfflineBanner } from './components/states'

function parse(params: URLSearchParams): SearchRequest | null {
  const tx = params.get('tx') as TransactionType | null
  if (tx !== 'cash_out' && tx !== 'deposit') return null
  const raw = params.get('amount')
  const amount = raw && Number(raw) > 0 ? Number(raw) : null
  return { transaction: tx, amount_sle: amount, area: params.get('area') ?? 'Lumley', radius_m: 500 }
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
  // Search results open on Recommended when there are likely matches. With no likely
  // match, show the open nearby options directly instead of an empty Recommended tab.
  const requestedView: View = params.get('view') === 'nearest' ? 'nearest' : 'recommended'
  const setView = (next: View) => {
    const q = new URLSearchParams(params)
    if (next === 'recommended') q.delete('view')
    else q.set('view', 'nearest')
    setParams(q, { replace: true })
  }

  // Nearest: every agent the search returned, in plain distance order, with the same
  // honest phrases. The recommendation keeps its mark so the customer can still see
  // which one we would send them to.
  const lists = useMemo(() => {
    if (!data) return { recommended: [], nearest: [] }
    const all = [...data.recommended, ...data.results, ...data.closer_not_serving]
      .sort((x, y) => x.distance_m - y.distance_m || x.id.localeCompare(y.id))
    const topId = data.recommended[0]?.id
    return {
      recommended: data.recommended.map((a) => ({ ...a, isRecommended: a.id === topId })),
      nearest: all.slice(0, 10).map((a) => ({ ...a, isRecommended: a.id === topId })),
    }
  }, [data])
  const view: View = lists.recommended.length > 0 ? requestedView : 'nearest'

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

  const detailTo = (id: string) =>
    `/agents/${id}?tx=${req.transaction}${req.amount_sle ? `&amount=${req.amount_sle}` : ''}&area=${encodeURIComponent(req.area)}`

  const summary = data
    ? `${data.query.transaction_label}${data.query.amount_label ? ` · ${data.query.amount_label}` : ''} · ${data.query.area}`
    : 'Searching…'

  return (
    <div className="flex flex-1 flex-col bg-app-bg text-white">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-app-bg px-4 py-3">
        <Link to="/find" aria-label="Back" className="-ml-2 flex h-control w-control items-center justify-center rounded-card text-2xl leading-none text-muted">
          ‹
        </Link>
        <p className="truncate text-base font-bold text-white">Agent Finder</p>
        <button
          type="button"
          onClick={() => navigate(`/find?${params.toString()}`)}
          className="ml-auto h-control px-2 text-base font-semibold text-brand-text"
        >
          Edit
        </button>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between rounded-card bg-app-surface px-4 py-3 text-sm font-semibold"><span>{summary}</span><span className="text-app-highlight">500 m core · Simulated location</span></div>
        {stale && <OfflineBanner since={lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null} />}
        {data?.banner && <Banner tone="warning">{data.banner}</Banner>}

        {state === 'loading' && <LoadingResults />}
        {state === 'error' && error && <ErrorState message={error} onRetry={refresh} />}

        {data && state !== 'loading' && (
          <>
            {lists.recommended.length > 0 && (
              <>
                <div role="tablist" aria-label="How to order the agents" className="flex rounded-card bg-app-surface p-1">
                  {(['recommended', 'nearest'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={view === v}
                      onClick={() => setView(v)}
                      className={`h-control flex-1 rounded-card text-base font-bold capitalize ${
                        view === v ? 'bg-app-tab-active text-white shadow-sm' : 'text-white/60'
                      }`}
                    >
                      {v === 'recommended' ? `Recommended (${lists.recommended.length})` : `Nearest (${lists.nearest.length})`}
                    </button>
                  ))}
                </div>
                <p className="-mt-2 text-sm text-white/55">
                  {view === 'nearest'
                    ? 'Closest open agents first. Check each status to see who may handle your request.'
                    : 'Ranked using recent transaction activity. Availability can change.'}
                </p>
                {view === 'recommended' && lists.nearest.some((a) => a.outcome !== 'likely') && (
                  <button
                    type="button"
                    onClick={() => setView('nearest')}
                    className="rounded-card bg-app-surface px-4 py-3 text-left text-sm font-semibold text-app-highlight"
                  >
                    Closer open agents may have uncertain availability · See Nearest ›
                  </button>
                )}
              </>
            )}

            {lists.recommended.length === 0 && lists.nearest.length > 0 && (
              <Banner tone="warning">
                No likely match within 500 m. Nearby open agents are shown by distance; activity cannot confirm they can serve this request.
              </Banner>
            )}

            {lists.recommended.length === 0 && lists.nearest.length === 0 && (data.further_away?.length ?? 0) > 0 && (
              <Banner tone="warning">No open agents within 500 m. These open options are further away.</Banner>
            )}

            {(view === 'recommended' ? lists.recommended : lists.nearest).length > 0 && (
              <section className="flex flex-col gap-3" aria-labelledby="sec-best">
                <h2 id="sec-best" className="text-sm font-bold uppercase tracking-wider text-white/60">
                  {view === 'recommended'
                    ? 'Recommended agents'
                    : lists.recommended.length === 0 && lists.nearest.length === 1
                      ? 'Only open agent within 500 m'
                      : 'Nearest open agents'}
                </h2>
                {(view === 'recommended' ? lists.recommended : lists.nearest).map((a) => (
                  <AgentResultCard
                    key={a.id}
                    agent={a}
                    to={detailTo(a.id)}
                    recommended={a.isRecommended}
                  />
                ))}
              </section>
            )}

            {(data.further_away?.length ?? 0) > 0 && (
              <section className="flex flex-col gap-3" aria-labelledby="sec-further-away">
                <h2 id="sec-further-away" className="text-sm font-bold uppercase tracking-wider text-white/60">Further away</h2>
                {data.further_away!.map((a) => (
                  <AgentResultCard key={a.id} agent={a} to={detailTo(a.id)} />
                ))}
              </section>
            )}

            {lists.nearest.length === 0 && (data.further_away?.length ?? 0) === 0 && (
              <EmptyState
                title="No open agents found in this area"
                body={`We couldn't find an open agent near ${data.query.area}. Try another area or search again.`}
                actions={
                  <div className="flex flex-col gap-2 self-stretch">
                    <Button size="control" onClick={() => navigate(`/find?${params.toString()}`)}>
                      Change transaction or amount
                    </Button>
                  </div>
                }
              />
            )}

            <p className="pb-2 text-center text-sm text-white/50" aria-live="polite">{state === 'refreshing' ? 'Refreshing…' : `Updated ${lastUpdated?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? 'just now'}`}</p>
          </>
        )}
      </div>
    </div>
  )
}
