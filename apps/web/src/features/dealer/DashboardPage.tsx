import { Link } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { DealerBucket, DealerOverview } from '@/types/operator'
import { formatSle } from '@/features/agent/money'
import { FinderBox, FinderCta, FinderHeader, ChevronIcon } from '@/features/end-user/components/finder'
import { SectionLabel } from '@/features/agent/components/agentChrome'

/** A count that is also a filter: tapping it opens the register showing exactly these agents. */
function Tile({ bucket, label, value, sub, tone }: { bucket: DealerBucket; label: string; value: number; sub: string; tone: string }) {
  return (
    <Link to={`/dealer/agents?filter=${bucket}`} className="flex flex-1" aria-label={`${label}: ${value} — see these agents`}>
      <FinderBox className="flex flex-1 flex-col gap-0.5 px-4 py-3">
        <span className="text-sm font-bold uppercase text-finder-muted">{label}</span>
        <span className={`text-3xl font-bold leading-none ${tone}`}>{value}</span>
        <span className="text-xs font-semibold text-finder-muted">{sub}</span>
      </FinderBox>
    </Link>
  )
}

/** One thing to do: a row in the finder's frame with the orange edge, the whole row a link. */
function TodoRow({ to, title, sub, detail, right, tone = 'bg-finder-link' }: { to: string; title: string; sub: string; detail?: string | undefined; right?: string | undefined; tone?: string }) {
  return (
    <Link to={to} className={`relative block rounded-panel ${tone}`}>
      <span className="ml-[9px] flex items-center gap-3 rounded-panel bg-finder-bg px-4 py-3 text-white shadow-inset-finder">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold leading-tight">{title}</span>
          <span className="block truncate text-sm font-semibold text-finder-muted">{sub}</span>
          {detail && <span className="block text-sm font-medium text-finder-muted">{detail}</span>}
        </span>
        {right && <span className="shrink-0 text-base font-bold">{right}</span>}
        <span className="shrink-0 text-finder-link">
          <ChevronIcon />
        </span>
      </span>
    </Link>
  )
}

/**
 * Dashboard. Answers one question on open: what is happening with all my agents? Four
 * counts that are filters on the register, how many shops customers can be sent to, then
 * the things a person can act on today: float requests to decide, pins to confirm, signals
 * to look into. No balance or float figure appears here; a request's amount is the agent's
 * own statement.
 */
export default function DealerDashboardPage() {
  const { state, data, error, refresh } = useAsync<DealerOverview>((s) => operatorApi.dealerOverview(s))

  if (state === 'loading' && !data)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 text-white">
        <FinderHeader title="Dashboard" />
        <p className="text-base font-medium text-finder-muted">Loading your agents…</p>
      </div>
    )
  if (!data)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 text-white">
        <FinderHeader title="Dashboard" />
        <p className="text-base font-semibold text-danger">{error}</p>
        <FinderCta onClick={refresh}>Try again</FinderCta>
      </div>
    )

  const todo = data.float_requests.length + data.pins_waiting.length + data.signals.length
  const today = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-white">
      <FinderHeader title="Dashboard" />

      <p className="mt-6 text-xl font-bold leading-tight">{data.agent_count} agents</p>
      <p className="mt-1 text-sm font-medium text-finder-muted">
        {today} · {data.on_map} of {data.agent_count} on the map for customers
      </p>

      <div className="mt-5 flex gap-3">
        <Tile bucket="active" label="Active" value={data.counts.active} sub="open, fresh" tone="text-finder-likely" />
        <Tile bucket="limited" label="Limited" value={data.counts.limited} sub="small or none" tone="text-warning" />
      </div>
      <div className="mt-3 flex gap-3">
        <Tile bucket="hidden" label="Away" value={data.counts.hidden} sub="paused themselves" tone="text-finder-muted" />
        <Tile bucket="closed" label="Closed" value={data.counts.closed} sub="outside hours or stale" tone="text-danger" />
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <SectionLabel id="todo-heading">To do · {todo}</SectionLabel>

        <p className="text-sm font-bold text-finder-muted">Float requests · {data.float_requests.length} waiting</p>
        {data.float_requests.slice(0, 3).map((r) => (
          <TodoRow
            key={r.id}
            to={`/dealer/float/${r.id}`}
            title={r.agent_name}
            sub={`${r.agent_ref.replace(/^Agent /, 'Code ')} · float request`}
            detail={`waiting ${r.waiting_text}${r.ageing ? ' · ageing' : ''}`}
            right={formatSle(r.amount_sle)}
            tone={r.ageing ? 'bg-warning' : 'bg-finder-link'}
          />
        ))}
        {data.float_requests.length > 3 && (
          <Link to="/dealer/float" className="flex h-control items-center text-base font-bold text-finder-link">
            {data.float_requests.length - 3} more float requests ›
          </Link>
        )}

        {data.pins_waiting.length > 0 && (
          <p className="text-sm font-bold text-finder-muted">Pins waiting for your confirmation · {data.pins_waiting.length}</p>
        )}
        {data.pins_waiting.map((w) => (
          <TodoRow key={w.ref} to={`/dealer/agents/${encodeURIComponent(w.ref)}`} title={w.name} sub={`${w.ref.replace(/^Agent /, 'Code ')} · pinned by ${w.person_name}`} detail={w.area} />
        ))}

        <p className="text-sm font-bold text-finder-muted">Needs attention · {data.signals.length}</p>
        {data.signals.slice(0, 5).map((s) => (
          <TodoRow
            key={s.id}
            to={`/dealer/attention/${s.id}`}
            title={s.title}
            sub={`${s.agent_name} · ${s.agent_ref.replace(/^Agent /, 'Code ')}`}
            detail={s.sentence}
            tone={s.severity === 'high' ? 'bg-danger' : s.severity === 'medium' ? 'bg-warning' : 'bg-finder-muted'}
          />
        ))}
        {data.signals.length > 5 && (
          <Link to="/dealer/attention" className="flex h-control items-center text-base font-bold text-finder-link">
            {data.signals.length - 5} more to look into ›
          </Link>
        )}

        {todo === 0 && (
          <FinderBox className="px-5 py-4">
            <p className="text-base font-bold">Nothing waiting.</p>
            <p className="text-sm font-medium text-finder-muted">No float request, no pin to confirm, nothing that needs attention right now.</p>
          </FinderBox>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <SectionLabel id="forecast-heading">Float forecast</SectionLabel>
        <Link to="/dealer/float" aria-label={`Float forecast: ${data.forecast_counts.high} likely short by tomorrow — see the reasons`}>
          <FinderBox className="flex items-center gap-3 px-5 py-4">
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold">
                {data.forecast_counts.high} likely short by tomorrow
                <span className="font-semibold text-finder-muted"> · {data.forecast_counts.medium} to watch</span>
              </span>
              <span className="block text-sm font-medium text-finder-muted">From confirmed visits and the agents' own words.</span>
            </span>
            <span className="shrink-0 text-finder-link">
              <ChevronIcon />
            </span>
          </FinderBox>
        </Link>
      </div>

      <p className="mt-6 text-center text-xs font-medium text-finder-muted">Signals are for looking into, not punishing. No automatic action is ever taken.</p>
    </div>
  )
}
