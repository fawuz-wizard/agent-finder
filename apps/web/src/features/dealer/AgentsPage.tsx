import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { LoadError } from '@/design'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS } from '@/types/operator'
import type { DealerAgentRow, DealerBucket } from '@/types/operator'
import { ScreenTitle } from './components/designKit'
import { CARD, PAGE, chipClass } from './components/designClasses'
import { AgentRowCard } from './components/AgentRowCard'
import { agentMatches, keywordByKey } from '@/lib/dealerSearches'

/**
 * The four chips the aggregator asked for, plus the dashboard's own buckets, which arrive by
 * link (?filter=limited from a count card) and show as one more chip that clears back to All.
 */
type Filter = DealerBucket | 'all' | 'unlocated' | 'inactive' | 'attention'

const word = (key: string) => keywordByKey(key)!.test
/** Serving now: open with a fresh word, including those open but low today. */
const serving = (a: DealerAgentRow) => a.active && (a.bucket === 'active' || a.bucket === 'limited')
const FILTERS: { key: Filter; label: string; empty: string; test: (a: DealerAgentRow) => boolean; chip: boolean }[] = [
  { key: 'all', label: 'All', empty: 'No agents are assigned to you yet.', test: () => true, chip: true },
  { key: 'active', label: 'Active', empty: 'No agent is serving right now.', test: serving, chip: true },
  { key: 'inactive', label: 'Inactive', empty: 'Every agent is serving right now.', test: (a) => !serving(a), chip: true },
  { key: 'unlocated', label: 'Not on map', empty: 'Every active agent is on the map.', test: word('unlocated'), chip: true },
  { key: 'limited', label: 'Limited', empty: 'No agent is on Small or None right now.', test: word('limited'), chip: false },
  { key: 'hidden', label: 'Away', empty: 'Nobody is away right now.', test: word('hidden'), chip: false },
  { key: 'closed', label: 'Closed', empty: 'Nobody is closed or stale right now.', test: word('closed'), chip: false },
  { key: 'attention', label: 'Attention', empty: 'Nobody needs attention right now.', test: word('attention'), chip: false },
]

function isFilter(v: string | null): v is Filter {
  return FILTERS.some((f) => f.key === v)
}

/**
 * Agents: every agent this aggregator is responsible for, each a row with their current
 * word. The dashboard tiles land here with ?filter=<bucket>; the pills are
 * the same filter, and the bucket comes from the server so a tile and its list never disagree.
 */
export default function DealerAgentsPage() {
  const { data, state, error, refresh } = useAsync<DealerAgentRow[]>((s) => operatorApi.dealerAgents(s))
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
    <div className={PAGE}>
      <ScreenTitle
        title="Agents"
        back="/dealer"
        action={
          can(PERMISSIONS.manageAgent) ? (
            <Link to="/dealer/agents/new" className="flex h-10 items-center rounded-xl bg-finder-card px-3 text-sm font-bold text-finder-link">
              Register
            </Link>
          ) : undefined
        }
      />

      <label className="flex h-12 items-center gap-2.5 rounded-[14px] bg-finder-card px-4 focus-within:outline focus-within:outline-2 focus-within:outline-finder-link">
        <Search size={18} strokeWidth={2.2} className="shrink-0 text-finder-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or location"
          aria-label="Find an agent"
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-finder-ink outline-none placeholder:text-finder-muted"
        />
      </label>

      <div className="-mx-6 flex gap-2 overflow-x-auto px-6" role="group" aria-label="Show">
        {[...FILTERS.filter((f) => !f.chip && f.key === filter), ...FILTERS.filter((f) => f.chip)].map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => choose(f.chip ? f.key : 'all')} className={chipClass(filter === f.key)}>
            {f.label}
            {state === 'ready' && ` (${count(f)})`}
            {!f.chip && <X size={14} strokeWidth={2.6} className="ml-1.5" aria-label="clear" />}
          </button>
        ))}
      </div>

      {state === 'error' && !data ? (
        <LoadError what="your agents" error={error} onRetry={refresh} />
      ) : (
      <div className={`${CARD} flex flex-col py-1`}>
        {state === 'loading' && <p className="p-8 text-center text-sm text-finder-muted">Loading…</p>}
        {state === 'ready' && shown.length === 0 && <p className="p-8 text-center text-sm text-finder-muted">{q ? 'No agent matches that.' : current.empty}</p>}
        {shown.map((a, i) => (
          <AgentRowCard key={a.ref} agent={a} index={i} />
        ))}
      </div>
      )}
    </div>
  )
}
