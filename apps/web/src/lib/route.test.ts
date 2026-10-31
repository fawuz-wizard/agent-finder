import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRoute } from './route'

describe('the way to the shop from TomTom', () => {
  afterEach(() => vi.unstubAllGlobals())
  const from = { lat: 8.4465, lng: -13.272 }
  const to = { lat: 8.4405, lng: -13.2795 }

  it('asks for a walking route and returns its points and time', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url)
      return { ok: true, json: async () => ({ routes: [{ summary: { lengthInMeters: 291, travelTimeInSeconds: 240 }, legs: [{ points: [{ latitude: 8.4465, longitude: -13.272 }, { latitude: 8.441, longitude: -13.279 }] }] }] }) }
    }))
    expect(await fetchRoute(from, to, 'walking', undefined, 'k')).toEqual({ points: [{ lat: 8.4465, lng: -13.272 }, { lat: 8.441, lng: -13.279 }], metres: 291, seconds: 240 })
    expect(urls[0]).toContain('travelMode=pedestrian')
  })

  it('gives no route without a key or when TomTom cannot answer, so the straight line is drawn', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchRoute(from, to, 'driving', undefined, '')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await fetchRoute(from, to, 'driving', undefined, 'k')).toBeNull()
  })
})

describe('straight-line distance', () => {
  it('measures metres between two points', async () => {
    const { haversineM } = await import('./route')
    expect(haversineM({ lat: 8.4465, lng: -13.272 }, { lat: 8.4465, lng: -13.272 })).toBe(0)
    const d = haversineM({ lat: 8.4465, lng: -13.272 }, { lat: 8.4405, lng: -13.2795 })
    expect(d).toBeGreaterThan(1000)
    expect(d).toBeLessThan(1150)
  })
})
