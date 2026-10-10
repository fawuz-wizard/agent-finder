import { Link } from 'react-router-dom'
import { Card, AppBar } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { FloatForecast, FloatRequest } from '@/types/operator'
import { formatSle } from '@/features/agent/money'

const STATE: Record<FloatRequest['state'], string> = {
  pending: 'bg-warning-tint text-warning',
  approved: 'bg-success-tint text-success',
  completed: 'bg-success-tint text-success',
  declined: 'bg-danger-tint text-danger',
  cancelled: 'bg-canvas text-muted',
}

const RISK: Record<FloatForecast['risk'], string> = {
  high: 'bg-danger-tint text-danger',
  medium: 'bg-warning-tint text-warning',
  low: 'bg-success-tint text-success',
}

/** One agent the forecast expects to run short, with the evidence it read. Never a balance. */
function ForecastRow({ f }: { f: FloatForecast }) {
  return (
    <Card>
      <span className={`w-fit rounded-pill px-2.5 py-0.5 text-xs font-bold ${RISK[f.risk]}`}>{f.headline}</span>
      <p className="text-base font-bold leading-tight">{f.agent_name}</p>
      <p className="text-sm text-muted">{f.agent_ref.replace(/^Agent /, 'Code ')}</p>
      <ul className="mt-1 list-disc pl-5 text-sm text-muted">
        {f.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {f.call_url && (
        <a href={f.call_url} className="mt-1 inline-flex h-control w-fit items-center border-2 border-ink px-4 text-sm font-bold text-ink">
          Call {f.agent_name}
        </a>
      )}
    </Card>
  )
}

/**
 * D3 — Float queue. First who will probably run short by tomorrow (the forecast, a ranking
 * with reasons the dealer can check), then waiting requests oldest first, decided ones below.
 */
export default function DealerFloatQueuePage() {
  const { data, state } = useAsync<FloatRequest[]>((s) => operatorApi.floatRequests(null, s))
  const forecast = useAsync<FloatForecast[]>((s) => operatorApi.floatForecast(s))
  const atRisk = (forecast.data ?? []).filter((f) => f.risk !== 'low')
  const fine = (forecast.data ?? []).length - atRisk.length
  const all = data ?? []
  const waiting = all.filter((r) => r.state === 'pending').sort((a, b) => new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime())
  const decided = all.filter((r) => r.state !== 'pending')

  const Row = ({ r }: { r: FloatRequest }) => (
    <Link to={`/dealer/float/${r.id}`}>
      <Card interactive>
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-base font-bold leading-tight">{r.agent_name}</span>
            <span className="text-sm text-muted">{r.agent_ref.replace(/^Agent /, 'Code ')}</span>
          </span>
          <span className="shrink-0 text-base font-bold">{formatSle(r.amount_sle)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            {r.state === 'pending' ? `waiting ${r.waiting_text}` : new Date(r.requested_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
          </span>
          <span className={`rounded-pill px-2.5 py-0.5 text-[0.75rem] font-bold ${r.ageing ? 'bg-warning-tint text-warning' : STATE[r.state]}`}>
            {r.ageing ? 'ageing' : r.state}
          </span>
        </div>
      </Card>
    </Link>
  )

  return (
    <div className="flex flex-1 flex-col">
      <AppBar title="Float requests" subtitle={<>{waiting.length} waiting · nothing expires silently</>} />
      <div className="flex flex-col gap-3 p-4 pb-6">
        <section aria-labelledby="forecast-heading" className="flex flex-col gap-3">
          <h2 id="forecast-heading" className="text-xs font-bold uppercase tracking-wider text-muted">
            Likely to run short · {atRisk.length}
          </h2>
          {atRisk.map((f) => (
            <ForecastRow key={f.agent_ref} f={f} />
          ))}
          {forecast.state === 'ready' && atRisk.length === 0 && <p className="text-sm text-muted">Nobody looks short right now.</p>}
          {forecast.state === 'ready' && fine > 0 && (
            <p className="text-xs text-muted">
              {fine} agent{fine === 1 ? '' : 's'} fine for now. Learned from confirmed visits, the agents' own words and failed visits. Nothing is read from Orange Money and nothing is decided for you.
            </p>
          )}
        </section>
        <p className="mt-2 text-xs font-bold uppercase tracking-wider text-muted">Waiting</p>
        {state === 'loading' && <p className="text-sm text-muted">Loading…</p>}
        {waiting.map((r) => (
          <Row key={r.id} r={r} />
        ))}
        {waiting.length === 0 && state === 'ready' && <p className="text-sm text-muted">Nothing waiting.</p>}
        {decided.length > 0 && <p className="mt-2 text-xs font-bold uppercase tracking-wider text-muted">Decided</p>}
        {decided.map((r) => (
          <Row key={r.id} r={r} />
        ))}
      </div>
    </div>
  )
}
