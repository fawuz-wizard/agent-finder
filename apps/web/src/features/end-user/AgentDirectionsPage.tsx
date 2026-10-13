import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Skeleton } from '@/design'
import { usePendingVisit } from '@/hooks/usePendingVisit'
import { RouteMap } from '@/features/map'
import { DistanceLabel } from './components/DistanceLabel'
import { ErrorState } from './components/states'
import { FinderCta, FinderHeader, PinIcon } from './components/finder'
import { PhoneIcon, actionClass } from './components/actions'
import { requestFrom, useAgentDetail } from './useAgentDetail'

/**
 * The way to the agent, on its own screen: the map and the walk, Walking or Driving,
 * "I'm going there", and Call. The shop's details are the screen before this one, so the
 * customer has read what the agent can do before they set off. Looking at the map is not a
 * visit; only "I'm going there" starts the outcome question.
 */
export default function AgentDirectionsPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const req = requestFrom(params)
  const { agent, error } = useAgentDetail(id, req)
  const { visit, remember } = usePendingVisit()
  const detailsPath = `/agents/${id}${params.toString() ? `?${params.toString()}` : ''}`

  if (error) {
    return (
      <div className="flex flex-col gap-4 px-5 py-4 text-white">
        <FinderHeader back={detailsPath} title="Directions" />
        <ErrorState message={error} />
        <Link to="/find">
          <FinderCta>Search again</FinderCta>
        </Link>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="flex flex-col gap-3 px-5 py-4" aria-busy="true">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col bg-finder-bg text-white">
      <div className="flex flex-1 flex-col px-5 pb-28 pt-4">
        <FinderHeader back={detailsPath} title="Directions" />
        <h1 className="mt-4 text-xl font-bold leading-tight">{agent.name}</h1>
        <p className="mt-1 flex items-center gap-2 text-[0.95rem] font-medium text-finder-muted">
          <span aria-hidden="true" className="flex w-5 shrink-0 justify-center">
            <PinIcon size={18} />
          </span>
          <span>{agent.area}</span>
          <span aria-hidden="true">•</span>
          <DistanceLabel metres={agent.distance_m} />
        </p>

        <div className="mt-5">
          <RouteMap
            agent={{ name: agent.name, lat: agent.lat, lng: agent.lng }}
            origin={agent.origin}
            distance_m={agent.distance_m}
            originIsSimulated={!req.point}
            directions_url={agent.directions_url}
            going={visit?.agentId === agent.id}
            onGoing={() => remember({ agentId: agent.id, agentName: agent.name, transaction: req.tx, amount: req.amount })}
          />
        </div>
      </div>

      {agent.call_url && (
        <div className="sticky bottom-0 mx-auto flex w-full max-w-[480px] gap-5 bg-finder-bg px-5 pb-6 pt-3">
          <a href={agent.call_url} className={actionClass}>
            {PhoneIcon}
            Call
          </a>
        </div>
      )}
    </div>
  )
}
