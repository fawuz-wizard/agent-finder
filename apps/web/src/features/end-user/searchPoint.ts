/** The phone's blunted position carried in the URL (~110 m); absent when location was off. */
export function pointFrom(params: URLSearchParams): { lat: number; lng: number } | null {
  const lat = Number(params.get('lat'))
  const lng = Number(params.get('lng'))
  if (!params.get('lat') || !params.get('lng') || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat: Number(lat.toFixed(3)), lng: Number(lng.toFixed(3)) }
}
