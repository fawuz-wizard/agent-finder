/**
 * Staying visible: the phone compares its own position with the shop's pin and tells the
 * server only "at the pin" or "away" (the position never leaves the phone). The rules, agreed
 * 2026-11-01: no question is ever asked; away from the pin hides the agent at once and coming
 * back shows them again; the app checks in when it opens, when a transaction is recorded and
 * every five minutes while it is open; two hours without a check-in hides the agent until the
 * app is opened at the shop. The server applies the same numbers (services/checkin.py).
 */
export const LEFT_SHOP_METRES = 300
export const CHECK_EVERY_MS = 5 * 60 * 1000
/** "Open Agent Finder to stay visible", this long before the two hours run out. */
export const REMIND_BEFORE_MS = 15 * 60 * 1000
/** After the agent chooses Away: reminders at these minutes, in working hours only. */
export const AWAY_REMINDER_MIN = [30, 60, 90] as const
/** Ask the watcher to check in now (after recording a transaction, for instance). */
export const CHECK_IN_NOW = 'af-check-in-now'

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

/** Is the phone at the pin? A rough fix is not evidence of leaving: the ring widens by its own uncertainty, up to 200 m. */
export function atPin(shop: Point, phone: Point, accuracyM = 0): { at: boolean; metres: number } {
  const metres = Math.round(metresBetween(shop, phone))
  return { at: metres <= LEFT_SHOP_METRES + Math.min(accuracyM, 200), metres }
}

/** "1.2 km" or "350 m", for the agent's own notification only; never sent anywhere. */
export function distanceText(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres / 10) * 10} m`
}
