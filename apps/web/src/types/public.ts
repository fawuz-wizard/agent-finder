/**
 * Public customer types. These mirror the API's public view contract exactly.
 *
 * NOTHING private may appear here: no balance, capacity word, range bound, signal,
 * hide event, report count, rating, comment or audit field. If a field would let a
 * customer infer an agent's holdings, it does not belong in this file.
 */

export type TransactionType = 'cash_out' | 'deposit' | 'send'

/** The six public phrases. The server decides which one applies; the client only renders it. */
export type PublicOutcome = 'likely' | 'limited' | 'expired' | 'closed' | 'hidden' | 'not_set'

/** Freshness is computed by the backend domain layer, never in the browser. */
export type FreshnessState = 'fresh' | 'aging' | 'may_have_changed' | 'expired'

export interface AgentResult {
  id: string
  name: string
  area: string
  distance_m: number
  /** Outcome for THIS request, decided server-side. */
  outcome: PublicOutcome
  /** The exact customer-facing phrase, in the requested language. */
  outcome_text: string
  freshness: FreshnessState
  /** e.g. "Updated 6 min ago" — server-formatted so the client never recomputes age. */
  freshness_text: string
  /** Why the server put this result first. Present on the recommended result only. */
  why?: string | null
  /** Why a nearer agent may not serve this request. */
  note?: string | null
  /** Maps hand-off URL built by the server from the coarse business point. */
  directions_url: string
  can_call: boolean
}

export interface SearchQueryEcho {
  transaction: TransactionType
  transaction_label: string
  amount_sle: number | null
  amount_label: string | null
  area: string
  radius_m: number
}

export interface SearchResponse {
  query: SearchQueryEcho
  /** Nearest agents that can likely serve this request (0–2). */
  recommended: AgentResult[]
  /** Nearer than the recommendation, but the outcome is not "likely". */
  closer_not_serving: AgentResult[]
  /** Everything else, already ranked by the server. */
  results: AgentResult[]
  total: number
  /** ISO timestamp the server produced this answer. */
  generated_at: string
  /** Server note when every nearby status is stale. */
  banner?: string | null
}

export interface AgentDetail extends AgentResult {
  /** Outcome restated against the customer's own request, e.g. "For Cash out · SLE 2,000". */
  request_label: string
  hours_text: string
  verified_label?: string | null
  /** Present only when the agent opted in; never rendered as plain text. */
  call_url?: string | null
}

export type OutcomeAnswer = 'yes' | 'no' | 'did_not_go'

export interface OutcomeReason {
  code: string
  label: string
}

export interface VisitReport {
  agent_id: string
  transaction: TransactionType | null
  amount_sle: number | null
  answer: OutcomeAnswer
  reason_code?: string | null
  /** Optional and network-only. Never displayed to any customer. */
  rating?: number | null
  comment?: string | null
  source: 'search' | 'direct'
  /** Idempotency key so a retry cannot double-submit. */
  client_token: string
}

export interface ReportAccepted {
  id: string
  accepted: true
}

export interface SearchRequest {
  transaction: TransactionType
  amount_sle: number | null
  /** Coarse area label. Used when the device gave no position, and as the display label. */
  area: string
  /** Coarse point, rounded to ~110 m. Absent when the customer declined location. */
  lat?: number
  lng?: number
  radius_m?: number
}

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  cash_out: 'Cash out',
  deposit: 'Deposit',
  send: 'Send',
}

export const TRANSACTION_HINTS: Record<TransactionType, string> = {
  cash_out: 'Take cash out',
  deposit: 'Put cash in',
  send: 'Send money to someone',
}
