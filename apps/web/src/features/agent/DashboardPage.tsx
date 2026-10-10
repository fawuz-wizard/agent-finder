import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import { useSession } from '@/features/auth/session'
import { PRESENCE_LABELS } from '@/types/operator'
import type { ActivityEvent, AgentHome, AgentInsights, InsightRange, Presence } from '@/types/operator'
import { ServiceStatus } from '@/features/end-user/components/ServiceStatus'
import { FinderCta } from '@/features/end-user/components/finder'
import { ThreeLines } from './components/charts'
import { Label, Panel, Title } from './components/agentChrome'

const PRESENCE: { value: Presence; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'hidden', label: 'Away' },
  { value: 'closed', label: 'Closed' },
]

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

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 py-1">
      <span className="text-2xl font-bold leading-tight text-white">{value}</span>
      <span className="text-center text-xs font-semibold text-finder-muted">{label}</span>
    </div>
  )
}

/**
 * Dashboard: the screen the agent opens twenty times a day. Open or Closed at the top, what
 * customers see right now (the estimate, never a figure), today's numbers, the chart, and
 * the day's timeline. There is nothing to refresh and no word to pick: the agent controls
 * presence and hours; the activity does the rest.
 */
export default function DashboardPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const home = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])
  const [range, setRange] = useState<InsightRange>('week')
  const insights = useAsync<AgentInsights>((s) => operatorApi.insights(ref, range, s), [ref, range])
  const events = useAsync<ActivityEvent[]>((s) => operatorApi.activity(ref, s), [ref])
  const [saving, setSaving] = useState<Presence | 'extend' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function setPresence(presence: Presence) {
    if (!home.data || saving) return
    setSaving(presence)
    setError(null)
    try {
      await operatorApi.declare(ref, { presence, night_mode: home.data.declaration.night_mode })
      home.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(null)
    }
  }

  async function stayOpen() {
    setSaving('extend')
    try {
      await operatorApi.setToday(ref, { extend_minutes: 60 })
      home.refresh()
    } finally {
      setSaving(null)
    }
  }

  if (home.state === 'loading') return <p className="px-5 py-6 text-base font-medium text-finder-muted">Loading your day…</p>
  if (home.state === 'error' || !home.data)
    return (
      <div className="flex flex-col gap-4 px-5 py-6">
        <p className="text-base font-semibold text-danger">{home.error}</p>
        <FinderCta onClick={home.refresh}>Try again</FinderCta>
      </div>
    )

  const data = home.data
  const d = data.declaration
  const see = data.customers_see
  const i = insights.data
  const presenceTone = d.presence === 'open' ? 'text-finder-likely' : d.presence === 'hidden' ? 'text-warning' : 'text-finder-muted'

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pb-8 pt-2 text-white">
      <Title sub={<>{data.ref} · {data.area}</>}>{data.name}</Title>

      {data.schedule.notice && (
        <Panel className="border-l-4 border-warning" role="status">
          <p className="text-sm font-semibold">{data.schedule.notice}</p>
          <button type="button" onClick={stayOpen} disabled={saving !== null} className="h-control self-start text-base font-bold text-finder-link">
            {saving === 'extend' ? 'Saving…' : 'Stay open 1 more hour'}
          </button>
        </Panel>
      )}

      <Panel aria-labelledby="status-now">
        <Label id="status-now">Right now</Label>
        <p className={`text-2xl font-bold leading-tight ${presenceTone}`}>{PRESENCE_LABELS[d.presence]}</p>
        <div role="radiogroup" aria-label="Right now" className="mt-1 flex gap-2">
          {PRESENCE.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={d.presence === p.value}
              disabled={saving !== null}
              onClick={() => void setPresence(p.value)}
              className={`h-chip flex-1 rounded-pill text-base font-bold transition-colors ${
                d.presence === p.value ? 'bg-finder-link text-finder-on-orange' : 'border-2 border-white/60 text-white'
              }`}
            >
              {saving === p.value ? '…' : p.label}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <p className="text-sm font-medium text-finder-muted">
          {data.schedule.hours_text} ·{' '}
          <Link to="/agent/hours" className="font-bold text-finder-link">
            Working hours
          </Link>
        </p>
        {d.source_text && <p className="text-xs font-medium text-finder-muted">{d.source_text}</p>}
      </Panel>

      <Panel aria-labelledby="customers-see">
        <Label id="customers-see">Customers now see</Label>
        {see.sides.length === 0 ? (
          <>
            <p className="text-md font-bold leading-tight">{see.headline}</p>
            <p className="text-sm font-medium text-finder-muted">{see.explanation}</p>
            {see.state === 'unlocated' && (
              <Link to="/agent/profile" className="mt-1 inline-flex h-chip w-fit items-center rounded-pill bg-finder-link px-5 text-base font-bold text-finder-on-orange">
                Pin my shop
              </Link>
            )}
          </>
        ) : (
          <>
            {see.sides.map((side) => (
              <div key={side.label} className="flex flex-col gap-1 py-1">
                <p className="text-xs font-bold uppercase tracking-wider text-finder-muted">{side.label}</p>
                <ServiceStatus outcome={side.range_text === 'no amount' ? 'limited' : 'likely'} text={`${side.phrase} · ${side.range_text}`} />
                {side.above_text && <p className="text-sm font-medium text-finder-muted">Above that: {side.above_text}</p>}
                {side.estimate_text && <p className="text-sm font-medium text-finder-muted">{side.estimate_text}</p>}
                {side.why && <p className="text-sm font-semibold text-warning">{side.why}</p>}
              </div>
            ))}
            <p className="text-xs font-medium text-finder-muted">{see.explanation}</p>
          </>
        )}
      </Panel>

      <Panel aria-labelledby="today">
        <Label id="today">Today</Label>
        <div className="flex divide-x divide-finder-line">
          <Figure label="Found you" value={String(data.today.found_you)} />
          <Figure label={data.today.transactions === null ? 'Logged by you' : 'Transactions'} value={String(data.today.transactions ?? data.today.logged)} />
          <Figure label="Reported a problem" value={String(data.today.reported_problems)} />
        </div>
        {data.pending_float && (
          <Link to="/agent/services" className="text-sm font-bold text-warning">
            Float request pending · see Services ›
          </Link>
        )}
      </Panel>

      {data.attention.map((sentence) => (
        <Panel key={sentence} className="border-l-4 border-danger" role="status">
          <p className="text-sm font-semibold">{sentence}</p>
        </Panel>
      ))}

      <Panel aria-labelledby="chart">
        <Label id="chart">{i ? `Your numbers for ${RANGE_TEXT[i.range]}` : 'Your numbers'}</Label>
        {i && (
          <p className="text-sm font-medium text-finder-muted">
            <span className="font-bold text-white">{i.found_total}</span> found you ({i.found_delta >= 0 ? '+' : ''}
            {i.found_delta} vs before) · status fresh <span className="font-bold text-white">{i.fresh_pct}%</span> of your open hours
          </p>
        )}
        <div role="tablist" aria-label="Range" className="flex h-[40px] rounded-field bg-finder-line">
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
        {insights.state === 'loading' && !i && <p className="py-6 text-center text-sm font-medium text-finder-muted">Loading…</p>}
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
                className: 'text-finder-link bg-finder-link',
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
                className: 'text-finder-likely bg-finder-likely',
                total: `${i.fresh_pct}%`,
              },
            ]}
          />
        )}
        <p className="text-xs font-medium text-finder-muted">
          Found you and transactions as a share of your best {range === 'today' || range === 'yesterday' ? 'hour' : 'day'}; status fresh as it is. Touch a point for the real numbers.
        </p>
      </Panel>

      <Panel aria-labelledby="timeline">
        <Label id="timeline">Today's timeline</Label>
        {events.state === 'loading' && <p className="py-2 text-sm font-medium text-finder-muted">Loading…</p>}
        {(events.data ?? []).length === 0 && events.state !== 'loading' && <p className="py-2 text-sm font-medium text-finder-muted">Nothing yet today.</p>}
        {(events.data ?? []).map((e) => (
          <div key={e.id} className="flex gap-3 border-b border-finder-line py-3 last:border-b-0">
            <span className="w-12 shrink-0 text-xs font-bold text-finder-muted">{e.time_text}</span>
            <span className="text-sm font-medium leading-snug">
              <span className={TONE[e.tone]}>{e.text}</span>
              <span className={`mt-1 block w-fit rounded-tag px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${e.source === 'operator' ? 'bg-finder-line text-finder-muted' : 'bg-finder-link text-finder-on-orange'}`}>
                {e.source === 'operator' ? 'Orange' : 'Agent app'}
              </span>
            </span>
          </div>
        ))}
      </Panel>

      <p className="text-center text-xs font-medium text-finder-muted">
        Transactions happen in Orange Money. This app keeps your availability, your float and what customers report.
      </p>
    </div>
  )
}
