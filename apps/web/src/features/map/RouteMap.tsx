/**
 * The way to an agent, drawn inside the app: a real Google map with both points and the
 * straight line between them when a Maps key is configured, otherwise an inline sketch from
 * the same coarse points. The customer never has to leave Max it to see where to go. No route
 * service is called — it is the straight line and an honest walking estimate.
 */
import { useCallback } from 'react'
import { config } from '@/lib/config'
import { GoogleMap, type LatLng } from './GoogleMap'
import { buildAgentMarkerElement } from './AgentMarker'

export interface RouteMapProps {
  agent: { name: string; lat: number; lng: number }
  origin: LatLng | null
  distance_m: number
  /** Kept as a quiet secondary link for people who want their own maps app. */
  directions_url: string
  /** The customer says they are going. Only then does the "how did it go?" question follow. */
  onGoing?: () => void
  going?: boolean
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

function LiveRoute({ agent, origin }: { agent: RouteMapProps['agent']; origin: LatLng | null }) {
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
  return <GoogleMap center={{ lat: agent.lat, lng: agent.lng }} zoom={16} className="h-56 w-full" onReady={onReady} />
}

/** No Maps key (or offline): the same two points as a sketch. Scaled to fit, north up. */
function SketchRoute({ agent, origin, distance_m }: { agent: RouteMapProps['agent']; origin: LatLng | null; distance_m: number }) {
  const W = 320
  const H = 220
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
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-56 w-full rounded-card border border-line bg-canvas">
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
      <circle cx={ax} cy={ay} r="11" fill="#FF7900" stroke="#C25E00" strokeWidth="3" />
      <text x={ax} y={ay - 18} textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">{agent.name}</text>
      {origin && (
        <text x={W / 2} y={H - 12} textAnchor="middle" fontSize="12" fontWeight="600" fill="currentColor" opacity="0.75">
          {distanceText(distance_m)} · {heading} · {walkText(distance_m)}
        </text>
      )}
    </svg>
  )
}

export function RouteMap({ agent, origin, distance_m, directions_url, onGoing, going = false }: RouteMapProps) {
  return (
    <section aria-label={`Way to ${agent.name}`} className="flex flex-col gap-2">
      {config.googleMapsApiKey ? <LiveRoute agent={agent} origin={origin} /> : <SketchRoute agent={agent} origin={origin} distance_m={distance_m} />}
      <p className="text-xs text-muted">
        {origin ? `Straight line, ${distanceText(distance_m)}, ${walkText(distance_m)}.` : 'Your location is not shared, so this shows the agent\'s area.'} Ask when you arrive.
      </p>
      {onGoing &&
        (going ? (
          <p className="text-sm font-semibold text-success-strong" role="status">
            Noted. We will ask how it went later — only once, and you can skip it.
          </p>
        ) : (
          <button
            type="button"
            onClick={onGoing}
            className="inline-flex h-control w-full items-center justify-center rounded-card border-2 border-brand-deep text-base font-bold text-brand-text"
          >
            I'm going there
          </button>
        ))}
      <a
        href={directions_url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onGoing}
        className="self-start text-xs font-semibold text-brand-text underline"
      >
        Open in your maps app instead
      </a>
    </section>
  )
}
