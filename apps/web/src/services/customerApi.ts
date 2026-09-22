/**
 * Customer API service. Screens call this module and nothing else — there are no
 * raw fetch() calls in components.
 *
 * Transport is chosen once, here: the live API when VITE_API_MODE=live, otherwise the
 * seeded demo network. Swapping to the real backend is a config change, not a refactor.
 */
import { api } from '@/lib/api'
import { config } from '@/lib/config'
import { demoAgent, demoAgentName, demoSearch, recordDemoVisit, setDemoOperatorFeed } from './demoNetwork'

/**
 * Demo only: flip the simulated Orange Money feed for both surfaces. The operator side is
 * reached through a dynamic import so nothing of it ships in the customer's bundle.
 */
export function setOperatorFeedDemo(on: boolean): void {
  setDemoOperatorFeed(on)
  void import('./operatorDemo').then((m) => m.demoSetOperatorFeed(on))
}
import type {
  AgentDetail,
  ReportAccepted,
  SearchRequest,
  SearchResponse,
  TransactionType,
  VisitReport,
} from '@/types/public'

const LATENCY_MS = 450

function delay<T>(value: T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => resolve(value), LATENCY_MS)
    signal?.addEventListener('abort', () => {
      clearTimeout(id)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

export const customerApi = {
  search(req: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    if (config.useLiveApi) return api.post<SearchResponse>('/api/v1/search', req, signal)
    return delay(demoSearch(req), signal)
  },

  agent(
    id: string,
    ctx: { transaction: TransactionType | null; amount_sle: number | null },
    signal?: AbortSignal,
  ): Promise<AgentDetail> {
    if (config.useLiveApi) {
      const q = new URLSearchParams()
      if (ctx.transaction) q.set('transaction', ctx.transaction)
      if (ctx.amount_sle !== null) q.set('amount_sle', String(ctx.amount_sle))
      return api.get<AgentDetail>(`/api/v1/agents/${encodeURIComponent(id)}?${q.toString()}`, signal)
    }
    const found = demoAgent(id, ctx.transaction, ctx.amount_sle)
    if (!found) return Promise.reject(new Error('agent_not_found'))
    return delay(found, signal)
  },

  report(body: VisitReport, signal?: AbortSignal): Promise<ReportAccepted> {
    if (config.useLiveApi) return api.post<ReportAccepted>('/api/v1/reports', body, signal)
    // Demo: the report moves the customer's own results, and the agent's "Customers now see"
    // through a dynamic import, so no operator code ships in the customer's bundle.
    recordDemoVisit(body)
    const shop = demoAgentName(body.agent_id)
    if (shop && body.answer !== 'did_not_go' && body.amount_sle !== null) {
      const tx = body.transaction === 'deposit' ? 'deposit' : 'cash_out'
      void import('./operatorDemo').then((m) =>
        m.demoRecordVisit(shop, tx, body.amount_sle!, body.answer as 'yes' | 'no', body.reason_code ?? null),
      )
    }
    return delay({ id: `rep-${body.client_token.slice(0, 8)}`, accepted: true as const }, signal)
  },
}
