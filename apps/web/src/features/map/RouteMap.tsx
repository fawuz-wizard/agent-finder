/**
 * The way to an agent, drawn inside the app. With the TomTom key (the project's map key):
 * TomTom's streets and TomTom's route between the customer and the shop. Without it, a Google
 * map when a Google key is set, otherwise an inline sketch from the same coarse points. The
 * customer never has to leave Max it to see where to go.
 */
import { useCallback, useEffect, useState } from 'react'
import { colors } from '@/design/tokens'
import { config } from '@/lib/config'
import { tileSource } from '@/lib/tiles'
import { fetchRoute, type Route } from '@/lib/route'
import { TileLayer } from './TileLayer'
import { GoogleMap, type LatLng } from './GoogleMap'
import { buildAgentMarkerElement } from './AgentMarker'

export interface RouteMapProps {
  agent: { name: string; lat: number; lng: number }
  origin: LatLng | null
  distance_m: number
  /** True when the demo area centre stands in for device GPS. */
  originIsSimulated?: boolean
  /** Kept as a quiet secondary link for people who want their own maps app. */
  directions_url: string
  /**
   * The map takes the whole screen: no travel-mode buttons and no "I'm going there", only the
   * map, the distance line and the quiet Maps link. The parent gives it the height.
   */
  fill?: boolean
}

function distanceText(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

function walkText(m: number): string {
  const min = Math.max(1, Math.round(m / 80))
  return `about ${min} min walk`
}

/** Metres east and north of `from` to `to`, on a flat local plane (fine over a few km). */
function offsetMetres(from: LatLng, to: LatLng): { east: number; north: number } {
  const east = (to.lng - from.lng) * 111_320 * Math.cos((from.lat * Math.PI) / 180)
  const north = (to.lat - from.lat) * 110_574
  return { east, north }
}

function compass(east: number, north: number): string {
  const deg = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
  return names[Math.round(deg / 45) % 8]!
}

function LiveRoute({ agent, origin, className }: { agent: RouteMapProps['agent']; origin: LatLng | null; className: string }) {
  const onReady = useCallback(
    (map: google.maps.Map, marker: google.maps.MarkerLibrary) => {
      const here = { lat: agent.lat, lng: agent.lng }
      new marker.AdvancedMarkerElement({ map, position: here, content: buildAgentMarkerElement({ label: agent.name, selected: true }) })
      if (origin) {
        new marker.AdvancedMarkerElement({ map, position: origin, content: buildAgentMarkerElement({ label: 'You' }) })
        new google.maps.Polyline({
          map,
          path: [origin, here],
          strokeOpacity: 0,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeWeight: 3, scale: 3 }, offset: '0', repeat: '14px' }],
        })
        const bounds = new google.maps.LatLngBounds()
        bounds.extend(origin)
        bounds.extend(here)
        map.fitBounds(bounds, 48)
      }
    },
    [agent.lat, agent.lng, agent.name, origin],
  )
  return <GoogleMap center={{ lat: agent.lat, lng: agent.lng }} zoom={16} className={className} onReady={onReady} />
}

/**
 * With the TomTom key: the real streets, the customer and the shop as pins, and TomTom's own
 * route between them (walking or driving), with its time. Until the route arrives, or if TomTom
 * cannot give one, the straight line. Zoom in and out; it frames both points.
 */
