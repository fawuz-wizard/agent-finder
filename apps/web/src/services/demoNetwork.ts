/**
 * Seeded demo network — a stand-in for the API while AUTH_MODE=demo and the
 * backend search endpoint is not yet live.
 *
 * This file is the ONLY place that behaves like the server: it applies the network
 * capacity ranges and freshness windows to produce public outcomes. Screens never
 * see the private inputs below — they receive the same shapes the real API returns,
 * so replacing this transport changes nothing in the UI.
 */
import type {
  AgentDetail,
  AgentResult,
  FreshnessState,
  PublicOutcome,
  SearchRequest,
  SearchResponse,
  TransactionType,
  VisitReport,
} from '@/types/public'
import { TRANSACTION_LABELS } from '@/types/public'
import { config } from '@/lib/config'

/** PRIVATE to this fake server — never leaves it. */
interface DemoAgent {
  id: string
  name: string
  area: string
  street: string
  distance_m: number
  open: boolean
  hidden: boolean
  /** Declared words per side. Private. */
  cash: 'most' | 'some' | 'small' | 'none'
  float: 'most' | 'some' | 'small' | 'none'
  updated_min_ago: number
  hours_text: string
  can_call: boolean
  verified?: boolean
  lat: number
  lng: number
  /** Present for agents on the (simulated) operator feed: their book at opening. */
  feed?: { balance: number; float: number }
  /** Evidence by amount: what this agent usually handles (dealer's note or records). Beats the word. */
  usual?: { cash: number | null; float: number | null }
}

/** Network-wide ranges, identical for every agent (set once in network settings). */
const RANGE_CEILING: Record<DemoAgent['cash'], number> = {
  none: 0,
  small: 500,
  some: 10_000,
  most: Number.POSITIVE_INFINITY,
}

const FRESHNESS_WINDOWS = { fresh: 90, aging: 120, may_have_changed: 240 } as const

const AGENTS: DemoAgent[] = [
  { id: 'af-4821', name: "Fatmata's Shop", area: 'Lumley', street: 'Lumley Junction', distance_m: 300, open: true, hidden: false, cash: 'most', float: 'some', updated_min_ago: 6, hours_text: 'Open today 07:00–20:00', can_call: true, verified: true, lat: 8.4405, lng: -13.2795, feed: { balance: 12400, float: 8450 } },
  { id: 'af-7315', name: "Mohamed's Store", area: 'Lumley', street: 'Lumley Road', distance_m: 120, open: true, hidden: false, cash: 'small', float: 'most', updated_min_ago: 25, hours_text: 'Open today 08:00–19:00', can_call: false, lat: 8.4412, lng: -13.2781 },
  { id: 'af-1902', name: 'Aminata Trading', area: 'Lumley', street: 'Lumley Junction', distance_m: 210, open: true, hidden: false, cash: 'most', float: 'most', updated_min_ago: 18, hours_text: 'Open today 07:30–20:00', can_call: false, lat: 8.4399, lng: -13.2808 },
  { id: 'af-6644', name: "Kadiatu's Kiosk", area: 'Lumley', street: 'Lumley Beach Road', distance_m: 340, open: true, hidden: false, cash: 'most', float: 'most', updated_min_ago: 14, hours_text: 'Open today 08:00–21:00', can_call: false, lat: 8.4382, lng: -13.2825 },
  { id: 'af-2870', name: 'Coco and Sons', area: 'Lumley', street: 'Lumley Market Road', distance_m: 280, open: true, hidden: false, cash: 'most', float: 'most', updated_min_ago: 11, hours_text: 'Open today 08:00–20:00', can_call: false, lat: 8.4392, lng: -13.2765 },
  { id: 'af-5570', name: 'Sento Enterprise', area: 'Aberdeen', street: 'Sir Samuel Lewis Road', distance_m: 1400, open: true, hidden: false, cash: 'some', float: 'small', updated_min_ago: 48, hours_text: 'Open today 08:00–18:00', can_call: false, lat: 8.4842, lng: -13.2711, feed: { balance: 4900, float: 3100 } },
  { id: 'af-2210', name: 'Salamatu Shop', area: 'Lumley', street: 'Wilkinson Road', distance_m: 880, open: false, hidden: false, cash: 'most', float: 'most', updated_min_ago: 62, hours_text: 'Opens 07:00', can_call: false, lat: 8.4448, lng: -13.2749, feed: { balance: 7300, float: 6050 } },
  { id: 'af-3388', name: 'Ibrahim Cash Point', area: 'Wilberforce', street: 'Wilberforce Street', distance_m: 1900, open: true, hidden: true, cash: 'some', float: 'some', updated_min_ago: 20, hours_text: 'Open today 09:00–18:00', can_call: false, lat: 8.4617, lng: -13.2629, feed: { balance: 21000, float: 15600 } },
  { id: 'af-9042', name: 'Amadu Corner Shop', area: 'Lumley', street: 'Juba Road', distance_m: 1100, open: true, hidden: false, cash: 'none', float: 'most', updated_min_ago: 9, hours_text: 'Open today 07:00–19:00', can_call: false, lat: 8.4336, lng: -13.2724, feed: { balance: 900, float: 400 } },
]

