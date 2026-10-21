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
