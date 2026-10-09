import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, Chip, AppBar, BarAction } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS } from '@/types/operator'
import type { DealerAgentRow, DealerBucket } from '@/types/operator'

const PRESENCE_PILL: Record<DealerAgentRow['presence'], string> = {
  open: 'bg-success-tint text-success',
  hidden: 'bg-warning-tint text-warning',
  closed: 'bg-canvas text-muted',
}
const RELIABILITY: Record<DealerAgentRow['reliability']['label'], string> = {
  reliable: 'bg-success-tint text-success',
  mixed: 'bg-warning-tint text-warning',
  unreliable: 'bg-danger-tint text-danger',
  new: 'bg-canvas text-muted',
}

const FILTERS: { key: DealerBucket | 'all'; label: string; empty: string }[] = [
  { key: 'all', label: 'All', empty: 'No agents are assigned to you yet.' },
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
  const { can } = useSession()
  const [params, setParams] = useSearchParams()
  const raw = params.get('filter')
  const filter: DealerBucket | 'all' = isBucket(raw) ? raw : 'all'
  const [query, setQuery] = useState('')
  const rows = data ?? []
  const q = query.trim().toLowerCase()
  const matches = (a: DealerAgentRow) =>
    !q || a.name.toLowerCase().includes(q) || a.ref.toLowerCase().includes(q) || a.area.toLowerCase().includes(q)
  const shown = (filter === 'all' ? rows : rows.filter((a) => a.bucket === filter)).filter(matches)
  const count = (key: DealerBucket | 'all') => (key === 'all' ? rows.length : rows.filter((a) => a.bucket === key).length)

  function choose(key: DealerBucket | 'all') {
    setParams(key === 'all' ? {} : { filter: key }, { replace: true })
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppBar
        title="Agents"
        subtitle={<>Assigned to you · tap one for their day</>}
        action={can(PERMISSIONS.manageAgent) ? <BarAction to="/dealer/agents/new">Register</BarAction> : undefined}
      />
      <div className="px-4 pt-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find by name, code or street"
          aria-label="Find an agent"
          className="h-control w-full rounded-card border-2 border-line bg-paper px-3 text-base outline-none placeholder:text-muted focus:border-ink"
        />
      </div>
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
          <p className="text-sm text-muted">{q ? 'No agent matches that.' : FILTERS.find((f) => f.key === filter)?.empty}</p>
        )}
        {shown.map((a) => (
          <Link key={a.ref} to={`/dealer/agents/${encodeURIComponent(a.ref)}`} className="block">
            <Card interactive className={`gap-2 ${a.attention ? 'border-l-4 border-l-warning' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold leading-tight">{a.name}</p>
                  <p className="text-sm text-muted">
                    {a.ref.replace(/^Agent /, 'Code ')} · {a.area}
                  </p>
                </div>
                <span className="shrink-0 pt-0.5 text-xs font-semibold text-muted">{a.freshness_text}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`rounded-pill px-2.5 py-0.5 text-xs font-bold ${PRESENCE_PILL[a.presence]}`}>{a.presence_text}</span>
                <span className={`rounded-pill px-2.5 py-0.5 text-xs font-bold ${RELIABILITY[a.reliability.label]}`} title={a.reliability.text}>
                  {a.reliability.label_text}
                </span>
                {!a.active && <span className="rounded-pill bg-danger-tint px-2.5 py-0.5 text-xs font-bold text-danger">Inactive at Orange</span>}
                {a.active && !a.located && <span className="rounded-pill bg-warning-tint px-2.5 py-0.5 text-xs font-bold text-warning">Not on the map</span>}
              </div>
              <p className="text-sm text-muted">{a.capacity_text}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
