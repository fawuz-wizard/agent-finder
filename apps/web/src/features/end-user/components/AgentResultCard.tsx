import { Link } from 'react-router-dom'
import { Card } from '@/design'
import type { AgentResult } from '@/types/public'
import { DistanceLabel } from './DistanceLabel'
import { FreshnessBadge } from './FreshnessBadge'
import { ServiceStatus } from './ServiceStatus'
import { WhyLine } from './WhyLine'

export function AgentResultCard({
  agent,
  to,
  recommended = false,
}: {
  agent: AgentResult
  to: string
  recommended?: boolean
}) {
  return (
    <Card className={`relative border border-white/10 bg-app-card text-white ${recommended ? 'border-l-4 border-l-app-highlight' : ''}`}>
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
        <p className="-mt-1 text-sm text-white/55">{agent.area}</p>
        {agent.rating_count != null && agent.rating_count >= 3 && agent.rating_average != null && (
          <p className="text-sm text-app-star">★ {agent.rating_average} · {agent.rating_count} ratings</p>
        )}
        <ServiceStatus outcome={agent.outcome} text={agent.outcome_text} />
        <FreshnessBadge state={agent.freshness} text={agent.freshness_text} />
        {recommended && agent.why && <WhyLine text={agent.why} />}
        <div className="relative z-10 flex">
          <Link
            to={to}
            className="inline-flex h-control items-center rounded-card px-1 text-base font-bold text-brand-text hover:bg-white/5"
          >
            View shop ›
          </Link>
        </div>
      </div>
    </Card>
  )
}
