import { afterEach, describe, expect, it } from 'vitest'
import { SESSION_KEY } from '@/features/auth/session'
import { demoMapAgents, demoMapCsv, demoMapSummary } from './demoNationalMap'
import { fitView } from '@/features/dealer/components/networkMapView'

function signedInAs(permissions: string[]) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 't', role: 'dealer', name: 'x', ref: 'x', permissions }))
}
const KEYS = ['registered', 'transacting', 'no_file_figure', 'app_active', 'located', 'confirmed'] as const

afterEach(() => sessionStorage.clear())

describe('the national map, demo copy', () => {
  it('gives Orange the whole country, with every level adding up', () => {
    signedInAs(['VIEW_AGENT', 'VIEW_NATIONAL'])
    const s = demoMapSummary()
    expect(s.scope).toBe('national')
    expect(s.regions.map((r) => r.label)).toEqual(['West', 'North', 'South', 'East'])
    for (const k of KEYS) {
      expect(s.regions.reduce((n, r) => n + r[k], 0) + s.unplaced[k]).toBe(s.totals[k])
      expect(s.towns.reduce((n, t) => n + t[k], 0) + s.no_point[k]).toBe(s.totals[k])
      for (const r of s.regions) expect(r.aggregators.reduce((n, a) => n + a[k], 0)).toBe(r[k])
    }
    expect(s.unplaced.registered).toBeGreaterThan(0)
  })

  it('gives an aggregator only their own agents', () => {
    signedInAs(['VIEW_AGENT'])
    const s = demoMapSummary()
    expect(s.scope).toBe('aggregator')
    expect(new Set(demoMapAgents({}).map((r) => r.aggregator_id))).toEqual(new Set(['kissy']))
    expect(s.regions.filter((r) => r.registered > 0).map((r) => r.region)).toEqual(['west'])
  })

  it('never carries money, and a point only once confirmed', () => {
    signedInAs(['VIEW_AGENT', 'VIEW_NATIONAL'])
    const text = JSON.stringify([demoMapSummary(), demoMapAgents({})])
    expect(text).not.toMatch(/balance|float|cash_in|cash_out|_sle/)
    for (const r of demoMapAgents({})) if (!r.confirmed) expect(r.lat).toBeNull()
  })

  it('filters the rows and writes a CSV Excel cannot run', () => {
    signedInAs(['VIEW_AGENT', 'VIEW_NATIONAL'])
    expect(demoMapAgents({ region: 'north' }).every((r) => r.region === 'north')).toBe(true)
    expect(demoMapAgents({ region: 'none' }).every((r) => r.region === null)).toBe(true)
    const csv = demoMapCsv({ region: 'east' })
    expect(csv.split('\n')[0]).toMatch(/^Agent,Shop,Aggregator,Region/)
    expect(csv).toContain('Eastern Star')
  })
})

describe('fitting the map', () => {
  it('zooms close for one shop and out for the whole country', () => {
    const one = fitView([{ lat: 8.44, lng: -13.28 }], 800, 600)
    const country = fitView([{ lat: 9.6, lng: -11.55 }, { lat: 7.53, lng: -12.5 }, { lat: 8.64, lng: -10.97 }, { lat: 8.48, lng: -13.23 }], 800, 600)
    expect(one.zoom).toBeGreaterThan(country.zoom)
    expect(country.zoom).toBeGreaterThanOrEqual(7)
    expect(country.lat).toBeGreaterThan(7.5)
    expect(country.lat).toBeLessThan(9.6)
  })
})
