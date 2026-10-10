import { useState } from 'react'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import { useSession } from '@/features/auth/session'
import type { ActivityEvent, AgentInsights, InsightRange } from '@/types/operator'
import { FinderBox, FinderHeader } from '@/features/end-user/components/finder'
import { ThreeLines } from './components/charts'
import { Panel, PILL_ON, SectionLabel } from './components/agentChrome'

const RANGES: { key: InsightRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
]

const RANGE_TEXT: Record<InsightRange, string> = {
  today: 'so far today, by hour',
  yesterday: 'yesterday, by hour',
  week: 'the last seven days',
  month: 'the last 30 days',
}

const TONE: Record<ActivityEvent['tone'], string> = {
  neutral: 'text-white',
  good: 'text-finder-likely',
  warning: 'text-warning',
  danger: 'text-danger',
}

/**
 * Activity: how it is going. The range switch, the one line of figures, the chart with its
 * three lines, and today's timeline. The evidence Orange asked for, one tap from anywhere.
 */
export default function ActivityPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const [range, setRange] = useState<InsightRange>('week')
  const insights = useAsync<AgentInsights>((s) => operatorApi.insights(ref, range, s), [ref, range])
  const events = useAsync<ActivityEvent[]>((s) => operatorApi.activity(ref, s), [ref])
  const i = insights.data

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-white">
      <FinderHeader title="Activity" />

      <Panel className="mt-6" aria-labelledby="chart">
        <div role="tablist" aria-label="Range" className="flex h-[44px] rounded-field bg-finder-line">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={`h-full flex-1 rounded-field text-sm font-bold ${range === r.key ? 'bg-finder-bg text-white shadow-inset-finder' : 'text-white/80'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p id="chart" className="text-sm font-bold">
          {i ? `Your numbers for ${RANGE_TEXT[i.range]}` : 'Your numbers'}
        </p>
        {i && (
          <p className="-mt-2 text-sm font-medium text-finder-muted">
            <span className="font-bold text-white">{i.found_total}</span> found you ({i.found_delta >= 0 ? '+' : ''}
            {i.found_delta} vs before) · status fresh <span className="font-bold text-white">{i.fresh_pct}%</span> of your open hours
          </p>
        )}
        {insights.state === 'loading' && !i && <p className="py-6 text-center text-sm font-medium text-finder-muted">Loading…</p>}
        {i && (
          <ThreeLines
            title={`Customers who found you, transactions and status freshness for ${RANGE_TEXT[i.range]}`}
            labels={i.points.map((p) => p.label)}
            series={[
              { key: 'found', label: 'Found you', values: i.points.map((p) => p.found_you), format: (v) => `${v}`, className: 'text-finder-link bg-finder-link', total: String(i.found_total) },
              {
                key: 'tx',
                label: 'Transactions',
                values: i.points.map((p) => p.transactions),
                format: (v) => `${v}`,
                className: 'text-series-tx bg-series-tx',
                note: i.operator_source ?? 'not connected',
                total: i.transactions_total === null ? '—' : String(i.transactions_total),
              },
              { key: 'fresh', label: 'Status fresh', values: i.points.map((p) => p.fresh_pct), format: (v) => `${v}%`, isPercent: true, className: 'text-finder-likely bg-finder-likely', total: `${i.fresh_pct}%` },
            ]}
          />
        )}
        <p className="text-xs font-medium text-finder-muted">
          Found you and transactions as a share of your best {range === 'today' || range === 'yesterday' ? 'hour' : 'day'}; status fresh as it is. Touch a point for the real numbers.
        </p>
      </Panel>

      <SectionLabel className="mt-6">Today's timeline</SectionLabel>
      <div className="mt-3 flex flex-col gap-2">
        {events.state === 'loading' && <p className="text-sm font-medium text-finder-muted">Loading…</p>}
        {(events.data ?? []).length === 0 && events.state !== 'loading' && <p className="text-sm font-medium text-finder-muted">Nothing yet today.</p>}
        {(events.data ?? []).map((e) => (
          <FinderBox key={e.id} className="flex min-h-[60px] items-center gap-4 px-5 py-3">
            <span className="w-12 shrink-0 text-sm font-bold text-finder-muted">{e.time_text}</span>
            <span className="min-w-0 text-sm font-semibold leading-snug">
              <span className={TONE[e.tone]}>{e.text}</span>
              <span className={`mt-1 block w-fit rounded-tag px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${e.source === 'operator' ? 'bg-finder-line text-finder-muted' : PILL_ON}`}>
                {e.source === 'operator' ? 'Orange' : 'Agent app'}
              </span>
            </span>
          </FinderBox>
        ))}
      </div>

      <p className="mt-6 text-center text-xs font-medium text-finder-muted">
        Transactions happen in Orange Money. This app keeps your availability, your float and what customers report.
      </p>
    </div>
  )
}
