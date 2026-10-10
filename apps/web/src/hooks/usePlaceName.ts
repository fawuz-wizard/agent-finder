import { useEffect, useState } from 'react'
import type { CoarsePoint } from './useCoarseLocation'
import { reverseGeocode } from '@/lib/placeName'

export type PlaceState = 'idle' | 'finding' | 'ready' | 'unknown'

/** The name of the place at a point: "finding" while asked, "unknown" when no one can say. */
export function usePlaceName(point: CoarsePoint | null): { name: string | null; state: PlaceState } {
  const [name, setName] = useState<string | null>(null)
  const [state, setState] = useState<PlaceState>('idle')
  const key = point ? `${point.lat},${point.lng}` : ''

  useEffect(() => {
    if (!point) {
      setName(null)
      setState('idle')
      return
    }
    const ctrl = new AbortController()
    setState('finding')
    reverseGeocode(point, ctrl.signal).then((label) => {
      if (ctrl.signal.aborted) return
      setName(label)
      setState(label ? 'ready' : 'unknown')
    })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { name, state }
}
