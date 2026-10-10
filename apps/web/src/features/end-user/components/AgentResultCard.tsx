import { Link } from 'react-router-dom'
import type { AgentResult } from '@/types/public'
import { DistanceLabel } from './DistanceLabel'
import { FreshnessBadge } from './FreshnessBadge'
import { ServiceStatus } from './ServiceStatus'
import { WhyLine } from './WhyLine'
import { ChevronIcon } from './finder'
import { photoSrc } from '@/lib/photo'

/**
 * One result, as the file draws it: a rounded panel with an orange edge on the left, the
 * shop's name and distance on one line, its street under, the status pill, "Get details".
 */
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
    <article className="relative rounded-panel bg-finder-link">
      <div className="ml-[9px] flex flex-col rounded-panel bg-finder-bg px-4 pb-4 pt-4 text-white shadow-inset-finder">
        <div className="flex items-start gap-3">
          {photoSrc(agent.photo_url) && (
            <img src={photoSrc(agent.photo_url)!} alt="" className="h-12 w-16 shrink-0 rounded-field object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-3">
              <h3 className="min-w-0 text-md font-bold leading-tight">
                <Link to={to} className="after:absolute after:inset-0 after:content-['']">
                  {agent.name}
                </Link>
              </h3>
              <span className="ml-auto text-md font-bold text-finder-muted">
                <DistanceLabel metres={agent.distance_m} />
              </span>
            </div>
            <p className="mt-0.5 text-sm font-bold text-finder-muted">{agent.area}</p>
          </div>
        </div>
        {agent.rating_count != null && agent.rating_count >= 3 && agent.rating_average != null && (
          <p className="mt-1 text-sm font-semibold text-finder-star">★ {agent.rating_average} · {agent.rating_count} ratings</p>
        )}
        <div className="mt-4">
          <ServiceStatus outcome={agent.outcome} text={agent.outcome_text} />
        </div>
        {agent.freshness !== 'fresh' && (
          <div className="mt-2">
            <FreshnessBadge state={agent.freshness} text={agent.freshness_text} />
          </div>
        )}
        {recommended && agent.why && (
          <div className="mt-2">
            <WhyLine text={agent.why} />
          </div>
        )}
        <div className="relative z-10 mt-3 flex">
          <Link to={to} className="inline-flex h-control items-center gap-1 text-base font-bold text-finder-link">
            Get details
            <ChevronIcon />
          </Link>
        </div>
      </div>
    </article>
  )
}
