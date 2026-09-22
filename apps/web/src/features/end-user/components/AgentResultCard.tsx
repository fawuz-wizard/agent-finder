import { Link } from 'react-router-dom'
import { Card } from '@/design'
import type { AgentResult } from '@/types/public'
import { ServiceStatus } from './ServiceStatus'
import { FreshnessBadge } from './FreshnessBadge'
import { DistanceLabel } from './DistanceLabel'
import { WhyLine } from './WhyLine'

export function AgentResultCard({
  agent,
  to,
  recommended = false,
  onDirections,
}: {
  agent: AgentResult
  to: string
  recommended?: boolean
  onDirections?: (agent: AgentResult) => void
}) {
  const actionable = agent.outcome === 'likely'
  return (
    <Card className={`relative ${recommended ? 'border-l-4 border-l-brand' : ''}`}>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-bold leading-tight">
            <Link to={to} className="after:absolute after:inset-0 after:content-['']">
              {agent.name}
            </Link>
          </h3>
          <span className="ml-auto">
            <DistanceLabel metres={agent.distance_m} />
          </span>
        </div>
        <p className="-mt-1 text-sm text-muted">{agent.area}</p>
        <ServiceStatus outcome={agent.outcome} text={agent.outcome_text} />
        <FreshnessBadge state={agent.freshness} text={agent.freshness_text} />
        {agent.why && <WhyLine text={agent.why} />}
        {agent.note && <WhyLine text={agent.note} tone="note" />}
        <div className="relative z-10 flex">
          {actionable && onDirections ? (
            <Link
              to={`${to}&map=1`}
              onClick={() => onDirections(agent)}
              className="inline-flex h-control items-center rounded-card px-1 text-base font-bold text-brand-text hover:bg-brand-faint"
            >
              Get directions ›
            </Link>
          ) : (
            <Link
              to={to}
              className="inline-flex h-control items-center rounded-card px-1 text-base font-bold text-brand-text hover:bg-brand-faint"
            >
              See details ›
            </Link>
          )}
        </div>
      </div>
    </Card>
  )
}
