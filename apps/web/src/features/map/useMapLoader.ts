/**
 * The ONLY place the Google Maps JavaScript SDK is loaded.
 *
 * - Nothing here runs at import time. The SDK is fetched the first time `load()` is called,
 *   which happens only when a customer asks to see the map.
 * - One script tag per session; concurrent callers share the same promise.
 * - The API key is a browser key restricted by HTTP referrer (see docs/google-cloud-setup.md).
 */
import { useCallback, useState } from 'react'
import { config } from '@/lib/config'

type MapsLibraries = { maps: google.maps.MapsLibrary; marker: google.maps.MarkerLibrary }

let loading: Promise<MapsLibraries> | null = null

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && typeof google.maps?.importLibrary === 'function') return resolve()
    const params = new URLSearchParams({
      key: config.googleMapsApiKey,
      v: 'weekly',
      loading: 'async',
      libraries: 'marker',
    })
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Google Maps failed to load'))
    document.head.appendChild(s)
  })
}

export function loadGoogleMaps(): Promise<MapsLibraries> {
  if (!config.googleMapsApiKey) {
    return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY is not set'))
  }
  if (!loading) {
    loading = injectScript()
      .then(async () => {
        const maps = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary
        const marker = (await google.maps.importLibrary('marker')) as google.maps.MarkerLibrary
        return { maps, marker }
      })
      .catch((e: unknown) => {
        loading = null
        throw e
      })
  }
  return loading
}

export type MapLoadState = 'idle' | 'loading' | 'ready' | 'error'

export function useMapLoader() {
  const [state, setState] = useState<MapLoadState>('idle')
  const [libs, setLibs] = useState<MapsLibraries | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState('loading')
    try {
      const l = await loadGoogleMaps()
      setLibs(l)
      setState('ready')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Map unavailable')
      setState('error')
    }
  }, [])

  return { state, libs, error, load }
}
