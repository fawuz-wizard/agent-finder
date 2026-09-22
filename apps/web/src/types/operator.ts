/**
 * The operator-side contract: agent and dealer. Separate from types/public.ts on purpose —
 * these shapes carry capacity words, float and signals, and must never be reachable from
 * the customer surface. The split is the boundary: a customer screen cannot import a type
 * it does not have.
 *
 * Money note: `balance` and `float_position` are READ-THROUGH values from the operator
 * system. They arrive with their source and the time they were read, are never stored by
 * Agent Finder, and never enter browser persistence.
 */

export type Role = 'agent' | 'dealer'

export interface Session {
  token: string
  role: Role
  /** Display name for the signed-in person. */
  name: string
  /** Agent number or dealer name — the operator's identifier, not ours. */
  ref: string
  /** Named grants. The backend is authoritative; these only decide what the UI offers. */
  permissions: string[]
}

export type CapacityWord = 'most' | 'some' | 'small' | 'none'
export type Presence = 'open' | 'hidden' | 'closed'

export interface CapacityRange {
  word: CapacityWord
  label: string
  /** Network-wide ceiling in SLE. null means no upper bound. */
  ceiling_sle: number | null
  hint: string
}

export interface Declaration {
  presence: Presence
  cash_out: CapacityWord
  deposit: CapacityWord
  /** The agent's own figures behind the words ("up to about SLE 5,000"), when given. */
  cash_out_sle: number | null
  deposit_sle: number | null
  /** ISO timestamp of the last declaration or confirmation. */
  updated_at: string
  /** Minutes since the declaration, computed by the server. */
  age_min: number
  /** Server-computed: how the customer side is currently treating this declaration. */
  freshness: 'fresh' | 'aging' | 'may_have_changed' | 'expired'
  freshness_text: string
  /** True when the agent should be asked "still correct?" */
  confirm_due: boolean
  /** Why it is asked now, when an event (a failed or confirmed visit) raised it, not the clock. */
  confirm_reason: string | null
  night_mode: boolean
  /** "agent": the agent's own words. "operator": the host system's position, read just now. */
  capacity_source: 'agent' | 'operator'
  source_text: string | null
}

/** What the agent sends. Figures are optional; when given, the word is derived server-side. */
export interface DeclareBody {
  presence: Presence
  cash_out: CapacityWord
  deposit: CapacityWord
  cash_out_sle?: number | null
  deposit_sle?: number | null
  night_mode: boolean
}

/** A value owned by the operator, shown with its provenance and never stored. */
export interface OperatorValue {
  amount_sle: number
  source: string
  read_at: string
}

export type FloatRequestState = 'pending' | 'approved' | 'completed' | 'declined' | 'cancelled'

export interface FloatRequest {
  id: string
  agent_ref: string
  agent_name: string
  amount_sle: number
  reason: string
  state: FloatRequestState
  requested_at: string
  waiting_text: string
  decided_at: string | null
  decided_by: string | null
  decision_reason: string | null
  /** True once the request has waited long enough to reach the dealer's attention queue. */
  ageing: boolean
}

export type ActivitySource = 'operator' | 'agent_finder'

export interface ActivityEvent {
  id: string
  at: string
  time_text: string
  text: string
  source: ActivitySource
  tone: 'neutral' | 'warning' | 'danger' | 'good'
}

export interface AgentToday {
  /** Customers who were shown this agent as a result and took directions. */
  found_you: number
  /** Operator-owned count; absent when the operator link is not connected. */
  transactions: number | null
  successful: number | null
  reported_problems: number
}

/**
 * One side of "Customers now see": the public phrase a customer reads for this agent, with
 * the network range it covers. Phrased on the server by the same function the customer search
 * uses, so the card and the search can never disagree.
 */
export interface CustomersSeeSide {
  label: string
  phrase: string
  /** "any amount" · "up to SLE 10,000" · "up to SLE 500" · "no amount" */
  range_text: string
  /** What a customer asking for more than the range reads; null when nothing is above it. */
  above_text: string | null
  /** Agent-only: their figure and what confirmed visits since leave of it. */
  estimate_text: string | null
  /** Agent-only: the failed visit that lowered the ceiling, so they can dispute it. */
  why: string | null
}