function freshnessOf(min: number): FreshnessState {
  if (min < FRESHNESS_WINDOWS.fresh) return 'fresh'
  if (min < FRESHNESS_WINDOWS.aging) return 'aging'
  if (min < FRESHNESS_WINDOWS.may_have_changed) return 'may_have_changed'
  return 'expired'
}

function freshnessText(min: number, source?: string): string {
  const state = freshnessOf(min)
  const age = min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min ` : ''}ago`
  const base = `Updated ${age}${source ? ` · ${source}` : ''}`
  if (state === 'expired') return `${base} — expired`
  if (state === 'may_have_changed') return `${base} — may have changed`
  return base
}

const OUTCOME_TEXT: Record<PublicOutcome, string> = {
  likely: 'Can likely handle your request',
  unknown: 'Not enough recent activity to estimate availability',
  limited: 'Availability uncertain for this request',
  expired: 'Status expired — ask before you go',
  closed: 'Closed',
  hidden: 'Availability hidden',
  not_set: 'Status not set',
}

function sideFor(tx: TransactionType): 'cash' | 'float' {
  return tx === 'cash_out' ? 'cash' : 'float'
}

/* Visits reported through this demo, so what the next customer reads moves the way it does
 * against the live API: a confirmed visit lowers the side it drew on and raises the other; a
 * failed visit for lack of money caps that side at the floor of its amount band. */
interface DemoVisit {
  id: string
  side: 'cash' | 'float'
  amount: number
  answer: 'yes' | 'no'
  reason: string | null
}
const visits: DemoVisit[] = []
const demoRatings: { id: string; score: number; at: number }[] = []
const BAND_FLOORS: [number, number][] = [[500, 1], [2_000, 501], [5_000, 2_001], [10_000, 5_001], [50_000, 10_001], [Number.POSITIVE_INFINITY, 50_001]]
const BAND_MIDPOINTS: [number, number][] = [[500, 250], [2_000, 1_250], [5_000, 3_500], [10_000, 7_500], [50_000, 30_000], [Number.POSITIVE_INFINITY, 50_000]]
const CAPACITY_FAILURES = ['could_not_complete', 'less_than_requested']

function bandValue(table: [number, number][], amount: number): number {
  return table.find(([ceiling]) => amount <= ceiling)![1]
}

export function recordDemoVisit(body: VisitReport): void {
  if (body.rating !== null && body.rating !== undefined) {
    const recent = demoRatings.some((r) => r.id === body.agent_id && Date.now() - r.at < 24 * 60 * 60 * 1000)
    if (recent) throw new Error('You have already rated this agent recently. Please try again tomorrow.')
    demoRatings.push({ id: body.agent_id, score: body.rating, at: Date.now() })
  }
  if (body.answer !== 'yes' && body.answer !== 'no') return
  if (body.amount_sle === null) return
  const side = body.transaction === 'deposit' ? 'float' : 'cash'
  visits.push({ id: body.agent_id, side, amount: body.amount_sle, answer: body.answer, reason: body.reason_code ?? null })
}

