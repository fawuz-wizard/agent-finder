/**
 * Seeded operator network — the stand-in server for the agent and dealer surfaces while
 * VITE_API_MODE=mock. Like demoNetwork.ts for the customer side, this is the ONLY module
 * that behaves like a server: it holds the mutable state, computes freshness, runs the
 * float state machine and phrases everything the screens render.
 *
 * The values marked as operator-owned (balance, float position, transaction counts) are
 * labelled demo data from the host system. Agent Finder does not own them and, when the
 * real adapter is absent, shows nothing rather than inventing a number.
 */
import type {
  ActivityEvent,
  AgentHome,
  AgentInsights,
  AgentProfile,
  CustomersSee,
  ActionLogged,
  AuditEntry,
  DealerAction,
  DealerAgentDetail,
  InsightPoint,
  InsightRange,
  CapacityWord,
  DealerOverview,
  Declaration,
  FloatRequest,
  FloatRequestState,
  Presence,
  Role,
  Session,
  Signal,
} from '@/types/operator'
import { CAPACITY_RANGES, PERMISSIONS, PRESENCE_LABELS } from '@/types/operator'

const FRESHNESS = { fresh: 90, aging: 120, may_have_changed: 240 } as const
/** The agent is asked to confirm once the declaration stops being fresh. */
const CONFIRM_AFTER_MIN = FRESHNESS.fresh

interface AgentState {
  ref: string
  name: string
  shop: string
  area: string
  presence: Presence
  cash_out: CapacityWord
  deposit: CapacityWord
  updated_at: number
  night_mode: boolean
  phone_visible: boolean
  found_you: number
  transactions: number
  successful: number
  problems: number
}

function minutesAgo(min: number): number {
  return Date.now() - min * 60_000
}

const agents: AgentState[] = [
  { ref: 'Agent 024', name: 'Fatmata Kamara', shop: "Fatmata's Shop", area: 'Lumley Junction', presence: 'open', cash_out: 'most', deposit: 'some', updated_at: minutesAgo(112), night_mode: true, phone_visible: true, found_you: 14, transactions: 31, successful: 28, problems: 2 },
  { ref: 'Agent 031', name: 'Sento Bangura', shop: 'Sento Enterprise', area: 'Aberdeen', presence: 'open', cash_out: 'some', deposit: 'small', updated_at: minutesAgo(48), night_mode: false, phone_visible: false, found_you: 9, transactions: 22, successful: 21, problems: 0 },
  { ref: 'Agent 009', name: 'Ibrahim Sesay', shop: 'Ibrahim Cash Point', area: 'Wilberforce', presence: 'hidden', cash_out: 'some', deposit: 'some', updated_at: minutesAgo(20), night_mode: false, phone_visible: false, found_you: 4, transactions: 12, successful: 12, problems: 1 },
  { ref: 'Agent 017', name: 'Salamatu Turay', shop: 'Salamatu Shop', area: 'Wilkinson Road', presence: 'closed', cash_out: 'most', deposit: 'most', updated_at: minutesAgo(62), night_mode: true, phone_visible: false, found_you: 6, transactions: 18, successful: 17, problems: 0 },
  { ref: 'Agent 038', name: 'Amadu Conteh', shop: 'Amadu Corner Shop', area: 'Juba Road', presence: 'open', cash_out: 'none', deposit: 'most', updated_at: minutesAgo(4_300), night_mode: false, phone_visible: false, found_you: 0, transactions: 3, successful: 3, problems: 0 },
]

/** Operator-owned values. Present only because the demo adapter is switched on. */
const operatorValues: Record<string, { balance: number; float: number }> = {
  'Agent 024': { balance: 12_400, float: 8_450 },
  'Agent 031': { balance: 4_900, float: 3_100 },
  'Agent 009': { balance: 21_000, float: 15_600 },
  'Agent 017': { balance: 7_300, float: 6_050 },
  'Agent 038': { balance: 900, float: 400 },
}

