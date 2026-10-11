import { Link } from 'react-router-dom'
import type { DealerAgentRow } from '@/types/operator'
import { EdgeCard } from '@/features/agent/components/agentChrome'
import { Tag } from './dealerChrome'

const PRESENCE_TONE: Record<DealerAgentRow['presence'], string> = {
  open: 'text-finder-likely',
  hidden: 'text-warning',
  closed: 'text-finder-muted',
}

/**
 * One agent as the aggregator sees them, in the finder's card frame: the shop, its code and
 * street, when the word was last updated, the word itself, the track record, and a tag for
 * each thing that keeps customers away. Greyed when customers cannot be sent there. The
 * whole card opens the agent's page; `onOpen` lets a screen note the tap (Search remembers
 * the query).
 */
export function AgentRowCard({ agent: a, onOpen }: { agent: DealerAgentRow; onOpen?: (() => void) | undefined }) {
  const onMap = a.active && a.located && a.location_confirmed
  return (
    <Link to={`/dealer/agents/${encodeURIComponent(a.ref)}`} className="block" onClick={onOpen}>
      <EdgeCard muted={!onMap} className={a.attention ? '!bg-warning' : ''}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`truncate text-md font-bold leading-tight ${onMap ? 'text-white' : 'text-finder-muted'}`}>{a.name}</p>
            <p className="truncate text-sm font-bold text-finder-muted">
              {a.ref.replace(/^Agent /, 'Code ')} · {a.area}
            </p>
          </div>
          <span className="shrink-0 pt-0.5 text-xs font-semibold text-finder-muted">{a.freshness_text}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-bold ${PRESENCE_TONE[a.presence]}`}>{a.presence_text}</span>
          <span className="text-sm font-bold text-finder-muted" aria-hidden="true">
            ·
          </span>
          <span className="text-sm font-bold text-finder-muted" title={a.reliability.text}>
            {a.reliability.label_text}
          </span>
        </div>
        {(!a.active || !onMap || a.attention) && (
          <div className="flex flex-wrap gap-2">
            {!a.active && <Tag tone="danger">Inactive at Orange</Tag>}
            {a.active && !a.located && <Tag tone="warning">Not on the map</Tag>}
            {a.active && a.located && !a.location_confirmed && <Tag tone="warning">Pin to confirm</Tag>}
            {a.attention && <Tag tone="warning">Needs attention</Tag>}
          </div>
        )}
        <p className="text-sm font-medium text-finder-muted">{a.capacity_text}</p>
      </EdgeCard>
    </Link>
  )
}
