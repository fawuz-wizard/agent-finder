import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useBack } from '@/hooks/useBack'
import { ChevronLeft, Navigation, Phone, X } from 'lucide-react'
import { fetchRoute, haversineM, type Route } from '@/lib/route'
import { agentState } from './components/agentState'
import { AgentMap } from './components/AgentMap'
import { RowAvatar } from './components/designKit'
import { TONE_DOT, TONE_LABEL, toPins, usePlacedAgents, type PinTone } from './agentPins'

type Filter = 'all' | PinTone
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open now' },
  { key: 'limited', label: 'Low today' },
  { key: 'away', label: 'Away or closed' },
  { key: 'inactive', label: 'Inactive' },
]
const STATE_TEXT: Record<PinTone, string> = {
  open: 'text-design-green',
  limited: 'text-finder-limited',
  away: 'text-finder-muted',
  inactive: 'text-design-red',
}
const FLOAT = 'shadow-[0_2px_8px_rgba(0,0,0,0.12)]'

/**
 * Full map, the approved design's stack screen: the aggregator's own confirmed shops on an
 * in-app map, filtered by today's state, with zoom and recenter. Tapping a shop opens its card:
 * state, what it covers today, Call, and the agent's page. ?focus=<ref> opens on one shop (from
 * Needs attention). ?focus=<ref>&route=1 is Directions from the agent's page: the aggregator's
 * own position (asked once, never stored), TomTom's route there by car or on foot with its
 * time, and Open in Maps for turn-by-turn. Without a position the map just centres on the shop.
 * No float balance exists here and nothing moves money.
 */
