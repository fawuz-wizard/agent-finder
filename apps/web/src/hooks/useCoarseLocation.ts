import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The customer never types where they are. The browser reports it, and we immediately
 * blunt it: coordinates are rounded to three decimals (about 110 m) before they leave
 * this hook, so no precise position is ever held in state, put in a URL or sent to the
 * server. Everything degrades: if permission is denied, unavailable or slow, the caller
 * falls back to a named area and the search still works.
 */
export type LocationState = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable'

export interface CoarsePoint {
  lat: number
  lng: number
}

const COARSE_DP = 3
const TIMEOUT_MS = 8_000

function blunt(n: number): number {
  return Number(n.toFixed(COARSE_DP))
}

export function useCoarseLocation(auto = true) {
  const [state, setState] = useState<LocationState>('idle')
  const [point, setPoint] = useState<CoarsePoint | null>(null)
  const asked = useRef(false)

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('unavailable')
      return
    }
    setState('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ lat: blunt(pos.coords.latitude), lng: blunt(pos.coords.longitude) })
        setState('ready')
      },
      (err) => {
        setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
      },
      // Low accuracy on purpose: cheaper, faster, and enough for "which agents are near me".
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 5 * 60_000 },
    )
  }, [])

  useEffect(() => {
    if (!auto || asked.current) return
    asked.current = true
    request()
  }, [auto, request])

  return { state, point, request }
}