export interface CustomersSee {
  state: 'open' | 'hidden' | 'closed' | 'expired'
  headline: string
  explanation: string
  /** Empty when one headline (hidden, closed, expired) applies to every request. */
  sides: CustomersSeeSide[]
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const WEEKDAY_NAMES: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}
/** ["08:00", "20:00"] or null for closed. */
export type DayHours = [string, string] | null
export type WeeklyHours = Record<Weekday, DayHours>

/**
 * Working hours are the agent's own instruction, applied by the system with a warning
 * first: fifteen minutes before the close, "notice" asks whether to stay open.
 */
export interface ScheduleState {
  open_now: boolean
  today: DayHours
  today_only: boolean
  extended_until: string | null
  closes_at: string | null
  closing_in_min: number | null
  hours_text: string
  notice: string | null
}

export interface Schedule {
  weekly: WeeklyHours
  overrides: Record<string, DayHours>
  today: ScheduleState
}

export interface TodayChange {
  hours?: [string, string]
  day_off?: boolean
  extend_minutes?: number
  clear?: boolean
}

export interface AgentHome {
  name: string
  ref: string
  area: string
  declaration: Declaration
  schedule: ScheduleState
  customers_see: CustomersSee
  balance: OperatorValue | null
  float_position: OperatorValue | null
  pending_float: FloatRequest | null
  today: AgentToday
  /** Short sentences, already phrased by the server. Never raw report rows. */
  attention: string[]
}

export interface AgentProfile {
  name: string
  ref: string
  shop_name: string
  area: string
  hours_text: string
  dealer_name: string
  phone_visible: boolean
  verified: boolean
  devices: { id: string; label: string; last_seen_text: string; current: boolean }[]
}

/* ---------- dealer ---------- */

/** The one bucket an agent is in right now. Tiles count these; the register filters by them. */
export type DealerBucket = 'active' | 'limited' | 'hidden' | 'closed'

export type DealerCounts = Record<DealerBucket, number>

/**
 * Trust score: how often the agent's word matched what customers found, from visit reports
 * against the status shown at the time. Dealer-facing only; it ranks and flags, never changes
 * a word, and a customer never sees it.
 */
export interface Reliability {
  label: 'reliable' | 'mixed' | 'unreliable' | 'new'
  label_text: string
  text: string
  visits: number
  matched: number
}

export interface DealerAgentRow {
  ref: string
  name: string
  area: string
  presence: Presence
  presence_text: string
  /** Server-computed from the same rule as the dashboard counts, so the two never disagree. */
  bucket: DealerBucket
  declaration_text: string
  freshness_text: string
  attention: boolean
  reliability: Reliability
  capacity_source?: 'agent' | 'operator'
}

export interface Signal {
  id: string
  agent_ref: string
  agent_name: string
  /** tel: link for the row's Call button; null when no number is on file. */
  call_url: string | null
  severity: 'high' | 'medium' | 'low'
  title: string
  sentence: string
  evidence: { at_text: string; text: string; tag: string }[]
  explanation: string | null
}

export type FloatRisk = 'high' | 'medium' | 'low'

/**
 * Float demand forecast: who will probably run short of cash by tomorrow, from the pilot's
 * own evidence (confirmed visits, the agent's words, failed visits, top-up history). A ranking
 * with reasons. Never a balance, never a figure of the agent's, never a decision.
 */
export interface FloatForecast {
  agent_ref: string
  agent_name: string
  risk: FloatRisk
  headline: string
  reasons: string[]
  days_left_text: string | null
  last_top_up_text: string | null
  pending_request: boolean
  call_url: string | null
}

export interface DealerOverview {
  dealer_name: string
  agent_count: number
  counts: DealerCounts
  float_requests: FloatRequest[]
  signals: Signal[]
  forecast_counts: Record<FloatRisk, number>
}

