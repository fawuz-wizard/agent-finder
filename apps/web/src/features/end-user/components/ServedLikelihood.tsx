import type { AgentResult } from '@/types/public'
import { ServiceStatus } from './ServiceStatus'

type Served = Pick<AgentResult, 'outcome' | 'outcome_text' | 'served_pct' | 'served_text'>

/**
 * How likely the customer is to be served, as the server rounded it: the figure, a bar the
 * same length, and the sentence. Never 100: a round figure says "about", and the caption
 * says what it is about. Where no figure applies (closed, hidden, expired, no status, or the
 * ranker off) the public phrase stands alone, as before.
 */
export function ServedLikelihood({ agent, size = 'md' }: { agent: Served; size?: 'md' | 'lg' }) {
  const pct = agent.served_pct
  const sentence = agent.served_text
  if (pct == null || !sentence) return <ServiceStatus outcome={agent.outcome} text={agent.outcome_text} size={size} />
  const good = agent.outcome === 'likely'
  const prefix = `${pct}%`
  const caption = sentence.startsWith(prefix) ? sentence.slice(prefix.length).trim() : sentence
  const big = size === 'lg'
  return (
    <div className={`flex flex-col ${big ? 'gap-2' : 'gap-1.5'}`} role="group" aria-label={sentence}>
      <div className="flex items-baseline gap-2">
        <span className={`${big ? 'text-3xl' : 'text-md'} font-bold leading-none tabular-nums ${good ? 'text-finder-likely' : 'text-finder-star'}`}>
          {prefix}
        </span>
        <span className={`${big ? 'text-base' : 'text-sm'} font-semibold text-white`}>{caption}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-pill bg-finder-line" aria-hidden="true">
        <div className={`h-full rounded-pill ${good ? 'bg-finder-likely' : 'bg-finder-star'}`} style={{ width: `${pct}%` }} />
      </div>
      {!good && <p className="text-sm font-medium text-finder-muted">{agent.outcome_text}</p>}
    </div>
  )
}
