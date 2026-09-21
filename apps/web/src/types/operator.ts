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
  /** ISO timestamp of the last declaration or confirmation. */
  updated_at: string
  /** Minutes since the declaration, computed by the server. */
  age_min: number
  /** Server-computed: how the customer side is currently treating this declaration. */
  freshness: 'fresh' | 'aging' | 'may_have_changed' | 'expired'
  freshness_text: string
  /** True when the agent should be asked "still correct?" */
  confirm_due: boolean
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
}

export interface CustomersSee {
  state: 'open' | 'hidden' | 'closed' | 'expired'
  headline: string
  explanation: string
  /** Empty when one headline (hidden, closed, expired) applies to every request. */
  sides: CustomersSeeSide[]
}

export interface AgentHome {
  name: string
  ref: string
  area: string
  declaration: Declaration
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

export interface DealerCounts {
  active: number
  limited: number
  hidden: number
  closed: number
}

export interface DealerAgentRow {
  ref: string
  name: string
  area: string
  presence: Presence
  presence_text: string
  declaration_text: string
  freshness_text: string
  attention: boolean
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

export interface DealerOverview {
  dealer_name: string
  agent_count: number
  counts: DealerCounts
  float_requests: FloatRequest[]
  signals: Signal[]
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
