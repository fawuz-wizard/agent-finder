import { useState } from 'react'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { DealerAgentRow } from '@/types/operator'
import { FinderBox, FinderHeader } from '@/features/end-user/components/finder'
import { PILL_OFF, SectionLabel } from '@/features/agent/components/agentChrome'
import { agentMatches, parseQuery, readSearches, rememberSearch, summaryLine } from '@/lib/dealerSearches'
import { AgentRowCard } from './components/AgentRowCard'

/**
 * Search: find one of your agents by shop name, the person, agent number, Orange code,
 * phone, street or town. Results are the same cards as the Agents tab. What you searched
 * lately sits under the box, like the finder's recent places. Your agents on the map will
 * live on this tab later; the space is kept.
 */
export default function DealerSearchPage() {
  const { data, state } = useAsync<DealerAgentRow[]>((s) => operatorApi.dealerAgents(s))
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState(readSearches)
  const q = query.trim()
  const rows = data ?? []
  const shown = q ? rows.filter((a) => agentMatches(a, q)) : []
  const { keywords } = parseQuery(q)

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <FinderHeader title="Search" />

      <FinderBox className="mt-6 flex h-[3.5rem] items-center gap-3 px-4 focus-within:outline focus-within:outline-2 focus-within:outline-finder-link">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-finder-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5L21 21" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          placeholder="Shop, person, number, code, phone or town"
          aria-label="Search your agents"
          className="h-full w-full min-w-0 bg-transparent text-base font-medium text-finder-ink outline-none placeholder:text-finder-muted [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" onClick={() => setQuery('')} className="shrink-0 text-sm font-bold text-finder-link">
            Clear
          </button>
        )}
      </FinderBox>

      {!q && recent.length > 0 && (
        <section className="mt-5 flex flex-col gap-3" aria-labelledby="recent-searches">
          <SectionLabel id="recent-searches">Recent</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <button key={r} type="button" onClick={() => setQuery(r)} className={`h-chip rounded-pill px-4 text-sm font-bold ${PILL_OFF}`}>
                {r}
              </button>
            ))}
          </div>
        </section>
      )}

      {!q && (
        <p className="mt-5 text-sm font-medium text-finder-muted">
          Type a shop name, the agent's name, their number, Orange code, phone, street or town. Words work too: active, away, closed, not on map, inactive, attention,
          float, photo, verified, new, west. Put them together: “closed Lumley”. Your agents on the map will live here too.
        </p>
      )}

      {q && (
        <div className="mt-5 flex flex-col gap-3" role="region" aria-live="polite" aria-label="Results">
          {state === 'loading' && <p className="text-base font-medium text-finder-muted">Looking…</p>}
          {state === 'ready' && shown.length === 0 && <p className="text-base font-medium text-finder-muted">No agent of yours matches “{q}”.</p>}
          {state === 'ready' && shown.length > 0 && <p className="text-sm font-bold text-finder-muted">{summaryLine(shown.length, rows.length, keywords)}</p>}
          {shown.map((a) => (
            <AgentRowCard key={a.ref} agent={a} onOpen={() => setRecent(rememberSearch(q))} />
          ))}
        </div>
      )}
    </div>
  )
}