function ratingSummary(id: string): { rating_average: number | null; rating_count: number } {
  const scores = demoRatings.filter((r) => r.id === id).map((r) => r.score)
  return scores.length >= 3
    ? { rating_average: Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10, rating_count: scores.length }
    : { rating_average: null, rating_count: 0 }
}

const FEED_SOURCE = 'Orange (demo)'

let feedOn = config.operatorFeed
/** Demo control: flip the simulated operator feed for the customer surface. */
export function setDemoOperatorFeed(on: boolean): void {
  feedOn = on
}
/** The operator's position for one agent, simulated from the clock exactly as the API's fake adapter does. */
function feedFor(a: DemoAgent): { cash: number; float: number; ageMin: number } | null {
  if (!feedOn || !a.feed) return null
  const d = new Date()
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60
  const frac = Math.max(0, Math.min(1, (hour - 7) / 13))
  const drawn = Math.floor(a.feed.balance * 0.85 * frac)
  const salt = [...a.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 17
  return { cash: Math.max(0, a.feed.balance - drawn), float: a.feed.float + Math.floor(drawn * 0.6), ageMin: 3 + salt }
}

/** Largest amount that reads as likely for one side right now; null means no upper bound. */
function ceilingFor(a: DemoAgent, side: 'cash' | 'float'): number | null {
  const feed = feedFor(a)
  if (feed) return side === 'cash' ? feed.cash : feed.float
  const word = a[side]
  const usual = a.usual?.[side] ?? null
  let base: number | null = usual !== null ? usual : word === 'most' ? null : RANGE_CEILING[word]
  let cap: number | null = null
  let netOut = 0
  for (const v of visits) {
    if (v.id !== a.id) continue
    if (v.answer === 'yes') netOut += v.side === side ? bandValue(BAND_MIDPOINTS, v.amount) : -bandValue(BAND_MIDPOINTS, v.amount)
    else if (v.side === side && v.reason && CAPACITY_FAILURES.includes(v.reason)) {
      const floor = bandValue(BAND_FLOORS, v.amount)
      cap = cap === null ? floor : Math.min(cap, floor)
    }
  }
  if (base !== null) base = Math.max(0, base - netOut)
  if (cap !== null) base = base === null ? Math.max(0, cap - 1) : Math.min(base, Math.max(0, cap - 1))
  return base
}

/** The server's job: compare the amount against what the words and the visits since allow. */
function outcomeFor(a: DemoAgent, tx: TransactionType, amount: number | null): PublicOutcome {
  if (a.hidden) return 'hidden'
  if (!a.open) return 'closed'
  const fresh = freshnessOf(a.updated_min_ago)
  if (fresh === 'expired' && !feedFor(a)) return 'expired'
  const ceiling = ceilingFor(a, sideFor(tx))
  if (ceiling === null) return 'likely'
  if (amount === null) return ceiling <= 0 ? 'limited' : 'likely'
  return amount <= ceiling ? 'likely' : 'limited'
}

/** Demo only: an agent the dealer just registered joins the customer network (mirrors the API). */
export function addDemoAgent(a: {
  id: string
  name: string
  area: string
  street: string
  lat: number
  lng: number
  hours_text: string
  can_call: boolean
  verified: boolean
  usual: { cash: number | null; float: number | null }
}): void {
  if (AGENTS.some((x) => x.id === a.id)) return
  AGENTS.push({
    id: a.id,
    name: a.name,
    area: a.area,
    street: a.street,
    distance_m: 0,
    open: true,
    hidden: false,
    cash: 'most',
    float: 'most',
    updated_min_ago: 5,
    hours_text: a.hours_text,
    can_call: a.can_call,
    verified: a.verified,
    lat: a.lat,
    lng: a.lng,
    usual: a.usual,
  })
}

export function demoAgentName(id: string): string | null {
  return AGENTS.find((x) => x.id === id)?.name ?? null
}

const TIER: Record<PublicOutcome, number> = { likely: 0, unknown: 1, limited: 2, expired: 3, not_set: 4, closed: 5, hidden: 6 }

/* ---------- the activity ranker: the same features and starting weights as the API ---------- */

const WEIGHTS = {
  bias: 0.6,
  margin: 2.0,
  recent_tx: 0.25,
  minutes_since_tx: -0.006,
  failed_today: -0.8,
  freshness_min: -0.004,
  distance_km: -0.3,
  trust_rate: 1.5,
  live: 0.5,
} as const

/** Share of this session's "likely" visits that matched, or a 0.7 prior with no record. */
function trustRate(a: DemoAgent): number {
  const mine = visits.filter((v) => v.id === a.id)
  if (mine.length < 3) return 0.7
  const failed = mine.filter((v) => v.answer === 'no' && v.reason && CAPACITY_FAILURES.includes(v.reason)).length
  return (mine.length - failed) / mine.length
}

/** Probability that a visit for this request succeeds, from what the demo knows about the agent. */
function successProbability(a: DemoAgent, tx: TransactionType, amount: number | null): number {
  const ceiling = ceilingFor(a, sideFor(tx))
  const feed = feedFor(a)
  const margin =
    amount === null ? (ceiling === null || ceiling > 0 ? 1 : -1) : ceiling === null ? 1 : Math.max(-1, Math.min(1, (ceiling - amount) / Math.max(amount, 1)))
  const fresh = feed ? feed.ageMin : a.updated_min_ago
  const failedToday = visits.filter((v) => v.id === a.id && v.answer === 'no' && v.reason && CAPACITY_FAILURES.includes(v.reason)).length
  const z =
    WEIGHTS.bias +
    WEIGHTS.margin * margin +
    WEIGHTS.recent_tx * (feed ? 2 : 0) +
    WEIGHTS.minutes_since_tx * Math.min(fresh, 480) +
    WEIGHTS.failed_today * Math.min(failedToday, 5) +
    WEIGHTS.freshness_min * Math.min(fresh, 480) +
    WEIGHTS.distance_km * Math.min(a.distance_m / 1000, 20) +
    WEIGHTS.trust_rate * trustRate(a) +
    WEIGHTS.live * (feed ? 1 : 0)
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))))
}

