import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { placeLabel, reverseGeocode } from './placeName'

// These tests are about OpenStreetMap unless they say otherwise, whatever this laptop's .env holds.
beforeEach(() => vi.stubEnv('VITE_TOMTOM_API_KEY', ''))
afterEach(() => vi.unstubAllEnvs())

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

describe('with a TomTom key', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.stubEnv('VITE_TOMTOM_API_KEY', 'test-key')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('names where the customer is from TomTom, the street first', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url)
      return { ok: true, json: async () => ({ addresses: [{ address: { streetName: 'Lumley Beach Road', municipalitySubdivision: 'Lumley', municipality: 'Freetown' } }] }) }
    }))
    expect(await reverseGeocode({ lat: 8.441, lng: -13.28 })).toBe('Lumley Beach Road')
    expect(urls[0]).toMatch(/^https:\/\/api\.tomtom\.com\/search\/2\/reverseGeocode\/8\.441,-13\.28\.json\?.*key=test-key/)
  })

  it('finds typed places in Sierra Leone only, a shop by its name, a place by its area', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url)
      return {
        ok: true,
        json: async () => ({
          results: [
            { type: 'POI', poi: { name: 'Kissy Market' }, address: { municipality: 'Freetown' }, position: { lat: 8.4712, lon: -13.2011 } },
            { type: 'Geography', address: { municipalitySubdivision: 'Kissy', municipality: 'Freetown' }, position: { lat: 8.47, lon: -13.2 } },
            { type: 'Street', address: {}, position: {} },
          ],
        }),
      }
    }))
    const { searchPlaces } = await import('./placeName')
    // The exact name first, then the rest of what TomTom found.
    expect(await searchPlaces('Kissy')).toEqual([
      { name: 'Kissy', detail: 'Freetown', lat: 8.47, lng: -13.2 },
      { name: 'Kissy Market', detail: 'Freetown', lat: 8.471, lng: -13.201 },
    ])
    expect(urls[0]).toContain('countrySet=SL')
  })

  it('never names a place by its Freetown ward, and puts the neighbourhood OpenStreetMap knows first', async () => {
    const { tomtomLabel, searchPlaces } = await import('./placeName')
    expect(tomtomLabel({ municipalitySubdivision: 'East II', streetName: 'Kissy Brook Road', municipality: 'Freetown' })).toBe('Kissy Brook Road')
    expect(tomtomLabel({ municipalitySubdivision: 'Lakka', streetName: 'Colony Peninsula Road' })).toBe('Lakka')
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('tomtom')
        ? { ok: true, json: async () => ({ results: [{ type: 'Street', address: { streetName: 'Congo Cross Road', municipalitySubdivision: 'West II', municipality: 'Freetown' }, position: { lat: 8.481, lon: -13.251 } }] }) }
        : { ok: true, json: async () => [{ name: 'Congo Cross', lat: '8.4805', lon: '-13.2522', address: { suburb: 'Congo Cross', city: 'Freetown' } }] },
    ))
    expect((await searchPlaces('Congo Cross')).map((p) => p.name)).toEqual(['Congo Cross', 'Congo Cross Road'])
  })

  it('asks OpenStreetMap for the neighbourhood when TomTom knows only the town', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('tomtom')
        ? { ok: true, json: async () => ({ addresses: [{ address: { municipalitySubdivision: 'East II', municipality: 'Freetown' } }] }) }
        : { ok: true, json: async () => ({ address: { suburb: 'Kissy' } }) },
    ))
    expect(await reverseGeocode({ lat: 8.47, lng: -13.2 })).toBe('Kissy')
  })

  it('falls back to OpenStreetMap when TomTom cannot answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('tomtom') ? { ok: false, status: 403, json: async () => ({}) } : { ok: true, json: async () => ({ address: { suburb: 'Aberdeen' } }) })))
    expect(await reverseGeocode({ lat: 8.49, lng: -13.29 })).toBe('Aberdeen')
  })
})

describe('the area a shop sits in', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('takes the neighbourhood, never a ward or a street, and gives up quietly', async () => {
    vi.stubEnv('VITE_TOMTOM_API_KEY', 'test-key')
    const { areaOf } = await import('./placeName')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ addresses: [{ address: { municipalitySubdivision: 'Lakka', streetName: 'Colony Peninsula Road' } }] }) })))
    expect(await areaOf({ lat: 8.4405, lng: -13.2795 })).toBe('Lakka')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('tomtom') ? { ok: true, json: async () => ({ addresses: [{ address: { municipalitySubdivision: 'East II', municipality: 'Freetown' } }] }) } : { ok: true, json: async () => ({ address: { suburb: 'Kissy' } }) })))
    expect(await areaOf({ lat: 8.47, lng: -13.2 })).toBe('Kissy')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    expect(await areaOf({ lat: 8.47, lng: -13.2 })).toBeNull()
  })
})
