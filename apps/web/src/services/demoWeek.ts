/**
 * The demo's last seven days, shared by the customer and the agent surfaces and keyed by
 * shop name: the transactions each agent recorded and the visits customers reported. Seeded
 * so every rule case shows on first open; what the agent records and the customer reports in
 * this session is added, so both sides move together, as they do against the live API.
 */
import { type Band, type Side, type Week, WINDOW_DAYS, emptyWeek } from './weekRule'

interface Tx {
  day: number
  side: Side
  band: Band
}
interface Report {
  day: number
  side: Side
  answer: 'yes' | 'no'
  capacity: boolean
}

/** Days ago, 1 to 6: today is left empty so recording one today visibly adds a day. */
function days(...ago: number[]) {
  return ago
}
function seed(d: number[], cash: Band[], float: Band[]): Tx[] {
  return d.flatMap((day) => [...cash.map((band) => ({ day, side: 'cash' as const, band })), ...float.map((band) => ({ day, side: 'float' as const, band }))])
}
function said(side: Side, yes: number, no = 0): Report[] {
  return [...Array.from({ length: yes }, (_, i) => ({ day: 1 + (i % 6), side, answer: 'yes' as const, capacity: false })), ...Array.from({ length: no }, (_, i) => ({ day: 2 + (i % 5), side, answer: 'no' as const, capacity: true }))]
}

const txs: Record<string, Tx[]> = {
  "Fatmata's Shop": seed(days(1, 2, 3, 4, 5, 6), ['≤5k'], ['≤2k']),
  "Mohamed's Store": seed(days(1, 3, 5), [], ['≤10k']),
  'Aminata Trading': seed(days(1, 2, 3, 4, 5, 6), ['≤2k'], ['≤2k']),
  "Kadiatu's Kiosk": seed(days(2, 4), ['≤500'], []),
  'Coco and Sons': [],
  'Sento Enterprise': seed(days(1, 2, 4, 5, 6), ['≤10k'], ['≤500']),
  'Salamatu Shop': seed(days(1, 2, 3, 5), ['≤5k'], ['≤5k']),
  'Ibrahim Cash Point': seed(days(2, 3, 6), ['≤2k'], ['≤2k']),
  'Amadu Corner Shop': seed(days(3), [], ['≤500']),
}
const reports: Record<string, Report[]> = {
  "Fatmata's Shop": said('cash', 3),
  'Aminata Trading': said('cash', 2),
  'Sento Enterprise': said('cash', 4, 1),
}
/** What this session added, with the time it happened. */
const added: { shop: string; at: number; tx?: { side: Side; band: Band }; report?: Omit<Report, 'day'> }[] = []

function dayKey(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** The agent recorded a transaction in this session. */
export function addWeekTransaction(shop: string, side: Side, band: Band): void {
  added.push({ shop, at: Date.now(), tx: { side, band } })
}

/** A customer reported a visit in this session: served, or could not serve for lack of money. */
export function addWeekReport(shop: string, side: Side, answer: 'yes' | 'no', capacity: boolean): void {
  added.push({ shop, at: Date.now(), report: { side, answer, capacity } })
}

export function weekFor(shop: string): Week {
  const w = emptyWeek()
  const active = new Set<string>()
  const now = Date.now()
  for (const t of txs[shop] ?? []) {
    if (t.day >= WINDOW_DAYS) continue
    active.add(dayKey(now - t.day * 86_400_000))
    w.bands[t.side].add(t.band)
  }
  for (const r of reports[shop] ?? []) {
    if (r.answer === 'yes') w.served[r.side] += 1
    else if (r.capacity) w.failed[r.side] += 1
  }
  for (const e of added) {
    if (e.shop !== shop) continue
    if (e.tx) {
      active.add(dayKey(e.at))
      w.bands[e.tx.side].add(e.tx.band)
    }
    if (e.report) {
      if (e.report.answer === 'yes') w.served[e.report.side] += 1
      else if (e.report.capacity) w.failed[e.report.side] += 1
    }
  }
  w.activeDays = active.size
  return w
}
