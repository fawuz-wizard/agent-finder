import type { CoarsePoint } from '@/hooks/useCoarseLocation'

/**
 * A name for where the customer is, so the finder can say "Lumley Beach Road" instead of a
 * fixed area. OpenStreetMap's Nominatim answers from the blunted point (about 110 m), one
 * request per point, remembered for the session. No key, no account; it is the same map data
 * the agents' street points came from. When it cannot answer, the caller says "Your location".
 */
const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse'
const CACHE = 'af.place:'

interface NominatimAnswer {
  address?: Record<string, string>
}

/** The most local name people use, from the parts Nominatim returns. */
export function placeLabel(address: Record<string, string> | undefined): string | null {
  if (!address) return null
  const keys = ['neighbourhood', 'suburb', 'quarter', 'residential', 'village', 'hamlet', 'town', 'city_district', 'road', 'city']
  for (const k of keys) {
    const v = address[k]?.trim()
    if (v) return v.length > 40 ? `${v.slice(0, 39)}…` : v
  }
  return null
}

function cacheKey(p: CoarsePoint): string {
  return `${CACHE}${p.lat},${p.lng}`
}

export async function reverseGeocode(point: CoarsePoint, signal?: AbortSignal): Promise<string | null> {
  const key = cacheKey(point)
  try {
    const hit = sessionStorage.getItem(key)
    if (hit !== null) return hit || null
  } catch {
    // No storage: ask every time.
  }
  if (typeof fetch !== 'function') return null
  const url = `${ENDPOINT}?format=jsonv2&zoom=16&accept-language=en&lat=${point.lat}&lon=${point.lng}`
  try {
    const res = await fetch(url, { signal: signal ?? null, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const body = (await res.json()) as NominatimAnswer
    const label = placeLabel(body.address)
    try {
      sessionStorage.setItem(key, label ?? '')
    } catch {
      // Fine without the cache.
    }
    return label
  } catch {
    return null
  }
}
