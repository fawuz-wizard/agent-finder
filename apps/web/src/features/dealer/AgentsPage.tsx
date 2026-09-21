import { Link, useSearchParams } from 'react-router-dom'
import { Card, Chip } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { DealerAgentRow, DealerBucket } from '@/types/operator'

const TONE: Record<DealerAgentRow['presence'], string> = { open: 'text-success', hidden: 'text-warning', closed: 'text-muted' }

const FILTERS: { key: DealerBucket | 'all'; label: string; empty: string }[] = [
  { key: 'all', label: 'All', empty: 'No agents are registered under you yet.' },
  { key: 'active', label: 'Active', empty: 'No agent is open and fresh right now.' },
  { key: 'limited', label: 'Limited', empty: 'No agent is on Small or None right now.' },
  { key: 'hidden', label: 'Hidden', empty: 'Nobody is hidden right now.' },
  { key: 'closed', label: 'Closed', empty: 'Nobody is closed or stale right now.' },
]

function isBucket(v: string | null): v is DealerBucket {
  return v === 'active' || v === 'limited' || v === 'hidden' || v === 'closed'
}

/**
 * Agent register — every agent this dealer is responsible for, with their current word.
 * The dashboard tiles land here with ?filter=<bucket>; the chips are the same filter, and the
 * bucket comes from the server so a tile and its list can never disagree.
 */
export default function DealerAgentsPage() {
  const { data, state } = useAsync<DealerAgentRow[]>((s) => operatorApi.dealerAgents(s))
  const [params, setParams] = useSearchParams()
  const raw = params.get('filter')
  const filter: DealerBucket | 'all' = isBucket(raw) ? raw : 'all'
  const rows = data ?? []
  const shown = filter === 'all' ? rows : rows.filter((a) => a.bucket === filter)
  const count = (key: DealerBucket | 'all') => (key === 'all' ? rows.length : rows.filter((a) => a.bucket === key).length)

  function choose(key: DealerBucket | 'all') {
    setParams(key === 'all' ? {} : { filter: key }, { replace: true })
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-paper px-4 py-3">
        <h1 className="text-lg font-bold leading-tight">Agents</h1>
        <p className="text-xs text-muted">Registered under you · tap one to see their day</p>
      </header>
      <div className="flex gap-2 overflow-x-auto px-4 pt-3" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <Chip key={f.key} selected={filter === f.key} onClick={() => choose(f.key)} className="shrink-0">
            {f.label}
            {state === 'ready' && <span className="text-sm text-muted">{count(f.key)}</span>}
          </Chip>
        ))}
      </div>
      <div className="flex flex-col gap-3 p-4 pb-6">
        {state === 'loading' && <p className="text-sm text-muted">Loading…</p>}
        {state === 'ready' && shown.length === 0 && (
          <p className="text-sm text-muted">{FILTERS.find((f) => f.key === filter)?.empty}</p>
        )}
        {shown.map((a) => (
          <Link key={a.ref} to={`/dealer/agents/${encodeURIComponent(a.ref)}`}>
            <Card interactive className={a.attention ? 'border-l-4 border-l-warning' : ''}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-base font-bold">
                  {a.ref} · {a.name}
                </span>
                <span className="shrink-0 whitespace-nowrap text-xs text-muted">{a.freshness_text}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className={`font-bold ${TONE[a.presence]}`}>{a.presence_text}</span>
                <span className="text-muted">{a.declaration_text}</span>
              </div>
              <p className="text-xs text-muted">{a.area}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
