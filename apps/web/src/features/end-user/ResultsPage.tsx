import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Banner } from '@/design'
import { useSearch } from '@/hooks/useSearch'
import type { SearchRequest, TransactionType } from '@/types/public'
import { AgentResultCard } from './components/AgentResultCard'
import { EmptyState, ErrorState, LoadingResults, OfflineBanner } from './components/states'
import { FinderCta, FinderHeader } from './components/finder'
import { pointFrom } from './searchPoint'

function parse(params: URLSearchParams): SearchRequest | null {
  const tx = params.get('tx') as TransactionType | null
  if (tx !== 'cash_out' && tx !== 'deposit') return null
  const raw = params.get('amount')
  const amount = raw && Number(raw) > 0 ? Number(raw) : null
  const req: SearchRequest = { transaction: tx, amount_sle: amount, area: params.get('area') ?? 'Your location', radius_m: 500 }
  const point = pointFrom(params)
  if (point) {
    req.lat = point.lat
    req.lng = point.lng
  }
  return req
}

/**
 * U3 — Results, as the "Agent finder 2th page" frames draw it: the request restated on one
 * line with Edit, the Recommended / Nearest switch, then the cards. The backend ranks,
 * phrases and explains; this screen renders what it sent and re-queries every 30 s.
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
      <div className="flex flex-col gap-4 px-5 py-4 text-white">
        <FinderHeader back="/find" />
        <EmptyState
          title="Tell us what you need"
          body="Choose a transaction and an amount to see agents near you."
          actions={
            <Link to="/find" className="w-full">
              <FinderCta>Find an agent</FinderCta>
            </Link>
          }
        />
      </div>
    )
  }

  const detailTo = (id: string) =>
    `/agents/${id}?tx=${req.transaction}${req.amount_sle ? `&amount=${req.amount_sle}` : ''}&area=${encodeURIComponent(req.area)}${
      req.lat !== undefined && req.lng !== undefined ? `&lat=${req.lat}&lng=${req.lng}` : ''
    }`

  const summary = data ? `${data.query.transaction_label}${data.query.amount_label ? ` · ${data.query.amount_label}` : ''}` : 'Searching…'
  const shown = view === 'recommended' ? lists.recommended : lists.nearest
  // The switch earns its place only when the two orders differ.
  const sameOrder = lists.recommended.length > 0 && lists.recommended.length === lists.nearest.length && lists.recommended.every((a, i) => a.id === lists.nearest[i]?.id)
  // "Within 500 m" is said only while something is inside it.
  const inside = lists.nearest.length > 0
  const whereFrom =
    req.lat === undefined || params.get('by') === 'place'
      ? `Distances from around ${req.area}`
      : params.get('rough') === '1'
        ? 'Distances from your approximate location'
        : 'Distances from your location'
  const subtitle = `${whereFrom}${inside ? ', within 500 m' : ''}${params.get('rough') === '1' ? ' · move outside for a better fix' : ''}`

  return (
    <div className="flex flex-1 flex-col px-5 pb-6 text-white">
      <FinderHeader back="/find" />

      <div className="mt-6 flex items-center justify-between gap-4">
        <h1 className="min-w-0 text-xl font-bold leading-tight">{summary}</h1>
        <button
          type="button"
          onClick={() => navigate(`/find?${params.toString()}`)}
          className="flex h-control shrink-0 items-center text-base font-bold text-finder-link"
        >
          Edit
        </button>
      </div>
      <p className="text-sm font-medium text-finder-muted">{subtitle}</p>

      <div className="mt-6 flex flex-col gap-5">
        {stale && <OfflineBanner since={lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null} onRetry={refresh} />}
        {data?.banner && <Banner tone="warning">{data.banner}</Banner>}

        {state === 'loading' && <LoadingResults />}
        {state === 'error' && error && <ErrorState message={error} onRetry={refresh} />}

        {data && state !== 'loading' && (
          <>
            {lists.recommended.length > 0 && !sameOrder && (
              <>
                <div
                  role="tablist"
                  aria-label="How to order the agents"
                  className="flex h-chip rounded-field bg-finder-line"
                  onKeyDown={(e) => {
                    const keys: Record<string, View> = { ArrowLeft: 'recommended', Home: 'recommended', ArrowRight: 'nearest', End: 'nearest' }
                    const next = keys[e.key]
                    if (!next) return
                    e.preventDefault()
                    setView(next)
                    e.currentTarget.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)?.focus()
                  }}
                >
                  {(['recommended', 'nearest'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      data-view={v}
                      tabIndex={view === v ? 0 : -1}
                      aria-selected={view === v}
                      onClick={() => setView(v)}
                      className={`h-full flex-1 rounded-field text-base font-bold ${view === v ? 'bg-finder-bg text-white shadow-inset-finder' : 'text-white/80'}`}
                    >
                      {v === 'recommended' ? `Recommended (${lists.recommended.length})` : `Nearest (${lists.nearest.length})`}
                    </button>
                  ))}
                </div>
                {view === 'recommended' && lists.nearest.some((a) => a.outcome !== 'likely') && (
                  <button
                    type="button"
                    onClick={() => setView('nearest')}
                    className="-mt-2 flex min-h-control items-center text-left text-sm font-medium text-finder-muted"
                  >
                    <span>
                      Closer open agents may have uncertain availability · <span className="font-bold text-finder-link">See Nearest ›</span>
                    </span>
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

            {shown.length > 0 && (
              <section className="-mt-2 flex flex-col" aria-labelledby="sec-best">
                <h2 id="sec-best" className="sr-only">
                  {view === 'recommended'
                    ? 'Recommended agents'
                    : lists.recommended.length === 0 && lists.nearest.length === 1
                      ? 'Only open agent within 500 m'
                      : 'Nearest open agents'}
                </h2>
                {shown.map((a) => (
                  <AgentResultCard key={a.id} agent={a} to={detailTo(a.id)} recommended={a.isRecommended} />
                ))}
              </section>
            )}

            {(data.further_away?.length ?? 0) > 0 && (
              <section className="mt-4 flex flex-col" aria-labelledby="sec-further-away">
                <h2 id="sec-further-away" className="text-xs font-bold uppercase tracking-wider text-finder-muted">
                  Further away
                </h2>
                {data.further_away!.map((a) => (
                  <AgentResultCard key={a.id} agent={a} to={detailTo(a.id)} />
                ))}
              </section>
            )}

            {lists.nearest.length === 0 && (data.further_away?.length ?? 0) === 0 && (
              <EmptyState
                title={`No open agent near ${data.query.area}`}
                body={req.amount_sle ? 'Try a smaller amount, another place, or come back in a while.' : 'Try another place, or come back in a while.'}
                actions={<FinderCta onClick={() => navigate(`/find?${params.toString()}`)}>Change amount or place</FinderCta>}
              />
            )}

            {/* No live region: a screen reader would hear this flip every thirty seconds. */}
            <p className="pb-2 pt-2 text-center text-sm font-medium text-finder-muted">
              {state === 'refreshing' ? 'Refreshing…' : `Updated ${lastUpdated?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? 'just now'}`}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
