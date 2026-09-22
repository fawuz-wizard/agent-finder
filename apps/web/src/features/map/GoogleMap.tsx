/**
 * Real Google Map (Maps JavaScript API + Advanced Markers). Mounted only when the customer asks
 * for the map; the SDK is loaded on first mount via useMapLoader. Stage 6 wires agents into it.
 */
import { useEffect, useRef } from 'react'
import { Banner, Button } from '@/design'
import { config } from '@/lib/config'
import { useMapLoader } from './useMapLoader'

export interface LatLng { lat: number; lng: number }

export interface GoogleMapProps {
  center: LatLng
  zoom?: number
  className?: string
  onReady?: (map: google.maps.Map, marker: google.maps.MarkerLibrary) => void
}

export function GoogleMap({ center, zoom = 15, className, onReady }: GoogleMapProps) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const { state, libs, error, load } = useMapLoader()

  useEffect(() => {
    if (state === 'idle') void load()
  }, [state, load])

  useEffect(() => {
    if (state !== 'ready' || !libs || !ref.current || mapRef.current) return
    const map = new libs.maps.Map(ref.current, {
      center,
      zoom,
      // Advanced Markers need a Map ID. Google's DEMO_MAP_ID renders the default style, so a
      // key alone is enough for a demo; set VITE_GOOGLE_MAPS_MAP_ID for a styled production map.
      mapId: config.googleMapsMapId || 'DEMO_MAP_ID',
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      clickableIcons: false,
    })
    mapRef.current = map
    onReady?.(map, libs.marker)
  }, [state, libs, center, zoom, onReady])

  if (state === 'error') {
    return (
      <Banner tone="warning">
        The map couldn't load ({error}). The list above still works.
        <div className="mt-2"><Button variant="secondary" size="control" block={false} onClick={() => void load()}>Try again</Button></div>
      </Banner>
    )
  }
  return (
    <div className={className} aria-busy={state !== 'ready'}>
      <div ref={ref} className="h-full w-full rounded-card bg-line" role="application" aria-label="Map of nearby agents" />
    </div>
  )
}
