import { describe, expect, it } from 'vitest'
import { tileSource } from './tiles'

describe('where the map pictures come from', () => {
  it('uses TomTom with a key, in the light or night style, and credits TomTom', () => {
    const s = tileSource(' abc123 ')
    expect(s.provider).toBe('tomtom')
    expect(s.url(15, 1, 2)).toBe('https://api.tomtom.com/map/1/tile/basic/main/15/1/2.png?tileSize=256&key=abc123')
    expect(s.url(15, 1, 2, 'night')).toContain('/basic/night/15/1/2.png')
    expect(s.credit.text).toBe('© TomTom')
  })

  it('falls back to OpenStreetMap without a key', () => {
    const s = tileSource('')
    expect(s.provider).toBe('osm')
    expect(s.url(12, 3, 4)).toBe('https://tile.openstreetmap.org/12/3/4.png')
  })
})
