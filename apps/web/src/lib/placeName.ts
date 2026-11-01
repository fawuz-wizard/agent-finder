import type { CoarsePoint } from '@/hooks/useCoarseLocation'

/**
 * A name for where the customer is, so the finder can say "Lumley Beach Road" instead of a
 * fixed area, and the places a customer types. With VITE_TOMTOM_API_KEY set, TomTom's Search
 * API answers (the provider for the pilot; Nominatim's free service does not allow app traffic
 * at that volume); without it, or when TomTom cannot be reached, OpenStreetMap's Nominatim.
 * Lookups use the blunted point (about 110 m), one request per point, remembered for the
 * session. When nothing answers, the caller says "Your location".
 */
const tomtomKey = () => ((import.meta.env.VITE_TOMTOM_API_KEY as string | undefined) ?? '').trim()
const TOMTOM = 'https://api.tomtom.com/search/2'
/** Freetown: where a typed place is looked for first, inside Sierra Leone only. */
const BIAS = { lat: 8.47, lng: -13.23 }

interface TomTomAddress {
  streetName?: string
  municipalitySubdivision?: string
  municipality?: string
  localName?: string
  countrySecondarySubdivision?: string
  countrySubdivision?: string
  freeformAddress?: string
}
interface TomTomResult {
  type?: string
  poi?: { name?: string }
  address?: TomTomAddress
  position?: { lat?: number; lon?: number }
}

const short = (v: string) => (v.length > 40 ? `${v.slice(0, 39)}…` : v)

/** Freetown's wards (East II, Central I…): TomTom's "subdivision" there, not a name people use. */
const WARD = /^(east|west|central|north|south)\s+[ivx]+$/i

/**
 * The most local name in a TomTom address that people use: the area when it is a real place
 * (Lakka, Kissy Town), otherwise the street, otherwise the town. Never a ward number.
 */
export function tomtomLabel(a: TomTomAddress | undefined): string | null {
  if (!a) return null
  const sub = a.municipalitySubdivision?.trim()
  for (const v of [sub && !WARD.test(sub) ? sub : undefined, a.streetName, a.localName, a.municipality]) {
    const s = v?.trim()
    if (s) return short(s)
  }
  return null
}

/**
 * Where the customer is, from TomTom: the street they are on (TomTom's streets are good in
 * Sierra Leone), else a real area name. When TomTom knows only the town, null: the caller asks
 * OpenStreetMap, which knows Freetown's neighbourhoods.
 */
async function tomtomReverse(point: CoarsePoint, key: string, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(`${TOMTOM}/reverseGeocode/${point.lat},${point.lng}.json?language=en-GB&radius=250&key=${encodeURIComponent(key)}`, { signal: signal ?? null })
  if (!res.ok) throw new Error('tomtom')
  const body = (await res.json()) as { addresses?: { address?: TomTomAddress }[] }
  const a = body.addresses?.[0]?.address
  const sub = a?.municipalitySubdivision?.trim()
  const s = a?.streetName?.trim() || (sub && !WARD.test(sub) ? sub : '')
  return s ? short(s) : null
}

async function tomtomSearch(q: string, key: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `${TOMTOM}/search/${encodeURIComponent(q)}.json?countrySet=SL&limit=5&typeahead=true&language=en-GB&lat=${BIAS.lat}&lon=${BIAS.lng}&key=${encodeURIComponent(key)}`
  const res = await fetch(url, { signal: signal ?? null })
  if (!res.ok) throw new Error('tomtom')
  const body = (await res.json()) as { results?: TomTomResult[] }
  const out: Place[] = []
  for (const r of body.results ?? []) {
    const lat = Number(r.position?.lat)
    const lng = Number(r.position?.lon)
    // A shop by its name, a street by its street name, an area by its area.
    const name = (r.type === 'POI' && r.poi?.name?.trim()) || (r.type === 'Street' && r.address?.streetName?.trim()) || tomtomLabel(r.address) || r.address?.freeformAddress?.split(',')[0]?.trim() || ''
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || out.some((p) => p.name === name)) continue
    const a = r.address
    const detail = [a?.municipality, a?.countrySecondarySubdivision, a?.countrySubdivision].map((v) => v?.trim()).find((v) => v && v !== name) ?? null
    out.push({ name: short(name), detail, lat: Number(lat.toFixed(3)), lng: Number(lng.toFixed(3)) })
  }
  return out
}

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
  const tt = tomtomKey()
  if (tt) {
    try {
      const label = await tomtomReverse(point, tt, signal)
      if (label) {
        try {
          sessionStorage.setItem(key, label)
        } catch {
          // Fine without the cache.
        }
        return label
      }
      // TomTom knows only the town here: Nominatim below names the neighbourhood.
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null
      // TomTom could not answer: Nominatim below.
    }
  }
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
/** Nominatim answers 403 or 429 when asked too often; one short wait and a second try is its own advice. */
async function fetchPlaces(url: string, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(url, { signal: signal ?? null, headers: { Accept: 'application/json' } })
  if (res.status !== 403 && res.status !== 429) return res
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, 1200)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
  return fetch(url, { signal: signal ?? null, headers: { Accept: 'application/json' } })
}

