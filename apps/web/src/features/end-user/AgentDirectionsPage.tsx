import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Skeleton } from '@/design'
import { RouteMap } from '@/features/map'
import { DistanceLabel } from './components/DistanceLabel'
import { ErrorState } from './components/states'
import { FinderCta, FinderHeader, PinIcon } from './components/finder'
import { PhoneIcon, actionClass } from './components/actions'
import { requestFrom, useAgentDetail } from './useAgentDetail'

/**
 * The way to the agent, on its own screen: the map takes the page, with the shop's name and
 * distance above it and Call at the foot. The shop's details are the screen before this one,
 * so the customer has read what the agent can do before they set off. Nothing is asked
 * afterwards: a customer who wants to say how it went chooses Report a visit on the details.
 */
export default function AgentDirectionsPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const req = requestFrom(params)
  const { agent, error } = useAgentDetail(id, req)
  const navigate = useNavigate()
  const location = useLocation()
  const detailsPath = `/agents/${id}${params.toString() ? `?${params.toString()}` : ''}`
  // Back is a real step back: the details screen the customer came from is the previous
  // history entry, so going back there leaves nothing behind. Pushing the details instead
  // would pile details, directions, details... and Back would never escape the pair. Only a
  // link straight into this screen (no earlier entry, the "default" key) goes to the details
  // by path, replacing this entry so Back from there leaves the app's flow cleanly.
  const back = () => (location.key === 'default' ? navigate(detailsPath, { replace: true }) : navigate(-1))

  if (error) {
    return (
      <div className="flex flex-col gap-4 px-5 py-4 text-white">
        <FinderHeader back={back} title="Directions" />
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
    <div className="flex min-h-0 flex-1 flex-col bg-finder-bg text-white">
      <div className="px-5 pt-4">
        <FinderHeader back={back} title="Directions" />
        <h1 className="mt-3 text-xl font-bold leading-tight">{agent.name}</h1>
        <p className="mb-3 mt-1 flex items-center gap-2 text-[0.95rem] font-medium text-finder-muted">
          <span aria-hidden="true" className="flex w-5 shrink-0 justify-center">
            <PinIcon size={18} />
          </span>
          <span>{agent.area}</span>
          <span aria-hidden="true">•</span>
          <DistanceLabel metres={agent.distance_m} />
        </p>
      </div>

      <div className="min-h-[24rem] flex-1">
        <RouteMap
          fill
          agent={{ name: agent.name, lat: agent.lat, lng: agent.lng }}
          origin={agent.origin}
          distance_m={agent.distance_m}
          originIsSimulated={!req.point}
          directions_url={agent.directions_url}
        />
      </div>

      <div className="sticky bottom-0 mx-auto flex w-full max-w-[480px] gap-3 border-t border-finder-line bg-finder-bg px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        {agent.call_url && (
          <a href={agent.call_url} className={actionClass}>
            {PhoneIcon}
            Call
          </a>
        )}
        <a href={agent.directions_url} target="_blank" rel="noopener noreferrer" className={`${actionClass} flex-[1.4]`}>
          Open in Maps
        </a>
      </div>
    </div>
  )
}
