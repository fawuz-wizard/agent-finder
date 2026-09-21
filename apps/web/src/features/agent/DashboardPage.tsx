import { useState } from 'react'
import { Card } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { ActivityEvent, AgentHome, AgentInsights, InsightRange } from '@/types/operator'
import { ThreeLines } from './components/charts'

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
  neutral: '',
  good: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

function Stat({ label, value, sub, good }: { label: string; value: string; sub: string; good?: boolean | undefined }) {
  return (
    <Card className="flex-1 gap-0.5">
      <p className="text-xs font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className="text-2xl font-bold leading-tight">{value}</p>
      <p className={`text-xs font-semibold ${good === undefined ? 'text-muted' : good ? 'text-success' : 'text-danger'}`}>{sub}</p>
    </Card>
  )
}

/**
 * A4 — Dashboard. Two figures, a range switch, and one chart: customers who found you,
 * transactions, and how fresh the status was, as three lines that share one 0–100 scale.
 * The day's timeline sits underneath so nothing from the old Activity view is lost.
 */
export default function DashboardPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const [range, setRange] = useState<InsightRange>('week')
  const home = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])
  const insights = useAsync<AgentInsights>((s) => operatorApi.insights(ref, range, s), [ref, range])
  const events = useAsync<ActivityEvent[]>((s) => operatorApi.activity(ref, s), [ref])
  const i = insights.data

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-paper px-4 py-3">
        <h1 className="text-lg font-bold leading-tight">Dashboard</h1>
        <p className="text-xs text-muted">{i ? `Your numbers for ${RANGE_TEXT[i.range]}` : 'Your numbers'}</p>
      </header>

      <div className="flex flex-col gap-3 p-4 pb-6">
        <div className="flex gap-3">
          <Stat
            label="Found you"
            value={i ? String(i.found_total) : '—'}
            sub={i ? `${i.found_delta >= 0 ? '+' : ''}${i.found_delta} vs before` : ' '}
            good={i ? i.found_delta >= 0 : undefined}
          />
          <Stat label="Status fresh" value={i ? `${i.fresh_pct}%` : '—'} sub="of your open hours" />
        </div>

        <div role="tablist" aria-label="Range" className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={`h-chip flex-1 rounded-pill border text-sm font-bold ${
                range === r.key ? 'border-2 border-brand-deep bg-brand-light text-brand-text' : 'border-line bg-paper text-muted'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <Card>
          <p className="text-base font-bold">Customers, transactions and status</p>
          <p className="mb-2 text-xs text-muted">
            Found you and transactions as a share of your best {range === 'today' || range === 'yesterday' ? 'hour' : 'day'}; status
            fresh as it is. Touch a point for the real numbers.
          </p>
          {insights.state === 'loading' && !i && <p className="py-6 text-center text-sm text-muted">Loading…</p>}
          {i && (
            <ThreeLines
              title={`Customers who found you, transactions and status freshness for ${RANGE_TEXT[i.range]}`}
              labels={i.points.map((p) => p.label)}
              series={[
                {
                  key: 'found',
                  label: 'Found you',
                  values: i.points.map((p) => p.found_you),
                  format: (v) => `${v}`,
                  className: 'text-brand-text bg-brand-text',
                  total: String(i.found_total),
                },
                {
                  key: 'tx',
                  label: 'Transactions',
                  values: i.points.map((p) => p.transactions),
                  format: (v) => `${v}`,
                  className: 'text-series-tx bg-series-tx',
                  note: i.operator_source ?? 'not connected',
                  total: i.transactions_total === null ? '—' : String(i.transactions_total),
                },
                {
                  key: 'fresh',
                  label: 'Status fresh',
                  values: i.points.map((p) => p.fresh_pct),
                  format: (v) => `${v}%`,
                  isPercent: true,
                  className: 'text-series-fresh bg-series-fresh',
                  total: `${i.fresh_pct}%`,
                },
              ]}
            />
          )}
          <p className="mt-2 text-xs text-muted">
            When the green line drops, the orange one usually follows — customers are not sent to an agent whose status has
            gone stale. One tap on “Still correct?” keeps it up.
          </p>
        </Card>

        <Card>
          <p className="text-base font-bold">Today</p>
          <p className="mb-1 text-xs text-muted">
            {home.data ? `${home.data.today.found_you} found you · ${home.data.today.reported_problems} reported a problem` : ' '}
          </p>
          {events.state === 'loading' && <p className="py-2 text-sm text-muted">Loading…</p>}
          {(events.data ?? []).map((e) => (
            <div key={e.id} className="flex gap-3 border-b border-line py-3 last:border-b-0">
              <span className="w-12 shrink-0 text-xs font-bold text-muted">{e.time_text}</span>
              <span className="text-sm leading-snug">
                <span className={TONE[e.tone]}>{e.text}</span>
                <span
                  className={`mt-1 block w-fit rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    e.source === 'operator' ? 'bg-canvas text-muted' : 'bg-brand-light text-brand-text'
                  }`}
                >
                  {e.source === 'operator' ? 'Orange' : 'Agent app'}
                </span>
              </span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
