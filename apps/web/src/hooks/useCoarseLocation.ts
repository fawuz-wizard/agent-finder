import { useCallback, useEffect, useRef, useState } from 'react'
import { explainLocation, type LocationProblem } from '@/lib/location'

/**
 * The customer never types where they are. The browser reports it, and we immediately
 * blunt it: coordinates are rounded to three decimals (about 110 m) before they leave
 * this hook, so no precise position is ever held in state, put in a URL or sent to the
 * server. Everything degrades: if permission is denied, unavailable or slow, the caller
 * falls back to a named area and the search still works — after telling the customer how
 * to turn location on. When the phone's permission flips to allowed, the hook asks again
 * by itself, so the prompt resolves without another tap.
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
  const [problem, setProblem] = useState<LocationProblem | null>(null)
  const asked = useRef(false)

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setProblem(explainLocation(null))
      setState('unavailable')
      return
    }
    setState('locating')
    setProblem(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ lat: blunt(pos.coords.latitude), lng: blunt(pos.coords.longitude) })
        setState('ready')
      },
      (err) => {
        setProblem(explainLocation(err))
        setState(err.code === 1 ? 'denied' : 'unavailable')
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

  // Where the browser exposes it, watch the permission: the moment it becomes "granted"
  // (the customer flipped it on in settings and came back), ask for the position again.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return
    let status: PermissionStatus | null = null
    let cancelled = false
    const onChange = () => {
      if (status?.state === 'granted') request()
    }
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((s) => {
        if (cancelled) return
        status = s
        s.addEventListener('change', onChange)
      })
      .catch(() => {
        // Not every browser knows the "geolocation" permission name; the prompt still works.
      })
    return () => {
      cancelled = true
      status?.removeEventListener('change', onChange)
    }
  }, [request])

  return { state, point, problem, request }
}
