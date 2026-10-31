/**
 * Float sent, in the demo build: the same rules as the API's /float-sends, over the demo's
 * agents and requests. A send answering a request completes it (approved first when it was
 * still pending). Kept apart from operatorDemo.ts, which is frozen for new features. The app
 * never moves money: these rows are what the aggregator says they sent in Orange Money.
 */
import type { FloatSend, SendFloatBody } from '@/types/operator'
import { demoAgentRows, demoFloatRequests, demoMoveFloat } from './operatorDemo'

const DAY = 86_400_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

// What came before in the demo week, matching the demo's completed request of five days ago.
const sends: FloatSend[] = [
  { id: 'fs-seed-1', agent_ref: 'Agent 024', agent_name: "Fatmata's Shop", amount_sle: 10_000, om_reference: 'MP2410.1105', request_id: 'fr-0', sent_at: ago(5 * DAY - 40 * 60_000), sent_by: 'Kissy Distribution' },
  { id: 'fs-seed-2', agent_ref: 'Agent 038', agent_name: 'Amadu Corner Shop', amount_sle: 20_000, om_reference: 'MP1710.0830', request_id: null, sent_at: ago(12 * DAY), sent_by: 'Kissy Distribution' },
]
const tokens = new Map<string, FloatSend>()

export function demoFloatSends(ref: string | null, days?: number): FloatSend[] {
  const since = days ? Date.now() - days * DAY : 0
  return sends
    .filter((s) => (ref ? s.agent_ref === ref : true) && new Date(s.sent_at).getTime() >= since)
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
    .map((s) => ({ ...s }))
}

export function demoSendFloat(body: SendFloatBody, by: string): FloatSend {
  if (body.client_token && tokens.has(body.client_token)) return { ...tokens.get(body.client_token)! }
  const agent = demoAgentRows().find((a) => a.ref === body.agent_ref)
  if (!agent) throw new Error('That agent is not one of yours.')
  if (!Number.isFinite(body.amount_sle) || body.amount_sle < 100) throw new Error('Enter the amount you sent.')
  const ref = body.om_reference?.trim() || null
  if (body.request_id) {
    const req = demoFloatRequests(null).find((r) => r.id === body.request_id)
    if (!req || req.agent_ref !== agent.ref) throw new Error('That request is not one of yours.')
    if (req.state !== 'pending' && req.state !== 'approved') throw new Error(`A ${req.state} request cannot be sent.`)
    const note = `Sent SLE ${body.amount_sle.toLocaleString('en-US')}${ref ? ` · ref ${ref}` : ''}`
    if (req.state === 'pending') demoMoveFloat(req.id, 'approved', by, note)
    demoMoveFloat(req.id, 'completed', by, note)
  }
  const s: FloatSend = { id: `fs-${Date.now().toString(36)}`, agent_ref: agent.ref, agent_name: agent.name, amount_sle: Math.round(body.amount_sle), om_reference: ref, request_id: body.request_id ?? null, sent_at: new Date().toISOString(), sent_by: by }
  sends.unshift(s)
  if (body.client_token) tokens.set(body.client_token, s)
  return { ...s }
}
