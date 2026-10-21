import { Link } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { FloatForecast, FloatRequest } from '@/types/operator'
import { formatSle } from '@/features/agent/money'
import { ChevronIcon, FinderBox, FinderHeader } from '@/features/end-user/components/finder'
import { SectionLabel } from '@/features/agent/components/agentChrome'
import { Tag } from './components/dealerChrome'

const STATE_TONE: Record<FloatRequest['state'], 'likely' | 'warning' | 'danger' | 'muted'> = {
  pending: 'warning',
  approved: 'likely',
  completed: 'likely',
  declined: 'danger',
  cancelled: 'muted',
}

const RISK_TONE: Record<FloatForecast['risk'], 'likely' | 'warning' | 'danger'> = {
  high: 'danger',
  medium: 'warning',
  low: 'likely',
}
const RISK_EDGE: Record<FloatForecast['risk'], string> = {
  high: 'border-l-4 border-danger',
  medium: 'border-l-4 border-warning',
  low: '',
}

/** One agent the forecast expects to run short, with the evidence it read. Never a balance. */
function ForecastRow({ f }: { f: FloatForecast }) {
  return (
    <FinderBox className={`flex flex-col gap-2 px-4 py-4 ${RISK_EDGE[f.risk]}`}>
      <Tag tone={RISK_TONE[f.risk]}>{f.headline}</Tag>
      <p className="text-base font-bold leading-tight">{f.agent_name}</p>
      <p className="-mt-1 text-sm font-bold text-finder-muted">{f.agent_ref.replace(/^Agent /, 'Code ')}</p>
      <ul className="list-disc pl-5 text-sm font-medium text-finder-muted">
        {f.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {f.call_url && (
        <a href={f.call_url} className="inline-flex h-chip w-fit items-center rounded-pill border-2 border-finder-ink px-5 text-base font-bold text-finder-ink">
          Call {f.agent_name}
        </a>
      )}
    </FinderBox>
  )
}

/** A request as a row: the shop, the code, the amount, how long it has waited or how it ended. */
function RequestRow({ r }: { r: FloatRequest }) {
  const edge = r.ageing ? 'bg-warning' : r.state === 'pending' ? 'bg-finder-accent' : 'bg-finder-muted'
  return (
    <Link to={`/dealer/float/${r.id}`} className={`relative block rounded-panel ${edge}`}>
      <span className="ml-[9px] flex items-center gap-3 rounded-panel bg-finder-bg px-4 py-3 text-finder-ink shadow-inset-finder">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold leading-tight">{r.agent_name}</span>
          <span className="block text-sm font-bold text-finder-muted">{r.agent_ref.replace(/^Agent /, 'Code ')}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <Tag tone={r.ageing ? 'warning' : STATE_TONE[r.state]}>{r.ageing ? 'ageing' : r.state}</Tag>
            <span className="text-xs font-medium text-finder-muted">
              {r.state === 'pending' ? `waiting ${r.waiting_text}` : new Date(r.requested_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-base font-bold">{formatSle(r.amount_sle)}</span>
        <span className="shrink-0 text-finder-link">
          <ChevronIcon />
        </span>
      </span>
    </Link>
  )
}

/**
 * Float requests. First who will probably run short by tomorrow (the forecast, a ranking
 * with reasons the aggregator can check), then waiting requests oldest first, decided ones
 * below. Opens from the Dashboard; nothing expires silently.
 */
export default function DealerFloatQueuePage() {
  const { data, state } = useAsync<FloatRequest[]>((s) => operatorApi.floatRequests(null, s))
  const forecast = useAsync<FloatForecast[]>((s) => operatorApi.floatForecast(s))
  const atRisk = (forecast.data ?? []).filter((f) => f.risk !== 'low')
  const fine = (forecast.data ?? []).length - atRisk.length
  const all = data ?? []
  const waiting = all.filter((r) => r.state === 'pending').sort((a, b) => new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime())
  const decided = all.filter((r) => r.state !== 'pending')

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <FinderHeader title="Float requests" />
      <p className="mt-4 text-sm font-medium text-finder-muted">{waiting.length} waiting · nothing expires silently</p>

      <section aria-labelledby="forecast-heading" className="mt-6 flex flex-col gap-3">
        <SectionLabel id="forecast-heading">Likely to run short · {atRisk.length}</SectionLabel>
        {atRisk.map((f) => (
          <ForecastRow key={f.agent_ref} f={f} />
        ))}
        {forecast.state === 'ready' && atRisk.length === 0 && <p className="text-base font-medium text-finder-muted">Nobody looks short right now.</p>}
        {forecast.state === 'ready' && fine > 0 && (
          <p className="text-xs font-medium text-finder-muted">
            {fine} agent{fine === 1 ? '' : 's'} fine for now. Learned from confirmed visits, the agents' own words and failed visits. Nothing is read from Orange Money and nothing is decided for you.
          </p>
        )}
      </section>

      <div className="mt-6 flex flex-col gap-3">
        <SectionLabel>Waiting</SectionLabel>
        {state === 'loading' && <p className="text-base font-medium text-finder-muted">Loading…</p>}
        {waiting.map((r) => (
          <RequestRow key={r.id} r={r} />
        ))}
        {waiting.length === 0 && state === 'ready' && <p className="text-base font-medium text-finder-muted">Nothing waiting.</p>}
      </div>

      {decided.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          <SectionLabel>Decided</SectionLabel>
          {decided.map((r) => (
            <RequestRow key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  )
}
