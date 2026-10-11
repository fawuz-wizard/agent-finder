import type { CoarsePoint } from '@/hooks/useCoarseLocation'

/**
 * A name for where the customer is, so the finder can say "Lumley Beach Road" instead of a
 * fixed area. OpenStreetMap's Nominatim answers from the blunted point (about 110 m), one
 * request per point, remembered for the session. No key, no account; it is the same map data
 * the agents' street points came from. When it cannot answer, the caller says "Your location".
 */
const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse'
const SEARCH = 'https://nominatim.openstreetmap.org/search'
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

/** A place the customer typed and chose: its name, a line to tell it apart, and its point. */
export interface Place {
  name: string
  detail: string | null
  lat: number
  lng: number
}

interface NominatimHit {
  name?: string
  display_name?: string
  lat?: string
  lon?: string
  address?: Record<string, string>
}

/** The second line under a found place: the town or district, when it adds something. */
function placeDetail(address: Record<string, string> | undefined, name: string): string | null {
  if (!address) return null
  for (const k of ['city', 'town', 'county', 'state']) {
    const v = address[k]?.trim()
    if (v && v !== name) return v
  }
  return null
}

/**
 * Places matching what the customer typed, inside Sierra Leone only, at most five. The map
 * knows Freetown's neighbourhoods and roads and the country's towns; a village it has never
 * heard of returns nothing, and the screen says so.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim()
  if (q.length < 2 || typeof fetch !== 'function') return []
  const url = `${SEARCH}?format=jsonv2&countrycodes=sl&limit=5&addressdetails=1&accept-language=en&q=${encodeURIComponent(q)}`
  try {
    const res = await fetch(url, { signal: signal ?? null, headers: { Accept: 'application/json' } })
    if (!res.ok) return []
    const hits = (await res.json()) as NominatimHit[]
    const out: Place[] = []
    for (const h of Array.isArray(hits) ? hits : []) {
      const lat = Number(h.lat)
      const lng = Number(h.lon)
      const name = (h.name?.trim() || placeLabel(h.address) || h.display_name?.split(',')[0]?.trim()) ?? ''
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
      if (out.some((p) => p.name === name)) continue
      out.push({ name, detail: placeDetail(h.address, name), lat: Number(lat.toFixed(3)), lng: Number(lng.toFixed(3)) })
    }
    return out
  } catch {
    return []
  }
}
