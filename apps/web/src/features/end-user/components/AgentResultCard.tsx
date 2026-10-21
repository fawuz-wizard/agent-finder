import { Link } from 'react-router-dom'
import type { AgentResult } from '@/types/public'
import { DistanceLabel } from './DistanceLabel'
import { ServedLikelihood } from './ServedLikelihood'
import { DirectionsIcon, actionClass } from './actions'
import { photoSrc } from '@/lib/photo'

/**
 * One result as a row, not a box: the shop's name and how far, the street and when the
 * picture was last updated, the figure and its bar, then Get details and Directions. The
 * number is never in a result, so Call waits on the shop's page. The whole row opens the shop's page. Rows are separated by
 * a hairline; the best match is the one in the file's orange-edged panel.
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
  const photo = photoSrc(agent.photo_url)
  const rated = agent.rating_count != null && agent.rating_count >= 3 && agent.rating_average != null
  const directions = to.replace(/^(\/agents\/[^?]+)/, '$1/directions')
  const freshness = agent.freshness_text ? agent.freshness_text.charAt(0).toLowerCase() + agent.freshness_text.slice(1) : null
  const body = (
    <>
      <div className="flex items-start gap-4">
        {photo && <img src={photo} alt="" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-field object-cover" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="min-w-0 truncate text-md font-bold leading-tight">
              <Link to={to} className="after:absolute after:inset-0 after:content-['']">
                {agent.name}
              </Link>
            </h3>
            <span className="shrink-0 text-base font-semibold text-finder-muted">
              <DistanceLabel metres={agent.distance_m} />
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-finder-muted">
            {agent.area}
            {freshness && <> · {freshness}</>}
            {rated && (
              <>
                {' · '}
                <span className="text-finder-star">★ {agent.rating_average}</span> ({agent.rating_count})
              </>
            )}
          </p>
        </div>
      </div>
      <ServedLikelihood agent={agent} />
      {recommended && agent.why && <p className="text-sm font-medium text-finder-muted">{agent.why}</p>}
      <div className="relative z-10 flex gap-3">
        <Link to={to} className={`${actionClass} bg-transparent text-white outline outline-2 -outline-offset-2 outline-white`}>
          Get details
        </Link>
        <Link to={directions} className={actionClass}>
          {DirectionsIcon}
          Directions
        </Link>
      </div>
    </>
  )
  if (recommended)
    return (
      <article className="relative my-2 rounded-panel bg-finder-link">
        <div className="ml-[9px] flex flex-col gap-4 rounded-panel bg-finder-bg px-4 py-5 shadow-inset-finder">{body}</div>
      </article>
    )
  return <article className="relative flex flex-col gap-4 border-b border-finder-line py-6 last:border-b-0">{body}</article>
}