let floatRequests: FloatRequest[] = [
  { id: 'fr-1', agent_ref: 'Agent 024', agent_name: "Fatmata's Shop", amount_sle: 5_000, reason: 'Customer demand is high this morning.', state: 'pending', requested_at: new Date(minutesAgo(35)).toISOString(), waiting_text: '', decided_at: null, decided_by: null, decision_reason: null, ageing: false },
  { id: 'fr-2', agent_ref: 'Agent 031', agent_name: 'Sento Enterprise', amount_sle: 10_000, reason: 'Ran low after market day.', state: 'pending', requested_at: new Date(minutesAgo(70)).toISOString(), waiting_text: '', decided_at: null, decided_by: null, decision_reason: null, ageing: false },
  { id: 'fr-3', agent_ref: 'Agent 009', agent_name: 'Ibrahim Cash Point', amount_sle: 2_500, reason: 'Deposit float finished.', state: 'pending', requested_at: new Date(minutesAgo(160)).toISOString(), waiting_text: '', decided_at: null, decided_by: null, decision_reason: null, ageing: false },
  { id: 'fr-0', agent_ref: 'Agent 024', agent_name: "Fatmata's Shop", amount_sle: 10_000, reason: 'Weekend demand.', state: 'completed', requested_at: new Date(minutesAgo(60 * 24 * 5)).toISOString(), waiting_text: '', decided_at: new Date(minutesAgo(60 * 24 * 5 - 40)).toISOString(), decided_by: 'Kissy Distribution', decision_reason: null, ageing: false },
  { id: 'fr-x', agent_ref: 'Agent 024', agent_name: "Fatmata's Shop", amount_sle: 20_000, reason: 'Large customer expected.', state: 'declined', requested_at: new Date(minutesAgo(60 * 24 * 11)).toISOString(), waiting_text: '', decided_at: new Date(minutesAgo(60 * 24 * 11 - 30)).toISOString(), decided_by: 'Kissy Distribution', decision_reason: 'Too close to your last top-up — call me.', ageing: false },
]

const activity: ActivityEvent[] = []

function find(ref: string): AgentState {
  const a = agents.find((x) => x.ref === ref)
  if (!a) throw new Error(`unknown agent ${ref}`)
  return a
}

function ageMin(a: AgentState): number {
  return Math.max(0, Math.round((Date.now() - a.updated_at) / 60_000))
}

