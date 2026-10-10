import { useCallback, useEffect, useRef, useState } from 'react'
import { explainLocation, type LocationProblem } from '@/lib/location'
import { nativeLocation } from '@/lib/nativeLocation'

/**
 * The customer never types where they are. The browser reports it, and we immediately
 * blunt it: coordinates are rounded to three decimals (about 110 m) before they leave
 * this hook, so no precise position is ever held in state, put in a URL or sent to the
 * server. Everything degrades: if permission is denied, unavailable or slow, the caller
 * falls back to a named area and the search still works — after telling the customer how
 * to turn location on. When the phone's permission flips to allowed, the hook asks again
 * by itself, so the prompt resolves without another tap. In the Android shell, a phone with
 * location switched off gets the system "Turn on location?" dialog the first time, and
 * again whenever the customer taps Turn on location.
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
  const offered = useRef(false)

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
        const problem = explainLocation(err)
        setProblem(problem)
        setState(err.code === 1 ? 'denied' : 'unavailable')
        // Location switched off on the phone itself: raise the system dialog once, unasked.
        if (problem.reason === 'off' && nativeLocation.available() && !offered.current) {
          offered.current = true
          void nativeLocation.turnOn().then((s) => s.enabled && request())
        }
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

  /** Turn on location: the system dialog where there is one, then ask the phone again. */
  const turnOn = useCallback(() => {
    offered.current = true
    setState('locating')
    void nativeLocation.turnOn().then(() => request())
  }, [request])

  return { state, point, problem, request, turnOn }
}
