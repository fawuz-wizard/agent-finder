import { Link } from 'react-router-dom'
import { Card } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { DealerBucket, DealerOverview } from '@/types/operator'
import { formatSle } from '@/features/agent/money'

/** A count that is also a filter: tapping it opens the register showing exactly these agents. */
function Tile({ bucket, label, value, sub, tone }: { bucket: DealerBucket; label: string; value: number; sub: string; tone: string }) {
  return (
    <Link to={`/dealer/agents?filter=${bucket}`} className="flex flex-1" aria-label={`${label}: ${value} — see these agents`}>
      <Card interactive className="flex-1 gap-0.5 px-3 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
        <p className={`text-3xl font-bold leading-none ${tone}`}>{value}</p>
        <p className="text-xs text-muted">{sub}</p>
      </Card>
    </Link>
  )
}

/**
 * D1 — Dashboard. Answers one question on open: what is happening with all my agents?
 * Four counts, then the things a human can act on today — requests to decide and
 * signals to investigate. No financial value appears on this screen.
 */
export default function DealerDashboardPage() {
  const { state, data, error, refresh } = useAsync<DealerOverview>((s) => operatorApi.dealerOverview(s))

  if (state === 'loading' && !data) return <p className="p-4 text-base text-muted">Loading your agents…</p>
  if (!data)
    return (
      <div className="p-4">
        <p className="text-base font-semibold text-danger">{error}</p>
        <button type="button" onClick={refresh} className="mt-2 text-base font-bold text-brand-text">
          Try again
        </button>
      </div>
    )

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-paper px-4 py-3">
        <h1 className="text-lg font-bold leading-tight">Your agents</h1>
        <p className="text-xs text-muted">
          {data.dealer_name} · {data.agent_count} agents ·{' '}
          {new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </header>

      <div className="flex flex-col gap-3 p-4 pb-6">
        <div className="flex gap-2">
          <Tile bucket="active" label="Active" value={data.counts.active} sub="open, fresh" tone="text-success" />
          <Tile bucket="limited" label="Limited" value={data.counts.limited} sub="small or none" tone="text-warning" />
        </div>
        <div className="flex gap-2">
          <Tile bucket="hidden" label="Hidden" value={data.counts.hidden} sub="paused themselves" tone="text-muted" />
          <Tile bucket="closed" label="Closed" value={data.counts.closed} sub="outside hours or stale" tone="text-danger" />
        </div>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Float requests · {data.float_requests.length} waiting</p>
            <Link to="/dealer/float" className="-my-2 -mr-2 flex h-control items-center rounded-card px-2 text-sm font-bold text-brand-text">
              See all
            </Link>
          </div>
          {data.float_requests.slice(0, 3).map((r) => (
            <Link key={r.id} to={`/dealer/float/${r.id}`} className="flex items-center justify-between border-b border-line py-2.5 last:border-b-0">
              <span>
                <span className="block text-sm font-bold">
                  {r.agent_ref} · {r.agent_name}
                </span>
                <span className="text-xs text-muted">
                  waiting {r.waiting_text}
                  {r.ageing && <span className="ml-2 rounded-pill bg-warning-tint px-2 py-0.5 text-[10px] font-bold text-warning">ageing</span>}
                </span>
              </span>
              <span className="text-sm font-bold">{formatSle(r.amount_sle)}</span>
            </Link>
          ))}
          {data.float_requests.length === 0 && <p className="py-2 text-sm text-muted">Nothing waiting.</p>}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Needs attention · {data.signals.length}</p>
            <Link to="/dealer/attention" className="-my-2 -mr-2 flex h-control items-center rounded-card px-2 text-sm font-bold text-brand-text">
              See all
            </Link>
          </div>
          {data.signals.map((s) => (
            <Link key={s.id} to={`/dealer/attention/${s.id}`} className="flex gap-3 border-b border-line py-2.5 last:border-b-0">
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                  s.severity === 'high' ? 'bg-danger-tint text-danger' : s.severity === 'medium' ? 'bg-warning-tint text-warning' : 'bg-canvas text-muted'
                }`}
              >
                !
              </span>
              <span>
                <span className="block text-sm font-bold">
                  {s.agent_ref} — {s.title}
                </span>
                <span className="text-xs text-muted">{s.sentence}</span>
              </span>
            </Link>
          ))}
          {data.signals.length === 0 && <p className="py-2 text-sm text-muted">Nothing needs attention right now.</p>}
        </Card>

        <p className="text-center text-xs text-muted">Signals are for investigating, not punishing. No automatic action is ever taken.</p>
      </div>
    </div>
  )
}
