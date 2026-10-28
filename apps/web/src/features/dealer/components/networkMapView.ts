import { TILE, fromTile, toTile } from '@/lib/tiles'

/** The national map's zoom limits and how it fits a set of points; shared with its tests. */
export const MIN_ZOOM = 7
export const MAX_ZOOM = 17
/** From this zoom the pins replace the town bubbles. */
export const PIN_ZOOM = 12

/** The centre and the largest zoom that keeps every point inside the box, with a margin. */
export function fitView(points: { lat: number; lng: number }[], w: number, h: number, maxZoom = 15): { lat: number; lng: number; zoom: number } {
  if (points.length === 0) return { lat: 8.55, lng: -11.85, zoom: MIN_ZOOM + 1 }
  for (let z = maxZoom; z >= MIN_ZOOM; z--) {
    const t = points.map((p) => toTile(p.lat, p.lng, z))
    const xs = t.map((p) => p.x)
    const ys = t.map((p) => p.y)
    const spanX = (Math.max(...xs) - Math.min(...xs)) * TILE
    const spanY = (Math.max(...ys) - Math.min(...ys)) * TILE
    if (spanX <= w * 0.75 && spanY <= h * 0.75) {
      const c = fromTile((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, z)
      return { lat: c.lat, lng: c.lng, zoom: z }
    }
  }
  return { lat: 8.55, lng: -11.85, zoom: MIN_ZOOM }
}
