/** Web Mercator tile arithmetic, shared by the map and its tests. */
export const TILE = 256

/** A point to fractional tile coordinates at a zoom. */
export function toTile(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const r = (lat * Math.PI) / 180
  return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n }
}

/** The inverse: fractional tile coordinates back to a point. */
export function fromTile(x: number, y: number, z: number): { lat: number; lng: number } {
  const n = 2 ** z
  const lng = (x / n) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
  return { lat, lng }
}

/**
 * Where the map pictures come from. With VITE_TOMTOM_API_KEY set: TomTom's raster map tiles
 * (the provider for the pilot; OpenStreetMap's free servers do not allow app traffic at that
 * volume). Without it: OpenStreetMap, as for the demo on a laptop. `night` is TomTom's dark
 * style, used where the map sits on the dark platform.
 */
export function tileSource(key: string = (import.meta.env.VITE_TOMTOM_API_KEY as string | undefined) ?? '') {
  const k = key.trim()
  if (k)
    return {
      provider: 'tomtom' as const,
      url: (z: number, x: number, y: number, style: 'main' | 'night' = 'main') =>
        `https://api.tomtom.com/map/1/tile/basic/${style}/${z}/${x}/${y}.png?tileSize=256&key=${encodeURIComponent(k)}`,
      credit: { text: '© TomTom', href: 'https://www.tomtom.com/legal/' },
    }
  return {
    provider: 'osm' as const,
    url: (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    credit: { text: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' },
  }
}

export interface LatLngPoint {
  lat: number
  lng: number
}

/** The centre and the largest zoom that keeps every point inside the box, with a margin. */
/** The centre and the largest zoom that keeps every point inside the box, with a margin. */
export function fitPoints(points: LatLngPoint[], w: number, h: number, maxZoom = 17): { lat: number; lng: number; zoom: number } {
  if (points.length === 0) return { lat: 8.47, lng: -13.23, zoom: 12 }
  if (points.length === 1) return { ...points[0]!, zoom: Math.min(16, maxZoom) }
  for (let z = maxZoom; z >= 3; z--) {
    const t = points.map((p) => toTile(p.lat, p.lng, z))
    const xs = t.map((p) => p.x)
    const ys = t.map((p) => p.y)
    if ((Math.max(...xs) - Math.min(...xs)) * TILE <= w * 0.7 && (Math.max(...ys) - Math.min(...ys)) * TILE <= h * 0.7) {
      const lat = points.reduce((n, p) => n + p.lat, 0) / points.length
      const lng = points.reduce((n, p) => n + p.lng, 0) / points.length
      return { lat, lng, zoom: z }
    }
  }
  return { ...points[0]!, zoom: 3 }
}

