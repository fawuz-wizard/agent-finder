/**
 * The national map in the demo build: the same counts and rows the API returns
 * (GET /dealer/map/*), over Kissy's demo shops plus fictional aggregators in the other three
 * regions, so the country has something to show. Kept apart from operatorDemo.ts, which is
 * frozen for new features. Names and numbers are made up; no money field exists here.
 */
import type { MapAgentRow, MapCounts, MapFilter, MapRegion, MapSummary } from '@/types/operator'
import { readStoredSession } from '@/features/auth/session'
import { demoMapShops } from './operatorDemo'

const REGIONS: MapRegion[] = ['west', 'north', 'south', 'east']
const LABEL: Record<MapRegion, string> = { west: 'West', north: 'North', south: 'South', east: 'East' }
const TOWNS: Record<string, { region: MapRegion; lat: number; lng: number }> = {
  Freetown: { region: 'west', lat: 8.484, lng: -13.234 },
  Waterloo: { region: 'west', lat: 8.339, lng: -13.071 },
  Makeni: { region: 'north', lat: 8.881, lng: -12.044 },
  Kambia: { region: 'north', lat: 9.126, lng: -12.918 },
  'Port Loko': { region: 'north', lat: 8.767, lng: -12.788 },
  Bo: { region: 'south', lat: 7.965, lng: -11.738 },
  Bonthe: { region: 'south', lat: 7.526, lng: -12.505 },
  Kenema: { region: 'east', lat: 7.877, lng: -11.188 },
  'Kono (Koidu)': { region: 'east', lat: 8.644, lng: -10.971 },
}
const DEFINITIONS = {
  registered: 'Every agent on record, whatever their status.',
  transacting: "Active at Orange with transactions in Orange's file (April 2026).",
  app: 'Opened, closed or recorded a transaction in the app in the last 7 days.',
  located: 'The shop has a pin on the map.',
  confirmed: 'The aggregator confirmed the pin, so customers can find the shop.',
  file_month: 'April 2026',
}

interface Row extends MapAgentRow {
  town: string | null
}

/** Fictional aggregators and agents for the other regions: [aggregator id, name, town, street, transacting, app days, confirmed]. */
const OTHERS: [string, string, string | null, string, boolean | null, number, boolean][] = [
  ['agg-north', 'Northern Link', 'Makeni', 'Azzolini Highway', true, 5, true],
  ['agg-north', 'Northern Link', 'Makeni', 'Teko Road', true, 2, false],
  ['agg-north', 'Northern Link', 'Makeni', 'Station Road', false, 0, false],
  ['agg-north', 'Northern Link', 'Kambia', 'Market Street', true, 0, false],
  ['agg-north', 'Northern Link', 'Kambia', 'Rokupr Road', true, 0, false],
  ['agg-north', 'Northern Link', 'Port Loko', 'Lunsar Road', true, 1, false],
  ['agg-south', 'Bo Express', 'Bo', 'Bojon Street', true, 6, true],
  ['agg-south', 'Bo Express', 'Bo', 'Tikonko Road', true, 3, false],
  ['agg-south', 'Bo Express', 'Bo', 'Kissy Town Road', false, 0, false],
  ['agg-south', 'Bo Express', 'Bonthe', 'Wharf Road', true, 0, false],
  ['agg-east', 'Eastern Star', 'Kenema', 'Hangha Road', true, 4, true],
  ['agg-east', 'Eastern Star', 'Kenema', 'Dama Road', true, 0, false],
  ['agg-east', 'Eastern Star', 'Kono (Koidu)', 'Main Motor Road', true, 2, false],
  ['agg-east', 'Eastern Star', 'Kono (Koidu)', 'Masingbi Road', false, 0, false],
  ['agg-north', 'Northern Link', null, 'Address not given in the file', null, 0, false],
]

