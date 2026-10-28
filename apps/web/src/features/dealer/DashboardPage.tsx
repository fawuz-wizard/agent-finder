import { Link } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { DealerBucket, DealerOverview } from '@/types/operator'
import { formatSle } from '@/features/agent/money'
import { FinderCta, ChevronIcon } from '@/features/end-user/components/finder'
import { SectionLabel } from '@/features/agent/components/agentChrome'

/** A count that is also a filter: tapping it opens the register showing exactly these agents. */
function Count({ bucket, label, value, tone }: { bucket: DealerBucket; label: string; value: number; tone: string }) {
  return (
    <Link to={`/dealer/agents?filter=${bucket}`} className="flex flex-1 flex-col gap-1 border-l border-finder-line pl-3 first:border-l-0 first:pl-0" aria-label={`${label}: ${value} — see these agents`}>
      <span className={`text-2xl font-bold leading-none ${tone}`}>{value}</span>
      <span className="text-xs font-semibold text-finder-muted">{label}</span>
    </Link>
  )
}

/** One thing to do, as a row: the whole row a link, a hairline under, a coloured rule for a signal. */
function TodoLine({ to, title, sub, detail, right, rule, label }: { to: string; title: string; sub: string; detail?: string | undefined; right?: string | undefined; rule?: string | undefined; label?: string | undefined }) {
  return (
    <Link to={to} aria-label={label} className={`flex items-center gap-3 border-b border-finder-line py-3 text-finder-ink last:border-b-0 ${rule ? `border-l-[3px] pl-3 ${rule}` : ''}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold leading-snug">{title}</span>
        <span className="block text-sm font-medium text-finder-muted">{sub}</span>
        {detail && <span className="line-clamp-2 block text-sm font-medium text-finder-muted">{detail}</span>}
      </span>
      {right && <span className="shrink-0 text-base font-bold">{right}</span>}
      <span className="shrink-0 text-finder-link">
        <ChevronIcon />
      </span>
    </Link>
  )
}

/**
 * Dashboard. Answers one question on open: what is happening with all my agents? Four
 * counts in one line, each a filter on the register; then the things a person can act on
 * today as rows: float requests to decide, pins to confirm, signals to look into, and the
 * float forecast. No balance or float figure appears here; a request's amount is the
 * agent's own statement.
 */
export default function DealerDashboardPage() {
  const { state, data, error, refresh } = useAsync<DealerOverview>((s) => operatorApi.dealerOverview(s))

  if (state === 'loading' && !data)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 pt-6 text-finder-ink">
        <p className="text-base font-medium text-finder-muted">Loading your agents…</p>
      </div>
    )
  if (!data)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 pt-6 text-finder-ink">
        <p className="text-base font-semibold text-danger">{error}</p>
        <FinderCta onClick={refresh}>Try again</FinderCta>
      </div>
    )

  const todo = data.float_requests.length + data.pins_waiting.length + data.signals.length
  const today = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
  const code = (ref: string) => ref.replace(/^Agent /, '')

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <h1 className="mt-6 text-lg font-bold leading-tight">{data.agent_count} agents</h1>
      <p className="mt-1 text-sm font-medium text-finder-muted">
        {today} · {data.on_map} of {data.agent_count} on the map for customers
      </p>
      {data.not_signed_in > 0 && (
        <p className="mt-1 text-sm font-medium text-warning">
          {data.not_signed_in} {data.not_signed_in === 1 ? 'agent has' : 'agents have'} not signed in yet. Give them their code; customers see them once they are pinned and open.
        </p>
      )}

      <Link to="/dealer/map" className="mt-3 flex h-control items-center text-base font-bold text-finder-link">
        Network map: your agents by town and region ›
      </Link>

      <div className="mt-5 flex">
        <Count bucket="active" label="Active" value={data.counts.active} tone="text-finder-likely" />
        <Count bucket="limited" label="Limited" value={data.counts.limited} tone="text-warning" />
        <Count bucket="hidden" label="Away" value={data.counts.hidden} tone="text-finder-muted" />
        <Count bucket="closed" label="Closed" value={data.counts.closed} tone="text-danger" />
      </div>

      <SectionLabel className="mt-8" id="todo-heading">
        Float requests · {data.float_requests.length} waiting
      </SectionLabel>
      <div className="mt-1 flex flex-col">
        {data.float_requests.slice(0, 3).map((r) => (
          <TodoLine key={r.id} to={`/dealer/float/${r.id}`} title={r.agent_name} sub={`${code(r.agent_ref)} · waiting ${r.waiting_text}${r.ageing ? ' · ageing' : ''}`} right={formatSle(r.amount_sle)} />
        ))}
        {data.float_requests.length === 0 && <p className="py-3 text-sm font-medium text-finder-muted">None waiting.</p>}
      </div>
      {data.float_requests.length > 3 && (
        <Link to="/dealer/float" className="flex h-control items-center text-base font-bold text-finder-link">
          {data.float_requests.length - 3} more float requests ›
        </Link>
      )}

      {data.pins_waiting.length > 0 && (
        <>
          <SectionLabel className="mt-8">Pins waiting for your confirmation · {data.pins_waiting.length}</SectionLabel>
          <div className="mt-1 flex flex-col">
            {data.pins_waiting.map((w) => (
              <TodoLine key={w.ref} to={`/dealer/agents/${encodeURIComponent(w.ref)}`} title={w.name} sub={`${code(w.ref)} · pinned by ${w.person_name}`} detail={w.area} />
            ))}
          </div>
        </>
      )}

      <SectionLabel className="mt-8">Needs attention · {data.signals.length}</SectionLabel>
      <div className="mt-1 flex flex-col">
        {data.signals.slice(0, 5).map((s) => (
          <TodoLine
            key={s.id}
            to={`/dealer/attention/${s.id}`}
            title={s.title}
            sub={`${s.agent_name} · ${code(s.agent_ref)}`}
            detail={s.sentence}
            rule={s.severity === 'high' ? 'border-l-danger' : s.severity === 'medium' ? 'border-l-warning' : 'border-l-finder-muted'}
          />
        ))}
        {data.signals.length === 0 && <p className="py-3 text-sm font-medium text-finder-muted">Nothing to look into.</p>}
      </div>
      {data.signals.length > 5 && (
        <Link to="/dealer/attention" className="flex h-control items-center text-base font-bold text-finder-link">
          {data.signals.length - 5} more to look into ›
        </Link>
      )}
      {todo === 0 && <p className="mt-2 text-sm font-medium text-finder-muted">No float request, no pin to confirm, nothing that needs attention right now.</p>}

      <SectionLabel className="mt-8" id="forecast-heading">
        Float forecast
      </SectionLabel>
      <div className="mt-1 flex flex-col">
        <TodoLine
          to="/dealer/float"
          label={`Float forecast: ${data.forecast_counts.high} likely short by tomorrow — see the reasons`}
          title={`${data.forecast_counts.high} likely short by tomorrow`}
          sub={`${data.forecast_counts.medium} to watch · from confirmed visits and the agents' own words`}
        />
      </div>

    </div>
  )
}
