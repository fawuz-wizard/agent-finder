/**
 * The way from the customer to the shop, from TomTom's Routing API with the map key: the
 * points of the route and how long it takes, walking or driving. Without a key, or when TomTom
 * cannot answer, null: the screen draws the straight line instead. Nothing is stored.
 */
export interface Route {
  points: { lat: number; lng: number }[]
  metres: number
  seconds: number
}

export async function fetchRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: 'walking' | 'driving',
  signal?: AbortSignal,
  key: string = ((import.meta.env.VITE_TOMTOM_API_KEY as string | undefined) ?? '').trim(),
): Promise<Route | null> {
  if (!key || typeof fetch !== 'function') return null
  const travel = mode === 'walking' ? 'pedestrian' : 'car'
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${from.lat},${from.lng}:${to.lat},${to.lng}/json?travelMode=${travel}&routeType=fastest&key=${encodeURIComponent(key)}`
  try {
    const res = await fetch(url, { signal: signal ?? null })
    if (!res.ok) return null
    const body = (await res.json()) as { routes?: { summary?: { lengthInMeters?: number; travelTimeInSeconds?: number }; legs?: { points?: { latitude: number; longitude: number }[] }[] }[] }
    const r = body.routes?.[0]
    const points = (r?.legs ?? []).flatMap((l) => l.points ?? []).map((p) => ({ lat: p.latitude, lng: p.longitude }))
    if (!r || points.length < 2) return null
    return { points, metres: r.summary?.lengthInMeters ?? 0, seconds: r.summary?.travelTimeInSeconds ?? 0 }
  } catch {
    return null
  }
}

/** Metres between two points as the crow flies: what the screen says when no route came back. */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}