function rows(): Row[] {
  const national = readStoredSession()?.permissions?.includes('VIEW_NATIONAL') ?? false
  const kissy: Row[] = demoMapShops().map((s) => ({
    ref: s.ref,
    shop_name: s.shop,
    aggregator_id: 'kissy',
    aggregator: 'Kissy Distribution',
    region: 'west',
    region_label: 'West',
    city: 'Freetown',
    town: 'Freetown',
    street: s.street,
    active_at_orange: true,
    transacting: null,
    app_days: s.appDays,
    located: s.lat !== null,
    confirmed: s.confirmed,
    open_now: s.open,
    lat: s.lat,
    lng: s.lng,
    photo_url: null,
  }))
  if (!national) return kissy
  const others: Row[] = OTHERS.map(([aggId, agg, town, street, tx, days, confirmed], i) => {
    const t = town ? TOWNS[town]! : null
    // Confirmed shops sit a little off the town centre, each in its own spot.
    const lat = t && confirmed ? t.lat + 0.004 * ((i % 3) - 1) : null
    const lng = t && confirmed ? t.lng + 0.004 * ((i % 2) ? 1 : -1) : null
    return {
      ref: `Agent ${String(200 + i)}`,
      shop_name: `${town ?? 'Village'} shop ${i + 1}`,
      aggregator_id: aggId,
      aggregator: agg,
      region: t?.region ?? null,
      region_label: t ? LABEL[t.region] : 'No place on record',
      city: town,
      town,
      street,
      active_at_orange: tx !== false,
      transacting: tx,
      app_days: days,
      located: confirmed,
      confirmed,
      open_now: days > 0,
      lat,
      lng,
      photo_url: null,
    }
  })
  return [...kissy, ...others]
}

function counts(list: Row[]): MapCounts {
  return {
    registered: list.length,
    transacting: list.filter((r) => r.transacting === true).length,
    no_file_figure: list.filter((r) => r.transacting === null).length,
    app_active: list.filter((r) => r.app_days > 0).length,
    located: list.filter((r) => r.located).length,
    confirmed: list.filter((r) => r.confirmed).length,
  }
}

export function demoMapSummary(): MapSummary {
  const all = rows()
  const national = readStoredSession()?.permissions?.includes('VIEW_NATIONAL') ?? false
  const placed = all.filter((r) => r.town && TOWNS[r.town])
  const towns = [...new Set(placed.map((r) => r.town!))].map((name) => {
    const t = TOWNS[name]!
    return { city: name, region: t.region, lat: t.lat, lng: t.lng, ...counts(placed.filter((r) => r.town === name)) }
  })
  const noRegion = all.filter((r) => r.region === null)
  return {
    generated_at: new Date().toISOString(),
    scope: national ? 'national' : 'aggregator',
    scope_name: national ? 'Sierra Leone' : 'Kissy Distribution',
    definitions: DEFINITIONS,
    totals: counts(all),
    regions: REGIONS.map((region) => {
      const inRegion = all.filter((r) => r.region === region)
      const aggs = [...new Set(inRegion.map((r) => r.aggregator_id))]
      return {
        region,
        label: LABEL[region],
        ...counts(inRegion),
        aggregators: aggs
          .map((id) => ({ id, name: inRegion.find((r) => r.aggregator_id === id)!.aggregator, parent_id: null, ...counts(inRegion.filter((r) => r.aggregator_id === id)) }))
          .sort((a, b) => b.registered - a.registered || a.name.localeCompare(b.name)),
      }
    }),
    towns: towns.sort((a, b) => b.registered - a.registered),
    unplaced: { ...counts(noRegion), reasons: { no_town: noRegion.length, town_not_on_record: 0 } },
    no_point: { ...counts(all.filter((r) => !(r.town && TOWNS[r.town]))), lat: 7.9, lng: -13.6 },
  }
}

export function demoMapAgents(f: MapFilter): MapAgentRow[] {
  return rows()
    .filter((r) => !f.region || (r.region ?? 'none') === f.region)
    .filter((r) => !f.aggregator || r.aggregator_id === f.aggregator)
    .filter((r) => !f.city || (r.town ?? '').toLowerCase() === f.city.toLowerCase())
    .map((r) => {
      const { town, ...row } = r
      void town
      return row
    })
}

function cell(v: unknown): string {
  if (v === true) return 'yes'
  if (v === false) return 'no'
  if (v === null || v === undefined) return 'no file figure'
  const s = String(v)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function demoMapCsv(f: MapFilter): string {
  const head = ['Agent', 'Shop', 'Aggregator', 'Region', 'Town', 'Street', 'Active at Orange', 'Transacting (Orange file)', 'Days using the app (last 7)', 'Located', 'Confirmed on the map']
  const lines = demoMapAgents(f).map((r) =>
    [r.ref, r.shop_name, r.aggregator, r.region_label, r.city ?? '', r.street, r.active_at_orange, r.transacting, r.app_days, r.located, r.confirmed].map(cell).join(','),
  )
  return [head.join(','), ...lines].join('\n') + '\n'
}