function toResult(a: DemoAgent, tx: TransactionType, amount: number | null): AgentResult {
  const outcome = outcomeFor(a, tx, amount)
  const feed = feedFor(a)
  const freshnessAge = feed?.ageMin ?? a.updated_min_ago
  return {
    id: a.id,
    name: a.name,
    area: a.street,
    lat: a.lat,
    lng: a.lng,
    distance_m: a.distance_m,
    outcome,
    outcome_text: OUTCOME_TEXT[outcome],
    freshness: freshnessOf(freshnessAge),
    freshness_text: freshnessText(freshnessAge, feed ? FEED_SOURCE : undefined),
    directions_url: `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`,
    can_call: a.can_call,
    ...ratingSummary(a.id),
  }
}

function amountLabel(amount: number | null): string | null {
  return amount === null ? null : `SLE ${amount.toLocaleString('en-US')}`
}

/** Coarse area centres, the same table the API uses when the customer declined location. */
const AREA_POINTS: Record<string, { lat: number; lng: number }> = {
  Lumley: { lat: 8.4378, lng: -13.2795 },
  Aberdeen: { lat: 8.4842, lng: -13.2711 },
  Wilberforce: { lat: 8.4617, lng: -13.2629 },
  'Congo Cross': { lat: 8.479, lng: -13.256 },
  Freetown: { lat: 8.4657, lng: -13.2317 },
}

function originFor(area: string): { lat: number; lng: number } {
  return AREA_POINTS[area] ?? AREA_POINTS.Freetown!
}

