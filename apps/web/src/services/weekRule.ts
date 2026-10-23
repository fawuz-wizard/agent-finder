/**
 * The 7-day served percentage, the same rule as the API's services/week_rule.py, for the
 * demo build. Three checks in order: active days (40 x days / 7, volume never counts), the
 * exact transaction by size (35; only smaller sizes 15 and capped at 50; not done, capped at
 * 35), customer reports from three on (20 x (served - failed) / reports). Nearest five, never
 * under 5, never over 95. Customers read the figure; agents and aggregators read the note.
 */
import type { SeenAs, SeenAsSide, SeenAsWhy } from '@/types/operator'

export const WINDOW_DAYS = 7
export const BAND_ORDER = ['≤500', '≤2k', '≤5k', '≤10k', '≤50k', '>50k'] as const
export type Band = (typeof BAND_ORDER)[number]
export type Side = 'cash' | 'float'
export type Low = 'low' | 'none' | null
/** At or above this a percentage reads "likely" and can be recommended. */
export const LIKELY_FROM = 50

export interface Week {
  activeDays: number
  bands: Record<Side, Set<Band>>
  served: Record<Side, number>
  failed: Record<Side, number>
}

export interface WeekScore {
  pct: number
  outcome: 'likely' | 'limited' | 'unknown'
  note: string | null
  active: boolean
}

export function emptyWeek(): Week {
  return { activeDays: 0, bands: { cash: new Set(), float: new Set() }, served: { cash: 0, float: 0 }, failed: { cash: 0, float: 0 } }
}

export function bandOf(amount: number): Band {
  return amount <= 500 ? '≤500' : amount <= 2_000 ? '≤2k' : amount <= 5_000 ? '≤5k' : amount <= 10_000 ? '≤10k' : amount <= 50_000 ? '≤50k' : '>50k'
}

export function sideOf(tx: 'cash_out' | 'deposit'): Side {
  return tx === 'cash_out' ? 'cash' : 'float'
}

/** The percentage a customer reads for one agent and one request. */
export function score(week: Week, tx: 'cash_out' | 'deposit', amount: number | null, low: Low = null): WeekScore {
  const side = sideOf(tx)
  const other: Side = side === 'cash' ? 'float' : 'cash'
  const label = side === 'cash' ? 'cash out' : 'cash in'
  const otherLabel = side === 'cash' ? 'cash in' : 'cash out'
  if (week.activeDays === 0) return { pct: 5, outcome: 'unknown', note: 'No activity recorded this week', active: false }

  let points = (40 * week.activeDays) / WINDOW_DAYS
  let cap = 95
  let note: string | null = null
  const seen = week.bands[side]
  if (seen.size === 0) {
    cap = 35
    note = week.bands[other].size > 0 ? `Does ${otherLabel}; no ${label} this week` : `No ${label} recorded this week`
  } else {
    const asked = amount === null ? null : BAND_ORDER.indexOf(bandOf(amount))
    const largest = Math.max(...[...seen].map((b) => BAND_ORDER.indexOf(b)))
    if (asked === null || largest >= asked) points += 35
    else {
      points += 15
      cap = 50
      note = 'Not seen at this size this week'
    }
  }
  const reports = week.served[side] + week.failed[side]
  if (reports >= 3) points += (20 * (week.served[side] - week.failed[side])) / reports
  if (low === 'low') cap = Math.min(cap, 35)
  else if (low === 'none') cap = Math.min(cap, 5)
  const pct = Math.max(5, Math.min(95, cap, Math.round(points / 5) * 5))
  return { pct, outcome: pct >= LIKELY_FROM ? 'likely' : 'limited', note, active: true }
}

const SIDES = [
  ['cash_out', 'cash', 'Cash out'],
  ['deposit', 'float', 'Cash in'],
] as const

function statusOf(s: WeekScore, seen: boolean, low: Low): Pick<SeenAsSide, 'outcome' | 'phrase'> {
  if (low === 'none') return { outcome: 'limited', phrase: 'None today' }
  if (low === 'low') return { outcome: 'limited', phrase: 'Low today' }
  if (!s.active) return { outcome: 'unknown', phrase: 'No activity this week' }
  if (!seen) return { outcome: 'limited', phrase: 'Not done this week' }
  return s.outcome === 'likely' ? { outcome: 'likely', phrase: 'Likely to be served' } : { outcome: 'limited', phrase: 'Less likely yet' }
}

/** How customers see this agent this week, in words; never the percentage or the points. */
export function weekNote(week: Week, low: [Low, Low], viewer: 'agent' | 'dealer' = 'agent'): SeenAs {
  const you = viewer === 'agent'
  const done: string[] = []
  const sides: SeenAsSide[] = SIDES.map(([tx, side, label], i) => {
    const s = score(week, tx, null, low[i]!)
    const seen = week.bands[side].size > 0
    if (seen) done.push(label.toLowerCase())
    return { label, ...statusOf(s, seen, low[i]!) }
  })

  const why: SeenAsWhy[] = []
  const d = week.activeDays
  if (d === 0) {
    why.push({
      tone: 'warn',
      title: 'No transaction recorded in the last 7 days',
      detail: you ? 'Customers are not sent to you until you record one. Record every day you work.' : 'Customers are not sent to this agent until they record one.',
    })
  } else {
    const days = d === WINDOW_DAYS ? 'all 7' : `${d} of the last 7`
    why.push({
      tone: d >= 5 ? 'good' : 'warn',
      title: `${you ? 'You worked' : 'Worked'} ${days} days`,
      detail: you ? 'Record every day you work. Days count, not how many transactions.' : 'Days count, not how many transactions.',
    })
    if (done.length === 2) {
      why.push({ tone: 'good', title: 'Cash out and cash in done this week', detail: you ? 'Customers see you for both.' : 'Customers see this agent for both.' })
    } else if (done.length === 1) {
      const missing = done[0] === 'cash out' ? 'cash in' : 'cash out'
      why.push({
        tone: 'good',
        title: `${done[0]![0]!.toUpperCase()}${done[0]!.slice(1)} done this week; ${missing} not`,
        detail: you ? `Record ${missing}s when you do them, and customers will see you for both.` : `${missing[0]!.toUpperCase()}${missing.slice(1)} shows once the agent records one.`,
      })
    }
  }

  const served = week.served.cash + week.served.float
  const failed = week.failed.cash + week.failed.float
  const n = served + failed
  if (n >= 3) {
    why.push({ tone: served >= failed ? 'good' : 'warn', title: `Customers: ${served} served, ${failed === 0 ? 'none' : failed} failed`, detail: 'From visits customers reported in the last 7 days.' })
  } else {
    why.push({
      tone: 'neutral',
      title: n === 0 ? 'No customer reports this week' : `Customers: ${n} report${n > 1 ? 's' : ''} this week`,
      detail: 'Reports count from 3 on. Served and could not serve weigh the same.',
    })
  }

  SIDES.forEach(([, , label], i) => {
    const l = low[i]
    if (l === 'low' || l === 'none') {
      const word = l === 'low' ? 'low on' : 'out of'
      const what = label === 'Cash out' ? 'cash' : 'float'
      why.push({ tone: 'warn', title: `${you ? 'You said you are' : 'Said'} ${word} ${what} today`, detail: `${label} reads less likely for the rest of the day.` })
    }
  })
  return { sides, why }
}