export default function DealerFullMapPage() {
  // A real step back (to Network, or the agent page that opened it), never a new entry.
  const goBack = useBack('/dealer/network')
  const [params] = useSearchParams()
  const focus = params.get('focus')
  const { placed, loading } = usePlacedAgents()
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(focus)
  const shown = placed.filter((a) => filter === 'all' || a.tone === filter)
  const sel = placed.find((a) => a.ref === selected) ?? null
  const directions = params.get('route') === '1' && focus !== null
  const target = directions ? (placed.find((a) => a.ref === focus) ?? null) : null
  const [mode, setMode] = useState<'driving' | 'walking'>('driving')
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null)
  const [noLocation, setNoLocation] = useState(false)
  const [route, setRoute] = useState<Route | null>(null)
  const [routeDone, setRouteDone] = useState(false)
  useEffect(() => {
    if (!directions) return
    if (!('geolocation' in navigator)) {
      setNoLocation(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setNoLocation(true),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [directions])
  useEffect(() => {
    if (!origin || !target) return
    const ctrl = new AbortController()
    setRouteDone(false)
    void fetchRoute(origin, { lat: target.lat, lng: target.lng }, mode, ctrl.signal).then((r) => {
      setRoute(r)
      setRouteDone(true)
    })
    return () => ctrl.abort()
  }, [origin?.lat, origin?.lng, target?.lat, target?.lng, mode]) // eslint-disable-line react-hooks/exhaustive-deps
  const minutes = route ? Math.max(1, Math.round(route.seconds / 60)) : null
  // No route from TomTom (no key, no signal): the straight-line distance, said as such.
  const straight = origin && target ? haversineM(origin, { lat: target.lat, lng: target.lng }) : null
  const km = route ? (route.metres >= 1000 ? `${(route.metres / 1000).toFixed(1)} km` : `${Math.round(route.metres)} m`) : null

  return (
    <div className="relative min-h-[560px] flex-1 overflow-hidden text-finder-ink">
      <AgentMap
        pins={toPins(shown)}
        interactive
        selected={selected}
        focus={focus}
        onSelect={setSelected}
        controlsTop={132}
        label={`${shown.length} of your shops on the map`}
        className="absolute inset-0"
        origin={directions ? origin : null}
        route={directions ? (route?.points ?? null) : null}
      />

      <div className="absolute inset-x-4 top-2 z-10 flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <button type="button" aria-label="Back" onClick={goBack} className={`flex h-11 w-11 items-center justify-center rounded-[14px] bg-finder-card ${FLOAT}`}>
            <ChevronLeft size={20} strokeWidth={2.4} aria-hidden />
          </button>
          {directions ? (
            <div className={`flex min-h-11 flex-1 flex-col justify-center rounded-[14px] bg-finder-card px-4 py-1.5 ${FLOAT}`}>
              <h1 className="truncate text-[15px] font-extrabold">Directions to {target?.name ?? 'the shop'}</h1>
              <p role="status" className="text-[12.5px] font-semibold text-finder-muted">
                {noLocation ? 'Turn on location to see the way from you' : minutes !== null ? `${minutes} min ${mode === 'driving' ? 'drive' : 'walk'} · ${km} from you` : routeDone && straight !== null ? `${straight >= 1000 ? `${(straight / 1000).toFixed(1)} km` : `${Math.round(straight)} m`} from you in a straight line` : origin ? 'Finding the way…' : 'Finding where you are…'}
              </p>
            </div>
          ) : (
            <h1 className={`flex h-11 flex-1 items-center rounded-[14px] bg-finder-card px-4 text-[15px] font-extrabold ${FLOAT}`}>
              All agents
              <span className="ml-auto text-[13px] font-bold text-finder-muted">{loading ? '…' : `${shown.length} shown`}</span>
            </h1>
          )}
        </div>
        {directions ? (
          <div role="group" aria-label="Travel" className="flex gap-1.5">
            {(['driving', 'walking'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-pill px-3.5 py-2 text-xs font-bold ${FLOAT} ${mode === m ? 'bg-design-ink text-white' : 'bg-finder-card text-finder-ink'}`}
              >
                {m === 'driving' ? 'Drive' : 'Walk'}
              </button>
            ))}
          </div>
        ) : (
          <div role="group" aria-label="Show" className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => {
                  setFilter(f.key)
                  setSelected(null)
                }}
                className={`flex flex-none items-center gap-1.5 rounded-pill px-3 py-2 text-xs font-bold ${FLOAT} ${filter === f.key ? 'bg-design-ink text-white' : 'bg-finder-card text-finder-ink'}`}
              >
                {f.key !== 'all' && <span aria-hidden="true" className={`h-2 w-2 rounded-full ${TONE_DOT[f.key]}`} />}
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!sel && !directions && (
        <ul aria-label="Legend" className={`absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 rounded-[14px] bg-finder-card px-3 py-2.5 text-[11px] font-semibold ${FLOAT}`}>
          {(['open', 'limited', 'away', 'inactive'] as const).map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${TONE_DOT[t]}`} />
              {TONE_LABEL[t]}
            </li>
          ))}
        </ul>
      )}

      {sel && (
        <section aria-label={sel.name} className="absolute inset-x-3 bottom-4 z-10 flex flex-col gap-4 rounded-[22px] bg-finder-card p-5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-3">
            <RowAvatar name={sel.name} index={0} />
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <p className="truncate text-base font-extrabold">{sel.name}</p>
              <p className="truncate text-[13px] text-finder-muted">
                {sel.area} · {sel.ref.replace(/^Agent /, 'Code ')}
              </p>
            </div>
            <button type="button" aria-label="Close" onClick={() => setSelected(null)} className="flex h-8 w-8 items-center justify-center rounded-full bg-design-track text-sm font-bold">
              <X size={16} strokeWidth={2.4} aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1 rounded-xl bg-finder-bg p-3">
              <span className="text-xs text-finder-muted">Status</span>
              <span className={`text-sm font-extrabold ${STATE_TEXT[sel.tone]}`}>{agentState(sel).text}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl bg-finder-bg p-3">
              <span className="text-xs text-finder-muted">Updated</span>
              <span className="text-sm font-extrabold">{sel.freshness_text}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {sel.phone ? (
              <a href={`tel:${sel.phone}`} className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-finder-accent text-sm font-extrabold text-finder-on-orange">
                <Phone size={16} strokeWidth={2.2} aria-hidden />
                Call agent
              </a>
            ) : (
              <span className="flex h-12 items-center justify-center rounded-[14px] bg-design-track text-sm font-bold text-finder-muted">No number</span>
            )}
            {directions && sel.ref === focus ? (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${sel.lat},${sel.lng}&travelmode=${mode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-finder-accent text-sm font-extrabold text-finder-link"
              >
                <Navigation size={16} strokeWidth={2.2} aria-hidden />
                Open in Maps
              </a>
            ) : (
              <Link to={`/dealer/agents/${encodeURIComponent(sel.ref)}`} className="flex h-12 items-center justify-center rounded-[14px] border-[1.5px] border-finder-accent text-sm font-extrabold text-finder-link">
                Agent details
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
