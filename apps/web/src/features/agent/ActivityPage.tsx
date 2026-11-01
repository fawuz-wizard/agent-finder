import { useState } from 'react'
import { User } from 'lucide-react'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import { useSession } from '@/features/auth/session'
import type { AgentFeedback, AgentInsights, InsightRange } from '@/types/operator'
import { BOX } from './components/agentClasses'
import { formatSle } from './money'

const RANGES: { key: InsightRange; label: string; heading: string }[] = [
  { key: 'today', label: 'Today', heading: 'Today' },
  { key: 'week', label: 'Week', heading: 'This week' },
  { key: 'month', label: 'Month', heading: 'This month' },
]

const SHOWN = 3

/** One line of the dark card, each series on its own 0–max scale as the design draws them. */
function points(values: number[]): string {
  const max = Math.max(1, ...values)
  const min = Math.min(...values) * 0.6
  const n = values.length
  return values.map((v, i) => `${n <= 1 ? 150 : (i * 300) / (n - 1)},${(100 - ((v - min) / Math.max(1, max - min)) * 92).toFixed(1)}`).join(' ')
}

/** At most seven axis labels, the last one bright, as the design's M T W T F S S. */
function axis(labels: string[]): string[] {
  if (labels.length <= 7) return labels
  const step = (labels.length - 1) / 6
  return Array.from({ length: 7 }, (_, i) => labels[Math.round(i * step)]!)
}

/**
 * Activity, the new design's screen 14, nothing added: Today / Week / Month, the dark card
 * (three series with their totals, three lines, the axis), and "Recently found you". The
 * series are the agent's own records (transactions and the commission they earned, on the
 * indicative tariff) and the customers Agent Finder sent. The design names each customer and
 * says how far away; Agent Finder keeps customers anonymous, so each row is "A customer" with
 * the day, the transaction, and what they reported.
 */
export default function ActivityPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const [range, setRange] = useState<InsightRange>('week')
  const [all, setAll] = useState(false)
  const insights = useAsync<AgentInsights>((s) => operatorApi.insights(ref, range, s), [ref, range])
  const said = useAsync<AgentFeedback>((s) => operatorApi.feedback(ref, s), [ref])
  const i = insights.data
  const items = said.data?.items ?? []
  const shown = all ? items : items.slice(0, SHOWN)
  const heading = RANGES.find((r) => r.key === range)!.heading

  const series = i
    ? [
        { key: 'tx', label: 'Transactions', total: String(i.recorded_total ?? 0), values: i.points.map((p) => p.recorded ?? 0), dot: 'bg-finder-accent', stroke: 'stroke-finder-accent' },
        { key: 'com', label: 'Commission', total: formatSle(i.commission_total_sle ?? 0), values: i.points.map((p) => p.commission_sle ?? 0), dot: 'bg-agent-chart-green', stroke: 'stroke-agent-chart-green' },
        { key: 'found', label: 'People who found you', total: String(i.found_total), values: i.points.map((p) => p.found_you), dot: 'bg-agent-chart-blue', stroke: 'stroke-agent-chart-blue' },
      ]
    : []
  const labels = i ? axis(i.points.map((p) => p.label)) : []

  return (
    <div className="flex flex-1 flex-col gap-4 px-[18px] pb-8 pt-7 text-finder-ink">
      <h1 className="px-1 text-[21px] font-bold">Activity</h1>

      <div role="tablist" aria-label="Range" className="grid grid-cols-3 gap-1 rounded-[12px] bg-agent-chip p-1">
        {RANGES.map((r) => (
          <button key={r.key} type="button" role="tab" aria-selected={range === r.key} onClick={() => setRange(r.key)} className={`h-[34px] rounded-[9px] text-[13px] transition-colors duration-150 ${range === r.key ? 'bg-finder-card font-bold text-finder-ink shadow-sm' : 'font-semibold text-finder-muted'}`}>
            {r.label}
          </button>
        ))}
      </div>

      <section aria-labelledby="act-heading" className="flex flex-col gap-3.5 rounded-[16px] bg-finder-head p-4 text-white">
        <h2 id="act-heading" className="text-[13px] font-bold">
          {heading}
        </h2>
        {!i && <p className="py-10 text-center text-sm text-agent-head-sub">{insights.state === 'error' ? (insights.error ?? 'Could not load.') : 'Loading…'}</p>}
        {i && (
          <>
            <ul aria-label="Legend" className="flex flex-col gap-2">
              {series.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-xs">
                  <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
                  <span className="flex-1 text-agent-head-sub">{s.label}</span>
                  <b className="whitespace-nowrap font-extrabold">{s.total}</b>
                </li>
              ))}
            </ul>
            <div className="relative h-[120px] border-b border-agent-chart-line">
              <div aria-hidden className="absolute inset-x-0 top-0 border-t border-dashed border-agent-chart-grid" />
              <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-agent-chart-grid" />
              <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={`${heading}: ${series.map((s) => `${s.label} ${s.total}`).join(', ')}`}>
                {series.map((s) => (
                  <polyline key={s.key} points={points(s.values)} fill="none" className={s.stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
            </div>
            <div aria-hidden className="-mt-1.5 grid text-center text-[10px] text-agent-head-sub" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
              {labels.map((l, k) => (
                <span key={`${l}-${k}`} className={`${k === 0 ? 'text-left' : k === labels.length - 1 ? 'text-right font-bold text-white' : ''}`}>
                  {range === 'week' ? l.slice(0, 1) : l}
                </span>
              ))}
            </div>
            <table className="sr-only">
              <caption>{heading}</caption>
              <thead>
                <tr>
                  <th>When</th>
                  {series.map((s) => (
                    <th key={s.key}>{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {i.points.map((p, k) => (
                  <tr key={`${p.label}-${k}`}>
                    <td>{p.label}</td>
                    {series.map((s) => (
                      <td key={s.key}>{s.key === 'com' ? formatSle(s.values[k] ?? 0) : s.values[k]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section aria-labelledby="found-heading" className={`${BOX} flex flex-col px-4 pb-1 pt-1.5`}>
        <div className="flex items-center justify-between pb-1 pt-2.5">
          <h2 id="found-heading" className="text-sm font-bold">
            Recently found you
          </h2>
          {items.length > SHOWN && (
            <button type="button" onClick={() => setAll((v) => !v)} className="text-xs font-bold text-finder-link">
              {all ? 'Show less' : 'See all'}
            </button>
          )}
        </div>
        {said.state === 'loading' && !said.data && <p className="py-3 text-sm text-finder-muted">Loading…</p>}
        {said.data && items.length === 0 && <p className="py-3 text-sm text-finder-muted">No customer has reported a visit yet.</p>}
        {shown.map((x) => (
          <div key={x.id} className="flex items-center gap-3 border-b border-agent-divider py-3 last:border-b-0">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-agent-avatar text-agent-avatar-ink">
              <User size={16} strokeWidth={2.2} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="text-sm font-bold">A customer</span>
              <span className="truncate text-[11px] text-finder-muted">
                {x.day_text}
                {x.transaction_label ? ` · ${x.transaction_label}` : ''}
                {x.comment ? ` · “${x.comment}”` : ''}
              </span>
            </span>
            <span className={`shrink-0 text-xs font-semibold ${x.kind === 'not_served' ? 'text-danger' : 'text-finder-muted'}`}>{x.kind === 'not_served' ? 'Not served' : 'Commented'}</span>
          </div>
        ))}
      </section>
    </div>
  )
}
