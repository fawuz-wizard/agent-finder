import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import { useSession } from '@/features/auth/session'
import { PRESENCE_LABELS } from '@/types/operator'
import type { ActivityEvent, AgentHome, AgentInsights, InsightRange, Presence } from '@/types/operator'
import { ServiceStatus } from '@/features/end-user/components/ServiceStatus'
import { FinderBox, FinderCta, FinderHeader } from '@/features/end-user/components/finder'
import { ThreeLines } from './components/charts'
import { EdgeCard, Panel, PILL_OFF, PILL_ON, PlaceRow, SectionLabel } from './components/agentChrome'

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
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <span className="text-3xl font-bold leading-none text-white">{value}</span>
      <span className="text-center text-sm font-semibold text-finder-muted">{label}</span>
    </div>
  )
}

/**
 * Dashboard: the screen the agent opens twenty times a day, drawn with the finder's own
 * pieces. Where you are and your hours at the top, then "Are you open?" as the one
 * question, what customers see right now as the very cards they see, today's figures, the
 * chart and the timeline. Nothing to refresh, no word to pick.
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

  if (home.state === 'loading')
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 text-white">
        <FinderHeader title="Dashboard" />
        <p className="text-base font-medium text-finder-muted">Loading your day…</p>
      </div>
    )
  if (home.state === 'error' || !home.data)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 text-white">
        <FinderHeader title="Dashboard" />
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
    <div className="flex flex-1 flex-col px-5 pb-8 text-white">
      <FinderHeader title="Dashboard" />

      <div className="mt-6">
        <PlaceRow
          name={data.name}
          sub={<>{data.ref} · {data.area}</>}
          action={
            <Link to="/agent/hours" aria-label="Working hours" className="flex h-control items-center">
              Hours
            </Link>
          }
        />
      </div>
      <p className="mt-1 text-sm font-medium text-finder-muted">{data.schedule.hours_text}</p>

      {data.schedule.notice && (
        <EdgeCard className="mt-4" role="status">
          <p className="text-base font-bold">{data.schedule.notice}</p>
          <button type="button" onClick={stayOpen} disabled={saving !== null} className="h-control self-start text-base font-bold text-finder-link">
            {saving === 'extend' ? 'Saving…' : 'Stay open 1 more hour'}
          </button>
        </EdgeCard>
      )}

      <h1 className="mt-6 text-xl font-bold leading-tight">Are you open?</h1>
      <div role="radiogroup" aria-label="Are you open?" className="mt-5 flex gap-3">
        {PRESENCE.map((p) => (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={d.presence === p.value}
            disabled={saving !== null}
            onClick={() => void setPresence(p.value)}
            className={`h-[50px] flex-1 rounded-pill text-base font-bold transition-colors ${d.presence === p.value ? PILL_ON : PILL_OFF}`}
          >
            {saving === p.value ? '…' : p.label}
          </button>
        ))}
      </div>
      <p className={`mt-3 text-base font-bold ${presenceTone}`}>{PRESENCE_LABELS[d.presence]}</p>
      {d.source_text && <p className="mt-0.5 text-sm font-medium text-finder-muted">{d.source_text}</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3">
        <SectionLabel id="customers-see">Customers now see</SectionLabel>
        {see.sides.length === 0 ? (
          <EdgeCard>
            <p className="text-md font-bold leading-tight">{see.headline}</p>
            <p className="text-sm font-medium text-finder-muted">{see.explanation}</p>
            {see.state === 'unlocated' && (
              <Link to="/agent/profile" className={`inline-flex h-chip w-fit items-center rounded-pill px-5 text-base font-bold ${PILL_ON}`}>
                Pin my shop
              </Link>
            )}
          </EdgeCard>
        ) : (
          <>
            {see.sides.map((side) => (
              <EdgeCard key={side.label}>
                <div className="flex items-baseline gap-3">
                  <p className="min-w-0 text-md font-bold leading-tight">{side.label}</p>
                  <p className="ml-auto shrink-0 text-md font-bold text-finder-muted">{side.range_text}</p>
                </div>
                <div className="mt-1">
                  <ServiceStatus outcome={side.range_text === 'no amount' ? 'limited' : 'likely'} text={side.phrase} />
                </div>
                {side.above_text && <p className="text-sm font-bold text-finder-muted">Above that: {side.above_text}</p>}
                {side.estimate_text && <p className="text-sm font-medium text-finder-muted">{side.estimate_text}</p>}
                {side.why && <p className="text-sm font-semibold text-warning">{side.why}</p>}
              </EdgeCard>
            ))}
            <p className="text-sm font-medium text-finder-muted">{see.explanation}</p>
          </>
        )}
      </div>

      <SectionLabel className="mt-6">Today</SectionLabel>
      <FinderBox className="mt-3 flex min-h-[60px] items-center divide-x divide-finder-line px-2 py-4">
        <Figure label="Found you" value={String(data.today.found_you)} />
        <Figure label={data.today.transactions === null ? 'Logged by you' : 'Transactions'} value={String(data.today.transactions ?? data.today.logged)} />
        <Figure label="Reported a problem" value={String(data.today.reported_problems)} />
      </FinderBox>
      {data.pending_float && (
        <FinderBox className="mt-3 flex min-h-[60px] items-center justify-between gap-3 px-5 py-2">
          <span className="text-base font-bold">Float request</span>
          <Link to="/agent/services" className="text-base font-bold text-finder-link">
            Pending ›
          </Link>
        </FinderBox>
      )}
      {data.attention.map((sentence) => (
        <FinderBox key={sentence} className="mt-3 border-l-4 border-danger px-5 py-4" role="status">
          <p className="text-base font-bold">{sentence}</p>
        </FinderBox>
      ))}

      <SectionLabel className="mt-6">Your numbers</SectionLabel>
      <Panel className="mt-3" aria-labelledby="chart">
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
