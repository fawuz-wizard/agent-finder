import { describe, expect, it } from 'vitest'
import { AWAY_GRACE_MS, metresBetween, presenceCall } from './shopPresence'

const shop = { lat: 8.4405, lng: -13.2795 }
const nearby = { lat: 8.4412, lng: -13.2791 } // ~90 m
const far = { lat: 8.4455, lng: -13.2795 } // ~550 m

describe('leaving the pinned shop', () => {
  it('measures distance roughly right', () => {
    expect(metresBetween(shop, nearby)).toBeGreaterThan(60)
    expect(metresBetween(shop, nearby)).toBeLessThan(120)
    expect(metresBetween(shop, far)).toBeGreaterThan(500)
  })

  it('says nothing at the shop, nothing without a pin, nothing when already Away or Closed', () => {
    expect(presenceCall('open', shop, nearby, null, 0)).toEqual({ kind: 'at_shop' })
    expect(presenceCall('open', null, far, null, 0)).toEqual({ kind: 'at_shop' })
    expect(presenceCall('hidden', shop, far, null, 0)).toEqual({ kind: 'at_shop' })
    expect(presenceCall('closed', shop, far, null, 0)).toEqual({ kind: 'at_shop' })
  })

  it('asks first, then sets Away only after the grace period', () => {
    const t0 = 1_000_000
    const first = presenceCall('open', shop, far, null, t0)
    expect(first.kind).toBe('left')
    if (first.kind !== 'left') throw new Error('expected left')
    expect(first.autoAwayInMs).toBe(AWAY_GRACE_MS)
    const later = presenceCall('open', shop, far, t0, t0 + AWAY_GRACE_MS - 1)
    expect(later.kind).toBe('left')
    const done = presenceCall('open', shop, far, t0, t0 + AWAY_GRACE_MS)
    expect(done.kind).toBe('auto_away')
  })

  it('does not count a rough fix as leaving', () => {
    // 550 m away but the fix is only good to 400 m: within the widened ring (300 + 200 cap).
    const vague = { lat: 8.4445, lng: -13.2795 } // ~440 m
    expect(presenceCall('open', shop, vague, null, 0, 400)).toEqual({ kind: 'at_shop' })
    expect(presenceCall('open', shop, vague, null, 0, 20).kind).toBe('left')
  })
})
