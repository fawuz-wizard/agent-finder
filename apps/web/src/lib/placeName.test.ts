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
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ address: { suburb: 'Lumley' } }) }))
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
