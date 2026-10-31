import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Minus, Star, TrendingDown, TrendingUp } from 'lucide-react'
import { useSession } from '@/features/auth/session'
import { useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { DealerAgentDetail, DealerAgentReports, FeedbackItem } from '@/types/operator'
import { ScreenTitle } from './components/designKit'
import { CARD, OUTLINE, PAGE, SOLID, chipClass } from './components/designClasses'

type Tab = 'not_served' | 'comment' | 'served'
const TIGHT = PAGE.replace('gap-5', 'gap-4')

function meta(i: FeedbackItem) {
  return [i.day_text, i.transaction_label, i.rating ? '★'.repeat(i.rating) : null].filter(Boolean).join(' · ')
}

/**
 * What customers reported about one agent, for their aggregator: the same anonymous reports
 * the agent reads in their own app. The title, the shop and its star rating, then three tabs
 * with their counts and nothing else: Not served (opens first: the week line, reason chips,
 * each failed visit with the customer's words), Comments (every customer's words; a failed
 * visit's carry a tag with the reason) and Served (figures only). Lists come 20 at a time
 * from the server, which counts over every report, so hundreds are fine. Call and Nudge stay
 * at the bottom; each is logged with the aggregator's name. Never who: no name, number, time
 * or amount.
 */
export default function DealerAgentReportsPage() {
  const { ref = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'comment' ? 'comment' : params.get('tab') === 'served' ? 'served' : 'not_served'
  const reason = tab === 'not_served' ? params.get('reason') : null
  const { session } = useSession()
  const toast = useToast()
  const kind = tab === 'served' ? undefined : tab
  const page = useAsync<DealerAgentReports>((s) => operatorApi.dealerAgentReports(ref, { kind, reason }, s), [ref, tab, reason])
  const agent = useAsync<DealerAgentDetail>((s) => operatorApi.dealerAgent(ref, s), [ref])
  const [more, setMore] = useState<FeedbackItem[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  useEffect(() => setMore([]), [ref, tab, reason])
  const d = page.data

  function go(next: { tab?: Tab; reason?: string | null }) {
    const q = new URLSearchParams()
    const t = next.tab ?? tab
    if (t !== 'not_served') q.set('tab', t)
    const r = next.reason === undefined ? reason : next.reason
    if (t === 'not_served' && r) q.set('reason', r)
    setParams(q, { replace: true })
  }

  async function loadMore() {
    if (!d) return
    setLoadingMore(true)
    try {
      const next = await operatorApi.dealerAgentReports(ref, { kind, reason, offset: d.items.length + more.length })
      setMore((m) => [...m, ...next.items])
    } finally {
      setLoadingMore(false)
    }
  }

  async function act(action: 'contact' | 'nudge') {
    const logged = await operatorApi.act(ref, action, session?.name ?? 'Dealer')
    toast.show(logged.note)
  }

  const first = agent.data?.name?.split(' ')[0] ?? 'the agent'
  const callUrl = agent.data?.call_url ?? null
  const actions = (
    <div className="mt-auto flex gap-3 pt-2">
      {callUrl ? (
        <a href={callUrl} onClick={() => void act('contact')} className={`${SOLID} flex-1 text-[15px]`}>
          Call {first}
        </a>
      ) : (
        <button type="button" onClick={() => void act('contact')} className={`${SOLID} flex-1 text-[15px]`}>
          Contact {first}
        </button>
      )}
      <button type="button" onClick={() => void act('nudge')} className={`${OUTLINE} flex-1`}>
        Nudge
      </button>
    </div>
  )

  if (!d)
    return (
      <div className={TIGHT}>
        <ScreenTitle title="Customer reports" back={`/dealer/agents/${encodeURIComponent(ref)}`} />
        {page.state === 'loading' ? (
          <p className="text-base font-medium text-finder-muted">Loading…</p>
        ) : (
          <p className="text-base font-semibold text-danger">
            {page.error ?? 'Could not load.'}{' '}
            <button type="button" onClick={page.refresh} className="underline">
              Try again
            </button>
          </p>
        )}
      </div>
    )

  const s = d.summary
  const items = [...d.items, ...more]
  const total = d.total ?? d.items.length
  const left = Math.max(0, total - items.length)
  const reports = s.served + s.not_served
  const tabs: [Tab, string, number, string][] = [
    ['not_served', 'Not served', s.not_served, 'text-danger'],
    ['comment', 'Comments', s.comments, ''],
    ['served', 'Served', s.served, 'text-finder-likely-ink'],
  ]
  const tr = d.trend
  const up = tr && tr.this_week > tr.last_week
  const down = tr && tr.this_week < tr.last_week

  const list = (
    <ul className={`${CARD} px-4 py-1`} aria-label={tab === 'comment' ? 'Comments' : 'Not served visits'}>
      {items.map((i) => (
        <li key={i.id} className="border-t border-finder-card-line py-2.5 first:border-t-0">
          {tab === 'not_served' ? (
            <>
              <p className="text-[15px] font-bold leading-snug">{i.reason_text}</p>
              <p className="text-[13px] text-finder-muted">{meta(i)}</p>
              {i.comment && <p className="mt-0.5 text-[13px] leading-snug">“{i.comment}”</p>}
            </>
          ) : (
            <>
              <p className="text-[13px] font-bold text-finder-muted">{meta(i)}</p>
              <p className="text-sm leading-snug">“{i.comment}”</p>
              {i.kind === 'not_served' && <span className="mt-1 inline-block rounded-pill bg-design-bad-tint px-2 py-0.5 text-[11px] font-bold text-danger">Not served · {i.reason_text}</span>}
            </>
          )}
        </li>
      ))}
      {left > 0 && (
        <li className="border-t border-finder-card-line">
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="flex min-h-[44px] w-full items-center justify-center text-sm font-bold text-finder-link disabled:opacity-60">
            {loadingMore ? 'Loading…' : `Load ${Math.min(20, left)} more · ${left} left`}
          </button>
        </li>
      )}
    </ul>
  )

  return (
    <div className={TIGHT}>
      <ScreenTitle title="Customer reports" back={`/dealer/agents/${encodeURIComponent(ref)}`} />
      <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm text-finder-muted">
          {d.shop_name} · last {d.days} days
        </p>
        <p className="flex items-center gap-1 text-sm font-bold" aria-label={s.rating_average !== null ? `Rating ${s.rating_average} from ${s.ratings} ratings` : 'Rating: fewer than 3 ratings'}>
          <Star size={15} strokeWidth={2.2} className="fill-current text-finder-accent" aria-hidden />
          {s.rating_average !== null ? (
            <>
              {s.rating_average} <span className="font-medium text-finder-muted">· {s.ratings} ratings</span>
            </>
          ) : (
            <span className="font-medium text-finder-muted">fewer than 3 ratings</span>
          )}
        </p>
      </div>

      <div role="tablist" aria-label="Customer reports" className="flex gap-1 rounded-[14px] bg-design-track p-1">
        {tabs.map(([key, label, n, tone]) => (
          <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => go({ tab: key, reason: null })} className={`flex flex-1 flex-col items-center rounded-[11px] py-2 text-[13px] font-extrabold transition-colors duration-150 ${tab === key ? 'bg-finder-card text-finder-ink shadow-sm' : 'text-finder-muted'}`}>
            <span className={`text-lg leading-tight ${tone}`}>{n}</span>
            {label}
          </button>
        ))}
      </div>

      <section role="tabpanel" aria-label={tabs.find(([k]) => k === tab)![1]} className="flex flex-col gap-3">
        {tab === 'not_served' && (
          <>
            {tr && (
              <p role="status" className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-bold ${up ? 'bg-design-bad-tint text-danger' : down ? 'bg-design-good-tint text-finder-likely-ink' : 'bg-design-track text-finder-muted'}`}>
                {up ? <TrendingUp size={17} strokeWidth={2.2} aria-hidden /> : down ? <TrendingDown size={17} strokeWidth={2.2} aria-hidden /> : <Minus size={17} strokeWidth={2.2} aria-hidden />}
                {tr.this_week} this week, {tr.last_week} last week
              </p>
            )}
            {(d.reasons ?? []).length > 0 && (
              <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6" role="group" aria-label="Reasons">
                <button type="button" aria-pressed={!reason} onClick={() => go({ reason: null })} className={chipClass(!reason)}>
                  All {s.not_served}
                </button>
                {(d.reasons ?? []).map((r) => (
                  <button key={r.code} type="button" aria-pressed={reason === r.code} onClick={() => go({ reason: r.code })} className={chipClass(reason === r.code)}>
                    {r.text} {r.count}
                  </button>
                ))}
              </div>
            )}
            {items.length === 0 ? <p className="text-sm font-medium text-finder-muted">No customer said they were turned away in the last {d.days} days.</p> : list}
          </>
        )}
        {tab === 'comment' && (items.length === 0 ? <p className="text-sm font-medium text-finder-muted">No customer left words in the last {d.days} days.</p> : list)}
        {tab === 'served' && (
          <>
            <div className={`${CARD} flex flex-col items-center px-4 py-5 text-center`}>
              <span className="text-5xl font-extrabold leading-tight text-finder-likely-ink">{s.served}</span>
              <span className="text-sm font-semibold text-finder-muted">customers said they were served · last {d.days} days</span>
            </div>
            <div className={`${CARD} flex flex-col px-4 py-3`}>
              <span className="text-xl font-extrabold">{reports ? `${Math.round((s.served / reports) * 100)}%` : '—'}</span>
              <span className="text-xs font-semibold text-finder-muted">
                Served, of all reports ({s.served} of {reports})
              </span>
            </div>
          </>
        )}
      </section>

      <p className="text-xs font-medium text-finder-muted">{d.privacy_text}</p>
      {actions}
    </div>
  )
}