export function demoSearch(req: SearchRequest): SearchResponse {
  const amount = req.amount_sle
  const origin = originFor(req.area)
  const radius = req.radius_m ?? 500
  const scoped = AGENTS
    .map((a) => ({ ...a, distance_m: distanceBetween(origin, a) }))
    .filter((a) => !a.hidden && a.open && a.distance_m <= 20_000)
  // The phrase gates; within it, the order is the probability a visit succeeds, computed
  // from activity, not from words. Never in the payload.
  const prob = new Map(scoped.map((a) => [a.id, successProbability(a, req.transaction, amount)] as const))
  const ranked = scoped
    .map((a) => toResult(a, req.transaction, amount))
    .sort((x, y) =>
      TIER[x.outcome] - TIER[y.outcome] ||
      (prob.get(y.id) ?? 0) - (prob.get(x.id) ?? 0) ||
      x.distance_m - y.distance_m ||
      x.id.localeCompare(y.id),
    )

  // Nearest includes every visible/open nearby agent with its honest public capacity
  // outcome. Recommended is the subset that can likely handle this request.
  const coreAll = ranked.filter((r) => r.distance_m <= radius)
  const coreNearest = coreAll
    .sort((a, b) => a.distance_m - b.distance_m || a.id.localeCompare(b.id))
    .slice(0, 10)
  const likely = coreAll
    .filter((r) => r.outcome === 'likely')
    .sort((a, b) => (prob.get(b.id) ?? 0) - (prob.get(a.id) ?? 0) || a.distance_m - b.distance_m || a.id.localeCompare(b.id))
  const recommended = likely.slice(0, 2).map((r, i) => ({
    ...r,
    why:
      i === 0
        ? `Recent activity suggests this agent may handle ${amountLabel(amount) ?? 'your request'}.`
        : 'Another strong activity match for your request.',
  }))
  const recommendedIds = new Set(recommended.map((r) => r.id))
  const rest = likely.filter((r) => !recommendedIds.has(r.id))
  const furtherAway = likely.length > 0
    ? []
    : ranked
        .filter((r) => r.distance_m > radius)
        .sort((a, b) =>
          TIER[a.outcome] - TIER[b.outcome] ||
          (prob.get(b.id) ?? 0) - (prob.get(a.id) ?? 0) ||
          a.distance_m - b.distance_m ||
          a.id.localeCompare(b.id),
        )
        .slice(0, 2)

  const nothingFresh = ranked.length > 0 && ranked.every((r) => r.freshness === 'expired')

  return {
    query: {
      transaction: req.transaction,
      transaction_label: TRANSACTION_LABELS[req.transaction],
      amount_sle: amount,
      amount_label: amountLabel(amount),
      area: req.area === 'all' ? 'Freetown' : req.area,
      radius_m: radius,
      origin: originFor(req.area === 'all' ? 'Freetown' : req.area),
    },
    recommended,
    closer_not_serving: coreNearest.filter((r) => r.outcome !== 'likely'),
    results: rest.slice(0, 10 - recommended.length),
    further_away: furtherAway,
    total: coreAll.length + furtherAway.length,
    generated_at: new Date().toISOString(),
    banner: nothingFresh ? 'All nearby statuses are older than 4 hours — ask before you go.' : null,
  }
}

function distanceBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radius = 6_371_000
  const rad = (n: number) => (n * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const v = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * radius * Math.asin(Math.sqrt(v)))
}

export function demoAgent(id: string, tx: TransactionType | null, amount: number | null, area = 'Lumley'): AgentDetail | null {
  const a = AGENTS.find((x) => x.id === id)
  if (!a) return null
  const transaction = tx ?? 'cash_out'
  const origin = originFor(area)
  const base = toResult({ ...a, distance_m: distanceBetween(origin, a) }, transaction, amount)
  return {
    ...base,
    request_label: `For ${TRANSACTION_LABELS[transaction]}${amount ? ` · ${amountLabel(amount)}` : ''}`,
    hours_text: a.hours_text,
    open_now: a.open,
    verified_label: a.verified ? 'Registered agent' : null,
    call_url: a.can_call ? 'tel:+23200000000' : null,
    origin,
  }
}

export { AREAS as DEMO_AREAS, OUTCOME_REASONS } from '@/lib/reference'
