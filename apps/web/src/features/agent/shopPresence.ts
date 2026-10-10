/**
 * Has the agent left the shop? Compared only while the app is open, from the phone's
 * position against the shop's pin. The rule, agreed 2026-10-10: say so first, then set
 * Away after a grace period, never silently, always with one tap back.
 */
export const LEFT_SHOP_METRES = 300
export const AWAY_GRACE_MS = 10 * 60 * 1000
export const CHECK_EVERY_MS = 5 * 60 * 1000

export interface Point {
  lat: number
  lng: number
}

/** Straight-line metres between two points, fine over a few kilometres. */
export function metresBetween(a: Point, b: Point): number {
  const r = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}

export type PresenceCall =
  | { kind: 'at_shop' }
  | { kind: 'left'; metres: number; sinceMs: number; autoAwayInMs: number }
  | { kind: 'auto_away'; metres: number }

/**
 * What to do now. `leftSince` is when the phone was first seen away from the pin (null if it
 * was at the shop at the last check). Only an agent who is Open is ever asked; Away and
 * Closed are already what they would be told to set.
 */
export function presenceCall(
  presence: 'open' | 'hidden' | 'closed',
  shop: Point | null,
  phone: Point | null,
  leftSince: number | null,
  now: number,
  accuracyM = 0,
): PresenceCall {
  if (presence !== 'open' || !shop || !phone) return { kind: 'at_shop' }
  const metres = Math.round(metresBetween(shop, phone))
  // A rough fix is not evidence of leaving: widen the ring by the fix's own uncertainty.
  if (metres <= LEFT_SHOP_METRES + Math.min(accuracyM, 200)) return { kind: 'at_shop' }
  const since = leftSince ?? now
  const elapsed = now - since
  if (elapsed >= AWAY_GRACE_MS) return { kind: 'auto_away', metres }
  return { kind: 'left', metres, sinceMs: since, autoAwayInMs: AWAY_GRACE_MS - elapsed }
}