/** Permission names. The UI asks; the API decides. */
export const PERMISSIONS = {
  viewAgent: 'VIEW_AGENT',
  viewFinancial: 'VIEW_AGENT_FINANCIAL_DETAIL',
  manageFloat: 'MANAGE_FLOAT_REQUEST',
  viewHistory: 'VIEW_AGENT_HISTORY',
  contact: 'CONTACT_AGENT',
  escalate: 'ESCALATE_AGENT',
} as const

export const CAPACITY_RANGES: CapacityRange[] = [
  { word: 'most', label: 'Most', ceiling_sle: null, hint: 'above 10,000' },
  { word: 'some', label: 'Some', ceiling_sle: 10_000, hint: 'up to 10,000' },
  { word: 'small', label: 'Small', ceiling_sle: 500, hint: 'up to 500' },
  { word: 'none', label: 'None', ceiling_sle: 0, hint: 'nothing right now' },
]

/** The word a figure implies on the network ranges — the same rule the API applies. */
export function wordForFigure(sle: number): CapacityWord {
  if (sle <= 0) return 'none'
  if (sle <= 500) return 'small'
  if (sle <= 10_000) return 'some'
  return 'most'
}

export const PRESENCE_LABELS: Record<Presence, string> = {
  open: 'Open · serving',
  hidden: 'Hidden',
  closed: 'Closed',
}

/* ---------- agent dashboard ---------- */

export type InsightRange = 'today' | 'yesterday' | 'week' | 'month'

export interface InsightPoint {
  /** Axis label: an hour ("09:00") for a day range, a day ("Mon", "12 Sep") otherwise. */
  label: string
  /** Customers who were shown this agent and took directions. Agent Finder data. */
  found_you: number
  /** Operator-owned; null when the operator link is not connected. */
  transactions: number | null
  /** Share of the interval the declaration was fresh, 0–100. */
  fresh_pct: number
}

export interface AgentInsights {
  range: InsightRange
  points: InsightPoint[]
  found_total: number
  /** Change against the previous equivalent range, as a signed count. */
  found_delta: number
  /** Share of open time across the range the declaration was fresh, 0–100. */
  fresh_pct: number
  /** Operator-owned total; null when not connected. */
  transactions_total: number | null
  operator_source: string | null
}

/* ---------- dealer: agent detail, actions, audit ---------- */

export interface DealerAgentDetail {
  ref: string
  name: string
  shop_name: string
  area: string
  declaration: Declaration
  /** Read-through counts; null when the operator link is not connected. */
  today: { transactions: number | null; successful: number | null; found_you: number; reported_problems: number }
  pending_float: FloatRequest | null
  availability_today: { time_text: string; text: string; tone: 'neutral' | 'warning' }[]
  open_signals: number
  reliability: Reliability
  /** The dealer's note: what this agent usually handles, until the operator's records replace it. */
  usual: UsualNote
  /** Where the current ceiling per side comes from: operator | dealer | visits | none. */
  evidence: { cash: { source: string; text: string }; float: { source: string; text: string } }
}

export interface UsualNote {
  usual_max_sle: number | null
  usual_float_max_sle: number | null
  usual_daily_transactions: number | null
}

export type DealerAction = 'contact' | 'call' | 'nudge' | 'escalate'

/**
 * Snooze (four hours) or resolve (rest of today) one signal. It is the dealer's own queue
 * housekeeping: logged as an action, never a change to the agent's status, and the signal
 * comes back tomorrow if the condition is still true.
 */
export type SignalMuteKind = 'snooze' | 'resolve'

export interface SignalMuted {
  id: string
  kind: SignalMuteKind
  agent_ref: string
  until: string
  note: string
}

export interface ActionLogged {
  id: string
  action: DealerAction | SignalMuteKind
  agent_ref: string
  at: string
  note: string
  /** Only snooze and resolve carry these: which signal, and when the row stops hiding it. */
  signal_id?: string | null
  until?: string | null
}

/** What the server writes BEFORE it returns a financial value. Never the value itself. */
export interface AuditEntry {
  id: string
  at: string
  actor: string
  agent_ref: string
  field: 'balance' | 'float'
  purpose: string
}