function TomTomRoute({ agent, origin, mode, fill }: { agent: RouteMapProps['agent']; origin: LatLng | null; mode: 'walking' | 'driving'; fill: boolean }) {
  const here = { lat: agent.lat, lng: agent.lng }
  const [route, setRoute] = useState<Route | null>(null)
  const [zoomBy, setZoomBy] = useState(0)
  useEffect(() => {
    if (!origin) return
    const ctrl = new AbortController()
    void fetchRoute(origin, here, mode, ctrl.signal).then((r) => setRoute(r))
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lng, agent.lat, agent.lng, mode])
  const fit = [here, ...(origin ? [origin] : []), ...(route?.points ?? [])]
  const minutes = route ? Math.max(1, Math.round(route.seconds / 60)) : null
  const btn = 'flex h-10 w-10 items-center justify-center rounded-full bg-finder-bg/85 text-lg font-bold text-white'
  return (
    <TileLayer fit={fit} zoomBy={zoomBy} label={`Map of the way to ${agent.name}`} className={fill ? 'absolute inset-0' : 'h-56 w-full rounded-card'}>
      {(at, size) => {
        const line = (route?.points ?? (origin ? [origin, here] : [])).map(at)
        const path = line.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        const a = at(here)
        const o = origin ? at(origin) : null
        return (
          <>
            <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} aria-hidden="true">
              {line.length > 1 && (
                <>
                  <polyline points={path} fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={path} fill="none" stroke="var(--color-finder-accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={route ? undefined : '2 9'} />
                </>
              )}
              {/* The route ends on the nearest road: the last steps to the shop, dashed. */}
              {route && line.length > 1 && <line x1={line[line.length - 1]!.x} y1={line[line.length - 1]!.y} x2={a.x} y2={a.y} stroke="var(--color-finder-accent)" strokeWidth="4" strokeDasharray="2 8" strokeLinecap="round" />}
              {o && <circle cx={o.x} cy={o.y} r="9" fill="white" stroke="black" strokeWidth="3" />}
              <circle cx={a.x} cy={a.y} r="11" fill="var(--color-finder-accent)" stroke="white" strokeWidth="3" />
            </svg>
            {o && <span className="pointer-events-none absolute -translate-x-1/2 rounded-pill bg-white px-2 py-0.5 text-xs font-bold text-black" style={{ left: o.x, top: o.y + 14 }}>You</span>}
            <span className="pointer-events-none absolute max-w-[70%] -translate-x-1/2 truncate rounded-pill bg-finder-accent px-2 py-0.5 text-xs font-bold text-finder-on-orange" style={{ left: a.x, top: a.y - 36 }}>
              {agent.name}
            </span>
            {minutes !== null && (
              <span className="absolute left-3 top-3 rounded-pill bg-finder-bg/90 px-3 py-1 text-sm font-bold text-white" role="status">
                {minutes} min {mode === 'walking' ? 'walk' : 'drive'} · {distanceText(route!.metres)}
              </span>
            )}
            <span className="absolute right-3 top-3 flex flex-col gap-2">
              <button type="button" aria-label="Zoom in" className={btn} onClick={() => setZoomBy((z) => Math.min(z + 1, 4))}>
                +
              </button>
              <button type="button" aria-label="Zoom out" className={btn} onClick={() => setZoomBy((z) => Math.max(z - 1, -4))}>
                −
              </button>
            </span>
          </>
        )
      }}
    </TileLayer>
  )
}

