import type { Place } from './placeName'

/** The last places the customer searched by hand, newest first, on this phone only. */
const KEY = 'af.places'
const MAX = 5

export function readPlaces(): Place[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list)
      ? list.filter((p): p is Place => typeof p === 'object' && p !== null && typeof (p as Place).name === 'string' && Number.isFinite((p as Place).lat) && Number.isFinite((p as Place).lng)).slice(0, MAX)
      : []
  } catch {
    return []
  }
}

export function rememberPlace(place: Place): Place[] {
  const next = [place, ...readPlaces().filter((p) => p.name !== place.name)].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Fine without it.
  }
  return next
}
