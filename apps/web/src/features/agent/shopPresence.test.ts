import { describe, expect, it } from 'vitest'
import { atPin, distanceText, metresBetween } from './shopPresence'

const shop = { lat: 8.4405, lng: -13.2795 }
const nearby = { lat: 8.4412, lng: -13.2791 } // ~90 m
const far = { lat: 8.4455, lng: -13.2795 } // ~550 m

describe('at the shop pin or not', () => {
  it('measures distance roughly right', () => {
    expect(metresBetween(shop, nearby)).toBeGreaterThan(60)
    expect(metresBetween(shop, nearby)).toBeLessThan(120)
    expect(metresBetween(shop, far)).toBeGreaterThan(500)
  })

  it('is at the pin within 300 m, and a rough fix widens the ring by up to 200 m', () => {
    expect(atPin(shop, nearby).at).toBe(true)
    expect(atPin(shop, far).at).toBe(false)
    // ~550 m away: a 300 m fix widens the ring to 500 m (capped at +200), still away.
    expect(atPin(shop, far, 300).at).toBe(false)
    // ~445 m away with a 200 m fix: within the widened ring.
    expect(atPin(shop, { lat: 8.4445, lng: -13.2795 }, 200).at).toBe(true)
    expect(atPin(shop, { lat: 8.4445, lng: -13.2795 }, 0).at).toBe(false)
  })

  it('says the distance plainly for the agent only', () => {
    expect(distanceText(1234)).toBe('1.2 km')
    expect(distanceText(347)).toBe('350 m')
  })
})