/** No map key (or offline): the same two points as a sketch. Scaled to fit, north up. */
function SketchRoute({ agent, origin, distance_m, fill = false }: { agent: RouteMapProps['agent']; origin: LatLng | null; distance_m: number; fill?: boolean }) {
  // A card-sized landscape sketch, or a portrait one that covers the whole screen.
  const W = 320
  const H = fill ? 560 : 220
  const pad = 44
  const here = { lat: agent.lat, lng: agent.lng }
  const off = origin ? offsetMetres(origin, here) : { east: 0, north: 0 }
  const span = Math.max(Math.abs(off.east), Math.abs(off.north), 50)
  const scale = (Math.min(W, H) / 2 - pad) / span
  const cx = W / 2
  const cy = H / 2
  const ax = cx + (off.east / 2) * scale
  const ay = cy - (off.north / 2) * scale
  const ox = cx - (off.east / 2) * scale
  const oy = cy + (off.north / 2) * scale
  const heading = origin ? compass(off.east, off.north) : null
  const label = origin
    ? `Sketch of the way to ${agent.name}: ${distanceText(distance_m)} to the ${heading}, ${walkText(distance_m)}`
    : `Sketch showing ${agent.name}'s location`
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio={fill ? 'xMidYMid slice' : 'xMidYMid meet'}
      role="img"
      aria-label={label}
      className={fill ? 'h-full w-full bg-canvas' : 'h-56 w-full rounded-card border border-line bg-canvas'}
    >
      <defs>
        <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeOpacity="0.08" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" />
      <g transform={`translate(${W - 26} 26)`} fill="currentColor" opacity="0.6">
        <path d="M 0 -12 L 5 6 L 0 2 L -5 6 Z" />
        <text y="20" textAnchor="middle" fontSize="10" fontWeight="700">N</text>
      </g>
      {origin && (
        <>
          <line x1={ox} y1={oy} x2={ax} y2={ay} stroke="currentColor" strokeWidth="3" strokeDasharray="6 6" strokeLinecap="round" opacity="0.7" />
          <circle cx={ox} cy={oy} r="9" fill="#FFFFFF" stroke="currentColor" strokeWidth="3" />
          <text x={ox} y={oy + 24} textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">You</text>
        </>
      )}
      <circle cx={ax} cy={ay} r="11" fill={colors.brand} stroke={colors.brandText} strokeWidth="3" />
      <text x={ax} y={ay - 18} textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">{agent.name}</text>
      {origin && (
        <text x={W / 2} y={H - 12} textAnchor="middle" fontSize="12" fontWeight="600" fill="currentColor" opacity="0.75">
          {distanceText(distance_m)} · {heading} · {walkText(distance_m)}
        </text>
      )}
    </svg>
  )
}

export function RouteMap({ agent, origin, distance_m, directions_url, originIsSimulated = false, fill = false }: RouteMapProps) {
  const [travelMode, setTravelMode] = useState<'walking' | 'driving'>('walking')
  const mapsUrl = new URL(directions_url)
  mapsUrl.searchParams.set('travelmode', travelMode)
  if (origin) mapsUrl.searchParams.set('origin', `${origin.lat},${origin.lng}`)

  return (
    <section aria-label={`Way to ${agent.name}`} className={fill ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-col gap-2'}>
      <div className={fill ? 'relative min-h-0 flex-1' : undefined}>
        {tileSource().provider === 'tomtom' ? (
          <TomTomRoute agent={agent} origin={origin} mode={travelMode} fill={fill} />
        ) : config.googleMapsApiKey ? (
          <LiveRoute agent={agent} origin={origin} className={fill ? 'h-full w-full' : 'h-56 w-full'} />
        ) : (
          <SketchRoute agent={agent} origin={origin} distance_m={distance_m} fill={fill} />
        )}
      </div>
      {!fill && (
        <div className="flex gap-2" role="group" aria-label="Directions travel mode">
          {(['walking', 'driving'] as const).map((mode) => (
            <button key={mode} type="button" aria-pressed={travelMode === mode} onClick={() => setTravelMode(mode)} className={`h-10 flex-1 rounded-card border text-sm font-semibold capitalize transition-colors ${travelMode === mode ? 'border-brand bg-brand text-ink' : 'border-line bg-paper text-ink'}`}>
              {mode}
            </button>
          ))}
        </div>
      )}
      <p className={fill ? 'px-5 pt-3 text-xs text-finder-muted' : 'text-xs text-muted'}>
        {origin ? `${originIsSimulated ? 'Simulated demo location · ' : ''}Straight-line distance, ${distanceText(distance_m)}, ${walkText(distance_m)}.` : 'Your location is not shared, so this shows the agent\'s area.'} Ask when you arrive.
      </p>
      {!fill && (
        <a href={mapsUrl.toString()} target="_blank" rel="noopener noreferrer" className="self-start text-xs font-semibold text-brand-text underline">
          Open {travelMode} directions in Maps
        </a>
      )}
    </section>
  )
}
