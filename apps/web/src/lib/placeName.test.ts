import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { placeLabel, reverseGeocode } from './placeName'

describe('the name of where the customer is', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('prefers the most local name people use', () => {
    expect(placeLabel({ road: 'Peninsular Road', neighbourhood: 'Lumley Beach', city: 'Freetown' })).toBe('Lumley Beach')
    expect(placeLabel({ road: 'Wilkinson Road', city: 'Freetown' })).toBe('Wilkinson Road')
    expect(placeLabel({ city: 'Freetown' })).toBe('Freetown')
    expect(placeLabel({})).toBeNull()
    expect(placeLabel(undefined)).toBeNull()
  })

  it('asks OpenStreetMap once per point and remembers the answer', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(async () => ({ ok: true, json: async () => ({ address: { suburb: 'Lumley' } }) }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await reverseGeocode({ lat: 8.47, lng: -13.261 })).toBe('Lumley')
    expect(await reverseGeocode({ lat: 8.47, lng: -13.261 })).toBe('Lumley')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/nominatim\.openstreetmap\.org\/reverse\?.*lat=8\.47&lon=-13\.261/)
  })

  it('says nothing rather than something wrong when the service fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    expect(await reverseGeocode({ lat: 8.5, lng: -13.2 })).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await reverseGeocode({ lat: 8.6, lng: -13.2 })).toBeNull()
  })
})

describe('searchPlaces', () => {
  it('asks the map inside Sierra Leone only and returns named points, blunted', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes('q=Kissy')
          ? [
              { name: 'Kissy', lat: '8.48123', lon: '-13.19876', address: { suburb: 'Kissy', city: 'Freetown' } },
              { name: 'Kissy Road', lat: '8.4850', lon: '-13.2100', address: { road: 'Kissy Road', city: 'Freetown' } },
              { name: 'Kissy', lat: '8.48', lon: '-13.20', address: {} },
            ]
          : [],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { searchPlaces } = await import('./placeName')
    const found = await searchPlaces('Kissy')
    expect(fetchMock.mock.calls[0]![0]).toContain('countrycodes=sl')
    expect(found).toEqual([
      { name: 'Kissy', detail: 'Freetown', lat: 8.481, lng: -13.199 },
      { name: 'Kissy Road', detail: 'Freetown', lat: 8.485, lng: -13.21 },
    ])
    expect(await searchPlaces('K')).toEqual([])
    vi.unstubAllGlobals()
  })
})