/** The map could not be reached: offline, a refused request, a broken answer. Not "no such place". */
export class PlaceLookupError extends Error {
  constructor() {
    super('Could not reach the map. Check your connection and try again.')
    this.name = 'PlaceLookupError'
  }
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim()
  if (q.length < 2 || typeof fetch !== 'function') return []
  const tt = tomtomKey()
  if (tt) {
    // Both at once: TomTom knows Sierra Leone's streets and shops, OpenStreetMap its
    // neighbourhoods (Kissy, Congo Cross). An exact name comes first, then TomTom's places, then
    // OpenStreetMap's; a result that does not contain what was typed is dropped.
    const quiet = (e: unknown): Place[] => {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      return []
    }
    const [tom, osm] = await Promise.all([tomtomSearch(q, tt, signal).catch(quiet), nominatimSearch(q, signal).catch(quiet)])
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const matches = (p: Place) => words.every((w) => p.name.toLowerCase().split(/[\s,'-]+/).some((n) => n.startsWith(w)))
    const exact = (p: Place) => p.name.toLowerCase() === q.toLowerCase()
    const out: Place[] = []
    for (const p of [...[...tom, ...osm].filter(exact), ...tom.filter(matches), ...osm.filter(matches)]) {
      if (!out.some((o) => o.name.toLowerCase() === p.name.toLowerCase())) out.push(p)
    }
    if (out.length || tom.length || osm.length) return out.slice(0, 5)
    throw new PlaceLookupError()
  }
  return nominatimSearch(q, signal)
}

async function nominatimSearch(q: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `${SEARCH}?format=jsonv2&countrycodes=sl&limit=5&addressdetails=1&accept-language=en&q=${encodeURIComponent(q)}`
  try {
    const res = await fetchPlaces(url, signal)
    if (!res.ok) throw new PlaceLookupError()
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
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new PlaceLookupError()
  }
}

/**
 * The area a shop's pin sits in, for registering an agent: the neighbourhood people use
 * (Lakka, Lumley), never a street and never a Freetown ward number. TomTom's area when it is a
 * real place, otherwise OpenStreetMap's neighbourhood, otherwise the town. Null when nothing
 * answers: the screen then asks the aggregator to type it.
 */
export async function areaOf(point: { lat: number; lng: number }, signal?: AbortSignal): Promise<string | null> {
  if (typeof fetch !== 'function') return null
  let town: string | null = null
  const tt = tomtomKey()
  if (tt) {
    try {
      const res = await fetch(`${TOMTOM}/reverseGeocode/${point.lat},${point.lng}.json?language=en-GB&radius=250&key=${encodeURIComponent(tt)}`, { signal: signal ?? null })
      if (res.ok) {
        const a = ((await res.json()) as { addresses?: { address?: TomTomAddress }[] }).addresses?.[0]?.address
        const sub = a?.municipalitySubdivision?.trim()
        if (sub && !WARD.test(sub)) return short(sub)
        town = a?.municipality?.trim() || null
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null
    }
  }
  try {
    const res = await fetch(`${ENDPOINT}?format=jsonv2&zoom=16&accept-language=en&lat=${point.lat}&lon=${point.lng}`, { signal: signal ?? null, headers: { Accept: 'application/json' } })
    if (res.ok) {
      const label = placeLabel(((await res.json()) as NominatimAnswer).address)
      if (label) return label
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
  }
  return town ? short(town) : null
}
