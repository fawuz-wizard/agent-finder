import { Link } from 'react-router-dom'
import type { DealerAgentRow } from '@/types/operator'
import { Tag } from './dealerChrome'

const PRESENCE_TONE: Record<DealerAgentRow['presence'], string> = {
  open: 'text-finder-likely',
  hidden: 'text-warning',
  closed: 'text-finder-muted',
}

/** The one thing keeping customers away from this agent, if there is one; the worst first. */
function flag(a: DealerAgentRow): { tone: 'danger' | 'warning'; text: string } | null {
  if (!a.active) return { tone: 'danger', text: 'Inactive at Orange' }
  if (!a.verified) return { tone: 'warning', text: 'Pending' }
  if (!a.located) return { tone: 'warning', text: 'Not on the map' }
  if (!a.location_confirmed) return { tone: 'warning', text: 'Pin to confirm' }
  if (a.attention) return { tone: 'warning', text: 'Needs attention' }
  return null
}

/**
 * One agent as the aggregator sees them, as a row under a hairline: the shop, its code and
 * street, then the word, the track record and how old the word is, on one line. One pill on
 * the right names the thing keeping customers away, if any. Greyed when customers cannot be
 * sent there. The row opens the agent's page, where the capacity line and the rest live;
 * `onOpen` lets a screen note the tap (Search remembers the query).
 */
export function AgentRowCard({ agent: a, onOpen }: { agent: DealerAgentRow; onOpen?: (() => void) | undefined }) {
  const onMap = a.active && a.located && a.location_confirmed && a.verified
  const f = flag(a)
  return (
    <Link to={`/dealer/agents/${encodeURIComponent(a.ref)}`} className="block border-b border-finder-line py-3 last:border-b-0" onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <p className={`min-w-0 truncate text-base font-bold leading-tight ${onMap ? 'text-finder-ink' : 'text-finder-muted'}`}>{a.name}</p>
        {f && <Tag tone={f.tone}>{f.text}</Tag>}
      </div>
      <p className="truncate text-sm font-medium text-finder-muted">
        {a.ref.replace(/^Agent /, 'Code ')} · {a.area}
      </p>
      <p className="truncate text-sm font-semibold text-finder-muted">
        <span className={PRESENCE_TONE[a.presence]}>{a.presence_text}</span>
        {' · '}
        <span title={a.reliability.text}>{a.reliability.label_text}</span>
        {' · '}
        {a.freshness_text}
      </p>
    </Link>
  )
}
