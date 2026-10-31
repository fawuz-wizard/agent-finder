import { Link } from 'react-router-dom'
import type { DealerAgentRow } from '@/types/operator'
import { Pill, RowAvatar } from './designKit'
import { agentState, mapBlock } from './agentState'

/**
 * One agent as the aggregator sees them, as a row under a hairline: the shop, its code and
 * street, and one pill. The pill is the agent's state, the same word as the chips and the
 * agent's page, unless something keeps customers from finding the shop at all (not verified,
 * not on the map, pin to confirm), which comes first. Greyed when customers cannot be sent
 * there. The trust word, the age and anything needing attention live on the agent's page and
 * the Attention screen. `onOpen` lets a screen note the tap (Search remembers the query).
 */
export function AgentRowCard({ agent: a, onOpen, index = 0 }: { agent: DealerAgentRow; onOpen?: (() => void) | undefined; index?: number }) {
  const onMap = a.active && a.located && a.location_confirmed && a.verified
  const block = mapBlock(a)
  const state = agentState(a)
  return (
    <Link to={`/dealer/agents/${encodeURIComponent(a.ref)}`} className="flex items-center gap-3 border-t border-finder-card-line px-[18px] py-3.5 first:border-t-0" onClick={onOpen}>
      <RowAvatar name={a.name} index={index} />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className={`text-[15px] font-bold leading-tight ${onMap ? 'text-finder-ink' : 'text-finder-muted'}`}>{a.name}</span>
        <span className="truncate text-[13px] text-finder-muted">
          {a.ref.replace(/^Agent /, '')} · {a.area}
        </span>
      </span>
      <span className="shrink-0">{block ? <Pill tone="warn">{block}</Pill> : <Pill tone={state.tone}>{state.text}</Pill>}</span>
    </Link>
  )
}
