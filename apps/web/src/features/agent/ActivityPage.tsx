import { useState } from 'react'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import { useSession } from '@/features/auth/session'
import type { ActivityEvent, AgentInsights, AgentTransactions, InsightRange } from '@/types/operator'
import { ThreeLines } from './components/charts'
import { SectionLabel } from './components/agentChrome'
import { formatSle } from './money'

const RANGES: { key: InsightRange; label: string; heading: string }[] = [
  { key: 'today', label: 'Today', heading: 'Your day' },
  { key: 'week', label: 'Week', heading: 'Your week' },
  { key: 'month', label: 'Month', heading: 'Your month' },
]

const RANGE_TEXT: Record<InsightRange, string> = {
  today: 'so far today, by hour',
  yesterday: 'yesterday, by hour',
  week: 'the last seven days',
  month: 'the last 30 days',
}

const TONE: Record<ActivityEvent['tone'], string> = {
  neutral: 'text-finder-ink',
  good: 'text-finder-likely',
  warning: 'text-warning',
  danger: 'text-danger',
}

/**
 * Activity, in three blocks: today (the commission and the transactions that earned it), the
 * range (customers who found you and transactions, one chart, two lines), and what happened
 * (every event of the day in one timeline, Orange's rows marked as such). Commission is exact
 * for the operator's rows and an estimate for the agent's own logs.
 */
export default function ActivityPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const [range, setRange] = useState<InsightRange>('week')
  // Two rows by default; the whole day on request, so the figure stays easy to spot.
  const [allRows, setAllRows] = useState(false)
  const tx = useAsync<AgentTransactions>((s) => operatorApi.transactions(ref, s), [ref])
  const insights = useAsync<AgentInsights>((s) => operatorApi.insights(ref, range, s), [ref, range])
  const events = useAsync<ActivityEvent[]>((s) => operatorApi.activity(ref, s), [ref])
  const i = insights.data
  const t = tx.data
  const rows = t?.rows ?? []
  const shown = allRows ? rows : rows.slice(0, 2)
  const heading = RANGES.find((r) => r.key === range)?.heading ?? 'Your numbers'

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <SectionLabel className="mt-6">Today</SectionLabel>
      <div className="mt-3 flex flex-col gap-1" aria-label="Today's commission">
        {t ? (
          <>
            <p className="text-2xl font-bold leading-none text-finder-likely">
              {t.estimated_any && <span className="text-finder-muted">≈ </span>}
              {formatSle(t.commission_total_sle)}
            </p>
            <p className="mt-1 text-sm font-semibold text-finder-muted">
              Commission · {t.successful} of {t.count} transaction{t.count === 1 ? '' : 's'} successful
            </p>
            <p className="text-xs font-medium text-finder-muted">{t.commission_note}</p>
          </>
        ) : (
          <p className="text-sm font-medium text-finder-muted">{tx.state === 'error' ? tx.error : 'Loading…'}</p>
        )}
      </div>

      <div className="mt-4 flex flex-col">
        {t && t.rows.length === 0 && <p className="text-sm font-medium text-finder-muted">Nothing yet today.</p>}
        {shown.map((r) => (
          <div key={r.id} className="flex min-h-[3.25rem] items-center gap-4 border-b border-finder-line py-3">
            <span className="w-12 shrink-0 text-sm font-semibold text-finder-muted">{r.time_text}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold">{r.label}</span>
              <span className={`block text-xs font-semibold ${r.successful ? 'text-finder-muted' : 'text-danger'}`}>
                {r.amount_text} · {r.successful ? (r.estimated ? 'Logged by you · estimate' : 'Successful') : 'Could not complete'}
              </span>
            </span>
            <span className={`shrink-0 text-right text-base font-bold ${r.successful ? 'text-finder-likely' : 'text-finder-muted'}`}>
              {r.successful ? `${r.estimated ? '≈ ' : '+'}${formatSle(r.commission_sle)}` : '—'}
            </span>
          </div>
        ))}
        {rows.length > 2 && (
          <button type="button" onClick={() => setAllRows((v) => !v)} aria-expanded={allRows} className="flex h-control items-center self-start text-base font-bold text-finder-link">
            {allRows ? 'Show fewer' : `Show all ${rows.length} ›`}
          </button>
        )}
      </div>

      <SectionLabel className="mt-8" id="chart">
        {heading}
      </SectionLabel>
      <div role="tablist" aria-label="Range" className="mt-3 flex h-[2.5rem] rounded-field bg-finder-line">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={range === r.key}
            onClick={() => setRange(r.key)}
            className={`h-full flex-1 rounded-field text-sm font-bold ${range === r.key ? 'bg-finder-bg text-finder-ink shadow-inset-finder' : 'text-finder-muted'}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {i && (
        <p className="mt-4 text-base font-semibold">
          <span className="font-bold">{i.found_total}</span> customers found you · <span className="font-bold">{i.transactions_total === null ? '—' : i.transactions_total}</span> transactions
        </p>
      )}
      {insights.state === 'loading' && !i && <p className="py-6 text-center text-sm font-medium text-finder-muted">Loading…</p>}
      {i && (
        <div className="mt-2">
          <ThreeLines
            title={`Customers who found you and transactions for ${RANGE_TEXT[i.range]}`}
            labels={i.points.map((p) => p.label)}
            series={[
              { key: 'found', label: 'Found you', values: i.points.map((p) => p.found_you), format: (v) => `${v}`, className: 'text-finder-link bg-finder-accent', total: String(i.found_total) },
              {
                key: 'tx',
                label: 'Transactions',
                values: i.points.map((p) => p.transactions),
                format: (v) => `${v}`,
                className: 'text-series-tx bg-series-tx',
                note: i.operator_source ?? 'not connected',
                total: i.transactions_total === null ? '—' : String(i.transactions_total),
              },
            ]}
          />
        </div>
      )}

      <SectionLabel className="mt-8">What happened</SectionLabel>
      <div className="mt-2 flex flex-col">
        {events.state === 'loading' && <p className="py-3 text-sm font-medium text-finder-muted">Loading…</p>}
        {(events.data ?? []).length === 0 && events.state !== 'loading' && <p className="py-3 text-sm font-medium text-finder-muted">Nothing yet today.</p>}
        {(events.data ?? []).map((e) => (
          <div key={e.id} className="flex min-h-[3rem] items-start gap-4 border-b border-finder-line py-3 last:border-b-0">
            <span className="w-12 shrink-0 pt-0.5 text-sm font-semibold text-finder-muted">{e.time_text}</span>
            <span className={`min-w-0 text-base font-semibold leading-snug ${TONE[e.tone]}`}>
              {e.text}
              {e.source === 'operator' && <span className="ml-2 text-xs font-semibold text-finder-muted">Orange</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
