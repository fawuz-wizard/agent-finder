import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS } from '@/types/operator'
import type { DealerAgentRow, DealerBucket } from '@/types/operator'
import { FinderBox, FinderHeader } from '@/features/end-user/components/finder'
import { PILL_OFF, PILL_ON } from '@/features/agent/components/agentChrome'
import { AgentRowCard } from './components/AgentRowCard'
import { agentMatches } from '@/lib/dealerSearches'

/** The four buckets the dashboard counts, plus three states an aggregator chases. */
type Filter = DealerBucket | 'all' | 'unlocated' | 'inactive' | 'attention'

const FILTERS: { key: Filter; label: string; empty: string; test: (a: DealerAgentRow) => boolean }[] = [
  { key: 'all', label: 'All', empty: 'No agents are assigned to you yet.', test: () => true },
  { key: 'active', label: 'Active', empty: 'No agent is open and fresh right now.', test: (a) => a.bucket === 'active' },
  { key: 'limited', label: 'Limited', empty: 'No agent is on Small or None right now.', test: (a) => a.bucket === 'limited' },
  { key: 'hidden', label: 'Away', empty: 'Nobody is away right now.', test: (a) => a.bucket === 'hidden' },
  { key: 'closed', label: 'Closed', empty: 'Nobody is closed or stale right now.', test: (a) => a.bucket === 'closed' },
  { key: 'unlocated', label: 'Not on map', empty: 'Every active agent is on the map.', test: (a) => a.active && (!a.located || !a.location_confirmed) },
  { key: 'inactive', label: 'Inactive at Orange', empty: 'Every agent is active at Orange.', test: (a) => !a.active },
  { key: 'attention', label: 'Attention', empty: 'Nobody needs attention right now.', test: (a) => a.attention },
]

function isFilter(v: string | null): v is Filter {
  return FILTERS.some((f) => f.key === v)
}


/**
 * Agents: every agent this aggregator is responsible for, each in the finder's card frame
 * with their current word. The dashboard tiles land here with ?filter=<bucket>; the pills are
 * the same filter, and the bucket comes from the server so a tile and its list never disagree.
 */
export default function DealerAgentsPage() {
  const { data, state } = useAsync<DealerAgentRow[]>((s) => operatorApi.dealerAgents(s))
  const { can } = useSession()
  const [params, setParams] = useSearchParams()
  const raw = params.get('filter')
  const filter: Filter = isFilter(raw) ? raw : 'all'
  const [query, setQuery] = useState('')
  const rows = data ?? []
  const q = query.trim().toLowerCase()
  const matches = (a: DealerAgentRow) => agentMatches(a, q)
  const current = FILTERS.find((f) => f.key === filter)!
  const shown = rows.filter(current.test).filter(matches)
  const count = (f: (typeof FILTERS)[number]) => rows.filter(f.test).length

  function choose(key: Filter) {
    setParams(key === 'all' ? {} : { filter: key }, { replace: true })
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-white">
      <FinderHeader
        title="Agents"
        action={
          can(PERMISSIONS.manageAgent) ? (
            <Link to="/dealer/agents/new" className="flex h-control items-center text-base font-bold text-finder-link">
              Register
            </Link>
          ) : undefined
        }
      />

      <FinderBox className="mt-6 flex h-[3.5rem] items-center px-4 focus-within:outline focus-within:outline-2 focus-within:outline-finder-link">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find by name, number or street"
          aria-label="Find an agent"
          className="h-full w-full min-w-0 bg-transparent text-base font-medium text-white outline-none placeholder:text-finder-muted/60"
        />
      </FinderBox>

      <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => choose(f.key)}
            className={`flex h-chip shrink-0 items-center gap-1.5 rounded-pill px-4 text-sm font-bold ${filter === f.key ? PILL_ON : PILL_OFF}`}
          >
            {f.label}
            {state === 'ready' && <span className={`text-xs ${filter === f.key ? 'text-finder-on-orange/70' : 'text-finder-muted'}`}>{count(f)}</span>}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {state === 'loading' && <p className="text-base font-medium text-finder-muted">Loading…</p>}
        {state === 'ready' && shown.length === 0 && <p className="text-base font-medium text-finder-muted">{q ? 'No agent matches that.' : current.empty}</p>}
        {shown.map((a) => (
          <AgentRowCard key={a.ref} agent={a} />
        ))}
      </div>
    </div>
  )
}