function ageText(min: number): string {
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ${min % 60 ? `${min % 60} min ` : ''}ago`
  return `${Math.floor(h / 24)} days ago`
}

function freshnessOf(min: number): Declaration['freshness'] {
  if (min < FRESHNESS.fresh) return 'fresh'
  if (min < FRESHNESS.aging) return 'aging'
  if (min < FRESHNESS.may_have_changed) return 'may_have_changed'
  return 'expired'
}

function declarationOf(a: AgentState): Declaration {
  const min = ageMin(a)
  const freshness = freshnessOf(min)
  const text =
    freshness === 'expired'
      ? `You updated this ${ageText(min)} — customers no longer see you`
      : freshness === 'may_have_changed'
        ? `You updated this ${ageText(min)} — customers are told it may have changed`
        : `You updated this ${ageText(min)}`
  return {
    presence: a.presence,
    cash_out: a.cash_out,
    deposit: a.deposit,
    updated_at: new Date(a.updated_at).toISOString(),
    age_min: min,
    freshness,
    freshness_text: text,
    confirm_due: min >= CONFIRM_AFTER_MIN,
    night_mode: a.night_mode,
  }
}

/** The six public phrases, exactly as the customer surface renders them. */
const PUBLIC_TEXT = {
  likely: 'Can likely handle your request',
  limited: 'Limited — may not cover this amount',
  expired: 'Status expired — ask before you go',
  closed: 'Closed',
  hidden: 'Availability hidden',
  not_set: 'Status not set',
} as const

function isOpenNow(): boolean {
  const h = new Date().getUTCHours()
  return h >= 7 && h < 20
}

/** What a customer reads about this agent right now — the same rules the search applies. */
function customersSee(a: AgentState): CustomersSee {
  const state: CustomersSee['state'] =
    a.presence === 'hidden'
      ? 'hidden'
      : a.presence === 'closed' || (a.night_mode && !isOpenNow())
        ? 'closed'
        : freshnessOf(ageMin(a)) === 'expired'
          ? 'expired'
          : 'open'
  if (state !== 'open') {
    const why = {
      hidden: 'You are hidden, so customers are not shown your shop at all.',
      closed: 'You are closed right now, so customers are told to try later.',
      expired: 'Your status is older than 4 hours, so customers are told not to rely on it.',
    }[state]
    return { state, headline: PUBLIC_TEXT[state], explanation: why, sides: [] }
  }
  const side = (label: string, word: CapacityWord) => {
    const range = CAPACITY_RANGES.find((c) => c.word === word)!
    const capped = word === 'some' || word === 'small'
    return {
      label,
      phrase: word === 'none' ? PUBLIC_TEXT.limited : PUBLIC_TEXT.likely,
      range_text: capped ? `up to SLE ${range.ceiling_sle!.toLocaleString('en-US')}` : 'any amount',
      above_text: capped ? PUBLIC_TEXT.limited : null,
    }
  }
  return {
    state: 'open',
    headline: 'Customers can find you',
    explanation: 'Phrased from your words and the network ranges. Customers never see the words themselves.',
    sides: [side('Cash out', a.cash_out), side('Deposit', a.deposit)],
  }
}

function operatorValue(ref: string, key: 'balance' | 'float') {
  const v = operatorValues[ref]
  if (!v) return null
  return { amount_sle: v[key], source: 'Orange', read_at: new Date(minutesAgo(5)).toISOString() }
}

function waitingText(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

function decorate(r: FloatRequest): FloatRequest {
  const min = Math.round((Date.now() - new Date(r.requested_at).getTime()) / 60_000)
  return { ...r, waiting_text: waitingText(r.requested_at), ageing: r.state === 'pending' && min >= 120 }
}

function record(text: string, source: ActivityEvent['source'], tone: ActivityEvent['tone'] = 'neutral') {
  activity.unshift({
    id: `ev-${Date.now()}-${activity.length}`,
    at: new Date().toISOString(),
    time_text: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    text,
    source,
    tone,
  })
}

/* ---------- auth ---------- */

const DEMO_PIN = '1234'

export function demoSignIn(ref: string, pin: string, role: Role): Session {
  if (pin !== DEMO_PIN) throw new Error('That PIN is not correct.')
  if (role === 'dealer') {
    return {
      token: 'demo-dealer-token',
      role: 'dealer',
      name: 'Kissy Distribution',
      ref: 'Kissy Distribution',
      permissions: [
        PERMISSIONS.viewAgent,
        PERMISSIONS.viewFinancial,
        PERMISSIONS.manageFloat,
        PERMISSIONS.viewHistory,
        PERMISSIONS.contact,
        PERMISSIONS.escalate,
      ],
    }
  }
  const a = agents.find((x) => x.ref.toLowerCase() === ref.trim().toLowerCase()) ?? agents[0]!
  return { token: 'demo-agent-token', role: 'agent', name: a.shop, ref: a.ref, permissions: [] }
}

/* ---------- agent ---------- */

export function demoAgentHome(ref: string): AgentHome {
  const a = find(ref)
  const pending = floatRequests.find((r) => r.agent_ref === ref && r.state === 'pending')
  const attention: string[] = []
  if (a.problems > 0) {
    attention.push(
      `${a.problems} customer${a.problems > 1 ? 's' : ''} said you could not complete their transaction today.`,
    )
  }
  if (ageMin(a) >= FRESHNESS.may_have_changed) {
    attention.push('Your status has expired, so customers are not being sent to you.')
  }
  return {
    name: a.shop,
    ref: a.ref,
    area: a.area,
    declaration: declarationOf(a),
    customers_see: customersSee(a),
    balance: operatorValue(ref, 'balance'),
    float_position: operatorValue(ref, 'float'),
    pending_float: pending ? decorate(pending) : null,
    today: {
      found_you: a.found_you,
      transactions: a.transactions,
      successful: a.successful,
      reported_problems: a.problems,
    },
    attention,
  }
}

export function demoConfirmDeclaration(ref: string): Declaration {
  const a = find(ref)
  a.updated_at = Date.now()
  record('You confirmed your status was still correct', 'agent_finder', 'good')
  return declarationOf(a)
}

export function demoDeclare(
  ref: string,
  next: { presence: Presence; cash_out: CapacityWord; deposit: CapacityWord; night_mode: boolean },
): Declaration {
  const a = find(ref)
  const changedPresence = a.presence !== next.presence
  a.presence = next.presence
  a.cash_out = next.cash_out
  a.deposit = next.deposit
  a.night_mode = next.night_mode
  a.updated_at = Date.now()
  const words = `${CAPACITY_RANGES.find((c) => c.word === next.cash_out)?.label} · ${CAPACITY_RANGES.find((c) => c.word === next.deposit)?.label}`
  record(
    `You declared ${PRESENCE_LABELS[next.presence].split(' ·')[0]} · ${words}`,
    'agent_finder',
    changedPresence && next.presence === 'hidden' ? 'warning' : 'neutral',
  )
  return declarationOf(a)
}

export function demoAgentActivity(ref: string): ActivityEvent[] {
  const a = find(ref)
  const seeded: ActivityEvent[] = [
    { id: 's1', at: '', time_text: '11:45', text: 'Customer reported: could not complete — cash out SLE 6,000', source: 'agent_finder', tone: 'danger' },
    { id: 's2', at: '', time_text: '11:20', text: 'You went hidden — back after 25 minutes', source: 'agent_finder', tone: 'warning' },
    { id: 's3', at: '', time_text: '10:58', text: 'Cash out SLE 2,000 — successful', source: 'operator', tone: 'neutral' },
    { id: 's4', at: '', time_text: '10:31', text: 'Deposit SLE 500 — successful', source: 'operator', tone: 'neutral' },
    { id: 's5', at: '', time_text: '09:12', text: 'You requested float SLE 5,000', source: 'agent_finder', tone: 'neutral' },
    { id: 's6', at: '', time_text: '07:40', text: `You declared Open · Most · Some`, source: 'agent_finder', tone: 'neutral' },
  ]
  return a.ref === 'Agent 024' ? [...activity, ...seeded] : [...activity]
}

export function demoAgentProfile(ref: string): AgentProfile {
  const a = find(ref)
  return {
    name: a.name,
    ref: a.ref,
    shop_name: a.shop,
    area: a.area,
    hours_text: '07:00 – 20:00',
    dealer_name: 'Kissy Distribution',
    phone_visible: a.phone_visible,
    verified: a.ref === 'Agent 024',
    devices: [
      { id: 'd1', label: 'This phone', last_seen_text: 'Active now', current: true },
      { id: 'd2', label: 'Old phone · Tecno', last_seen_text: 'Last used 2 Sep', current: false },
    ],
  }
}

export function demoSetPhoneVisible(ref: string, visible: boolean): AgentProfile {
  find(ref).phone_visible = visible
  record(visible ? 'You allowed customers to call you' : 'You stopped showing your number to customers', 'agent_finder')
  return demoAgentProfile(ref)
}

/* ---------- float ---------- */

export function demoFloatRequests(ref: string | null): FloatRequest[] {
  return floatRequests
    .filter((r) => (ref ? r.agent_ref === ref : true))
    .map(decorate)
    .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime())
}

export function demoRequestFloat(ref: string, amount_sle: number, reason: string): FloatRequest {
  const a = find(ref)
  if (floatRequests.some((r) => r.agent_ref === ref && r.state === 'pending')) {
    throw new Error('You already have a request waiting. Cancel it first if the amount has changed.')
  }
  const req: FloatRequest = {
    id: `fr-${Date.now()}`,
    agent_ref: ref,
    agent_name: a.shop,
    amount_sle,
    reason,
    state: 'pending',
    requested_at: new Date().toISOString(),
    waiting_text: '0 min',
    decided_at: null,
    decided_by: null,
    decision_reason: null,
    ageing: false,
  }
  floatRequests = [req, ...floatRequests]
  record(`You requested float SLE ${amount_sle.toLocaleString('en-US')}`, 'agent_finder')
  return decorate(req)
}

/** The state machine. Every transition is explicit; nothing expires silently. */
const ALLOWED: Record<FloatRequestState, FloatRequestState[]> = {
  pending: ['approved', 'declined', 'cancelled'],
  approved: ['completed'],
  completed: [],
  declined: [],
  cancelled: [],
}

export function demoMoveFloat(
  id: string,
  to: FloatRequestState,
  by: string,
  reason: string | null,
): FloatRequest {
  const r = floatRequests.find((x) => x.id === id)
  if (!r) throw new Error('That request no longer exists.')
  if (!ALLOWED[r.state].includes(to)) throw new Error(`A ${r.state} request cannot become ${to}.`)
  if (to === 'declined' && !reason?.trim()) throw new Error('A decline needs a reason the agent can read.')
  r.state = to
  r.decided_at = new Date().toISOString()
  r.decided_by = by
  r.decision_reason = reason
  record(
    to === 'approved'
      ? `Your float request for SLE ${r.amount_sle.toLocaleString('en-US')} was approved`
      : to === 'declined'
        ? `Your float request was declined: ${reason}`
        : to === 'cancelled'
          ? 'You cancelled your float request'
          : 'Your float top-up was completed',
    'agent_finder',
    to === 'declined' ? 'warning' : 'good',
  )
  return decorate(r)
}

/* ---------- dealer ---------- */

export function demoDealerOverview(): DealerOverview {
  const counts = { active: 0, limited: 0, hidden: 0, closed: 0 }
  for (const a of agents) {
    const stale = freshnessOf(ageMin(a)) === 'expired'
    if (a.presence === 'hidden') counts.hidden += 1
    else if (a.presence === 'closed' || stale) counts.closed += 1
    else if (a.cash_out === 'none' || a.cash_out === 'small') counts.limited += 1
    else counts.active += 1
  }
  // Seeded network size for the demo; the five live rows above are the ones you can act on.
  const padded = { ...counts, active: counts.active + 29, limited: counts.limited + 4, hidden: counts.hidden + 2, closed: counts.closed + 1 }
  return {
    dealer_name: 'Kissy Distribution',
    agent_count: 42,
    counts: padded,
    float_requests: demoFloatRequests(null).filter((r) => r.state === 'pending'),
    signals: demoSignals(),
  }
}

export function demoAgentRows() {
  return agents.map((a) => {
    const d = declarationOf(a)
    const words = `${CAPACITY_RANGES.find((c) => c.word === a.cash_out)?.label} / ${CAPACITY_RANGES.find((c) => c.word === a.deposit)?.label}`
    return {
      ref: a.ref,
      name: a.shop,
      area: a.area,
      presence: a.presence,
      presence_text: PRESENCE_LABELS[a.presence],
      declaration_text: words,
      freshness_text: ageText(d.age_min),
      attention: a.problems > 1 || d.freshness === 'expired' || a.presence === 'hidden',
    }
  })
}

export function demoSignals(): Signal[] {
  const out: Signal[] = []
  const fatmata = find('Agent 024')
  if (fatmata.problems > 1) {
    out.push({
      id: 'sig-1',
      agent_ref: fatmata.ref,
      agent_name: fatmata.shop,
      severity: 'high',
      title: 'Says available, customers say otherwise',
      sentence: `${fatmata.problems} customers reported "could not complete" today. All asked for cash out above SLE 5,000, while the declaration stayed ${CAPACITY_RANGES.find((c) => c.word === fatmata.cash_out)?.label}.`,
      evidence: [
        { at_text: '11:45', text: 'cash out SLE 6,000', tag: 'could not complete' },
        { at_text: '10:20', text: 'cash out SLE 8,000', tag: 'could not complete' },
        { at_text: '09:05', text: 'cash out SLE 5,500', tag: 'had less than asked' },
      ],
      explanation:
        'Cash ran low above SLE 5,000 but the declaration was not lowered. A float request for SLE 5,000 is pending.',
    })
  }
  const ibrahim = find('Agent 009')
  if (ibrahim.presence === 'hidden') {
    out.push({
      id: 'sig-2',
      agent_ref: ibrahim.ref,
      agent_name: ibrahim.shop,
      severity: 'medium',
      title: 'Hidden during business hours',
      sentence: 'Hidden 11:20–15:40 on 4 of the last 5 days, each time with a float request waiting.',
      evidence: [
        { at_text: 'Today', text: 'hidden since 11:20', tag: 'hidden' },
        { at_text: 'Yesterday', text: 'hidden 11:05 – 15:20', tag: 'hidden' },
      ],
      explanation: 'A repeating cash shortage around midday, not an agent avoiding work.',
    })
  }
  const amadu = find('Agent 038')
  if (freshnessOf(ageMin(amadu)) === 'expired') {
    out.push({
      id: 'sig-3',
      agent_ref: amadu.ref,
      agent_name: amadu.shop,
      severity: 'low',
      title: 'Status not updated in 3 days',
      sentence: `Last declaration ${ageText(ageMin(amadu))}. Customers no longer see this agent.`,
      evidence: [{ at_text: '14 Sep', text: 'last declaration 08:10', tag: 'expired' }],
      explanation: null,
    })
  }
  return out
}

export function demoOperatorValue(ref: string, key: 'balance' | 'float') {
  return operatorValue(ref, key)
}


/* ---------- dashboard ---------- */


/** Deterministic, plausible series per range. Same shape the API will return. */
export function demoAgentInsights(ref: string, range: InsightRange): AgentInsights {
  const a = find(ref)
  const scale = a.ref === 'Agent 024' ? 1 : a.ref === 'Agent 031' ? 0.6 : 0.35
  const connected = Boolean(operatorValues[ref])
  let seed = ref.length * 7 + range.length
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  let points: InsightPoint[]
  if (range === 'today' || range === 'yesterday') {
    const hours = Array.from({ length: 14 }, (_, i) => 7 + i) // 07:00 – 20:00
    const cut = range === 'today' ? 11 : 14 // today is partial
    // Freshness dips around midday, the classic pattern the product fixes.
    points = hours.slice(0, cut).map((h) => {
      const busy = h >= 9 && h <= 13 ? 1 : h >= 16 && h <= 18 ? 0.8 : 0.4
      const fresh = h < 9 ? 95 : h <= 11 ? 80 : h <= 14 ? 35 : h <= 16 ? 60 : 85
      return {
        label: `${String(h).padStart(2, '0')}:00`,
        found_you: Math.round((1 + rnd() * 2) * busy * scale * (range === 'today' ? 1.2 : 1)),
        transactions: connected ? Math.round((2 + rnd() * 4) * busy * scale) : null,
        fresh_pct: Math.round(fresh + (rnd() - 0.5) * 10),
      }
    })
  } else if (range === 'week') {
    const days = ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Today']
    const found = [9, 16, 6, 11, 13, 8, a.found_you]
    const tx = [24, 38, 17, 29, 31, 22, a.transactions]
    const fresh = [62, 85, 38, 69, 77, 46, 71]
    points = days.map((d, i) => ({
      label: d,
      found_you: i === 6 ? found[i]! : Math.round(found[i]! * scale),
      transactions: connected ? (i === 6 ? tx[i]! : Math.round(tx[i]! * scale)) : null,
      fresh_pct: fresh[i]!,
    }))
  } else {
    points = Array.from({ length: 30 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (29 - i))
      const dow = d.getDay()
      // A weekly rhythm — Saturday market peak, quiet Sunday — with a slow upward drift as
      // the agent gets used to keeping the status fresh.
      const rhythm = dow === 6 ? 1.35 : dow === 0 ? 0.55 : dow === 3 ? 0.8 : 1
      const drift = 0.8 + (i / 29) * 0.4
      const fresh = Math.round(Math.min(95, (dow === 0 ? 40 : 55) + (i / 29) * 30 + (rnd() - 0.5) * 12))
      return {
        label: `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`,
        found_you: Math.round(10 * rhythm * drift * scale * (0.9 + rnd() * 0.2)),
        transactions: connected ? Math.round(26 * rhythm * scale * (0.9 + rnd() * 0.2)) : null,
        fresh_pct: fresh,
      }
    })
  }

  const foundTotal = points.reduce((n, p) => n + p.found_you, 0)
  const txTotal = connected ? points.reduce((n, p) => n + (p.transactions ?? 0), 0) : null
  const freshPct = Math.round(points.reduce((n, p) => n + p.fresh_pct, 0) / Math.max(1, points.length))
  return {
    range,
    points,
    found_total: foundTotal,
    found_delta: Math.round(foundTotal * 0.18),
    fresh_pct: freshPct,
    transactions_total: txTotal,
    operator_source: connected ? 'Orange' : null,
  }
}


/* ---------- dealer: agent detail, actions, financial audit ---------- */

const actions: ActionLogged[] = []
const audit: AuditEntry[] = []

export function demoDealerAgentDetail(ref: string): DealerAgentDetail {
  const a = find(ref)
  const pending = floatRequests.find((r) => r.agent_ref === ref && r.state === 'pending')
  const signals = demoSignals().filter((s) => s.agent_ref === ref).length
  const words = `${CAPACITY_RANGES.find((c) => c.word === a.cash_out)?.label} · ${CAPACITY_RANGES.find((c) => c.word === a.deposit)?.label}`
  const availability =
    a.ref === 'Agent 024'
      ? [
          { time_text: '07:40', text: `Open · ${words}`, tone: 'neutral' as const },
          { time_text: '11:20', text: 'Hidden · 25 min', tone: 'warning' as const },
          { time_text: '11:45', text: `Open · ${words}`, tone: 'neutral' as const },
        ]
      : [{ time_text: new Date(a.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), text: `${PRESENCE_LABELS[a.presence].split(' ·')[0]} · ${words}`, tone: 'neutral' as const }]
  return {
    ref: a.ref,
    name: a.name,
    shop_name: a.shop,
    area: a.area,
    declaration: declarationOf(a),
    today: {
      transactions: operatorValues[ref] ? a.transactions : null,
      successful: operatorValues[ref] ? a.successful : null,
      found_you: a.found_you,
      reported_problems: a.problems,
    },
    pending_float: pending ? decorate(pending) : null,
    availability_today: availability,
    open_signals: signals,
  }
}

export function demoDealerAct(ref: string, action: DealerAction, by: string): ActionLogged {
  const a = find(ref)
  const note =
    action === 'contact'
      ? `${by} contacted ${a.shop}`
      : action === 'nudge'
        ? `${by} asked ${a.shop} to update their status`
        : `${by} escalated ${a.shop} to the super distributor`
  const entry: ActionLogged = { id: `act-${Date.now()}-${actions.length}`, action, agent_ref: ref, at: new Date().toISOString(), note }
  actions.unshift(entry)
  if (action === 'nudge') record('Your dealer asked you to check your status is still correct', 'agent_finder', 'warning')
  return entry
}

export function demoActions(ref: string | null): ActionLogged[] {
  return actions.filter((x) => (ref ? x.agent_ref === ref : true))
}

/**
 * The audit row is written BEFORE the value is returned, and it stores the field name and
 * purpose — never the value. A read without a purpose is refused.
 */
export function demoRevealFinancial(ref: string, key: 'balance' | 'float', purpose: string, by: string) {
  if (!purpose.trim()) throw new Error('Say why you need to see this. The reason is recorded.')
  const v = operatorValue(ref, key)
  if (!v) throw new Error('That value is not available for this agent.')
  audit.unshift({ id: `aud-${Date.now()}-${audit.length}`, at: new Date().toISOString(), actor: by, agent_ref: ref, field: key, purpose: purpose.trim() })
  return v
}

export function demoAudit(): AuditEntry[] {
  return [...audit]
}
