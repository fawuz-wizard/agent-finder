/**
 * Operator API service — the single transport for the agent and dealer surfaces.
 * Screens call this and nothing else. Live mode sends the session token; demo mode
 * runs the seeded operator network with a little latency so loading states are real.
 */
import { api } from '@/lib/api'
import { config } from '@/lib/config'
import * as demo from './operatorDemo'
import type {
  ActivityEvent,
  AgentHome,
  AgentInsights,
  AgentProfile,
  CapacityWord,
  DealerAgentRow,
  DealerOverview,
  Declaration,
  FloatRequest,
  FloatRequestState,
  InsightRange,
  OperatorValue,
  ActionLogged,
  AuditEntry,
  DealerAction,
  DealerAgentDetail,
  Presence,
  Role,
  Session,
  SignalMuteKind,
  SignalMuted,
} from '@/types/operator'

const LATENCY_MS = 350

function delay<T>(value: T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => resolve(value), LATENCY_MS)
    signal?.addEventListener('abort', () => {
      clearTimeout(id)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
}

function fail(e: unknown): never {
  throw e instanceof Error ? e : new Error('Something went wrong.')
}

/** Signal ids are "sig-<rule>-<agent ref>"; the API wants the agent on every action. */
function agentRefOfSignal(id: string): string {
  return id.split('-').slice(2).join('-')
}

export const operatorApi = {
  signIn(ref: string, pin: string, role: Role): Promise<Session> {
    if (config.useLiveApi) return api.post<Session>('/api/v1/auth/sign-in', { ref, pin, role })
    try {
      return delay(demo.demoSignIn(ref, pin, role))
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Sign-in failed.'))
    }
  },

  /** Revokes the token on the server. Best effort: the local session is cleared regardless. */
  signOut(token: string): Promise<void> {
    if (config.useLiveApi) {
      return api.post<void>('/api/v1/auth/sign-out', {}, undefined, { Authorization: `Bearer ${token}` })
    }
    return Promise.resolve()
  },

  /* agent */
  home(ref: string, signal?: AbortSignal): Promise<AgentHome> {
    if (config.useLiveApi) return api.get<AgentHome>('/api/v1/agent/home', signal)
    return delay(demo.demoAgentHome(ref), signal)
  },

  confirmDeclaration(ref: string): Promise<Declaration> {
    if (config.useLiveApi) return api.post<Declaration>('/api/v1/agent/availability/confirm', {})
    return delay(demo.demoConfirmDeclaration(ref))
  },

  declare(
    ref: string,
    body: { presence: Presence; cash_out: CapacityWord; deposit: CapacityWord; night_mode: boolean },
  ): Promise<Declaration> {
    if (config.useLiveApi) return api.post<Declaration>('/api/v1/agent/availability', body)
    return delay(demo.demoDeclare(ref, body))
  },

  insights(ref: string, range: InsightRange, signal?: AbortSignal): Promise<AgentInsights> {
    if (config.useLiveApi) return api.get<AgentInsights>(`/api/v1/agent/insights?range=${range}`, signal)
    return delay(demo.demoAgentInsights(ref, range), signal)
  },

  activity(ref: string, signal?: AbortSignal): Promise<ActivityEvent[]> {
    if (config.useLiveApi) return api.get<ActivityEvent[]>('/api/v1/agent/activity', signal)
    return delay(demo.demoAgentActivity(ref), signal)
  },

  profile(ref: string, signal?: AbortSignal): Promise<AgentProfile> {
    if (config.useLiveApi) return api.get<AgentProfile>('/api/v1/agent/profile', signal)
    return delay(demo.demoAgentProfile(ref), signal)
  },

  setPhoneVisible(ref: string, visible: boolean): Promise<AgentProfile> {
    if (config.useLiveApi) return api.post<AgentProfile>('/api/v1/agent/profile/phone', { visible })
    return delay(demo.demoSetPhoneVisible(ref, visible))
  },

  /* float */
  floatRequests(ref: string | null, signal?: AbortSignal): Promise<FloatRequest[]> {
    if (config.useLiveApi) {
      const q = ref ? `?agent=${encodeURIComponent(ref)}` : ''
      return api.get<FloatRequest[]>(`/api/v1/float-requests${q}`, signal)
    }
    return delay(demo.demoFloatRequests(ref), signal)
  },

  requestFloat(ref: string, amount_sle: number, reason: string, client_token?: string): Promise<FloatRequest> {
    if (config.useLiveApi) {
      return api.post<FloatRequest>('/api/v1/float-requests', { amount_sle, reason, client_token })
    }
    try {
      return delay(demo.demoRequestFloat(ref, amount_sle, reason))
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Request failed.'))
    }
  },

  moveFloat(id: string, to: FloatRequestState, by: string, reason: string | null): Promise<FloatRequest> {
    if (config.useLiveApi) {
      return api.post<FloatRequest>(`/api/v1/float-requests/${encodeURIComponent(id)}/decision`, { to, reason })
    }
    try {
      return delay(demo.demoMoveFloat(id, to, by, reason))
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('That change was not allowed.'))
    }
  },

  /* dealer */
  dealerOverview(signal?: AbortSignal): Promise<DealerOverview> {
    if (config.useLiveApi) return api.get<DealerOverview>('/api/v1/dealer/overview', signal)
    return delay(demo.demoDealerOverview(), signal)
  },

  dealerAgents(signal?: AbortSignal): Promise<DealerAgentRow[]> {
    if (config.useLiveApi) return api.get<DealerAgentRow[]>('/api/v1/dealer/agents', signal)
    return delay(demo.demoAgentRows(), signal)
  },

  dealerAgent(ref: string, signal?: AbortSignal): Promise<DealerAgentDetail> {
    if (config.useLiveApi) return api.get<DealerAgentDetail>(`/api/v1/dealer/agents/${encodeURIComponent(ref)}`, signal)
    return delay(demo.demoDealerAgentDetail(ref), signal)
  },

  act(ref: string, action: DealerAction, by: string): Promise<ActionLogged> {
    if (config.useLiveApi) return api.post<ActionLogged>('/api/v1/actions', { agent: ref, action })
    return delay(demo.demoDealerAct(ref, action, by))
  },

  /**
   * Snooze or resolve a signal on my queue. It is one more row on the action log (with the
   * signal id), so the API is POST /actions; the agent's status is never touched.
   */
  muteSignal(id: string, kind: SignalMuteKind, by: string): Promise<SignalMuted> {
    if (config.useLiveApi)
      return api
        .post<ActionLogged>('/api/v1/actions', { agent: agentRefOfSignal(id), action: kind, signal_id: id })
        .then((x) => ({ id, kind, agent_ref: x.agent_ref, until: x.until ?? '', note: x.note }))
    try {
      return delay(demo.demoMuteSignal(id, kind, by))
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Not available.'))
    }
  },

  actions(ref: string | null, signal?: AbortSignal): Promise<ActionLogged[]> {
    if (config.useLiveApi) return api.get<ActionLogged[]>(`/api/v1/actions${ref ? `?agent=${encodeURIComponent(ref)}` : ''}`, signal)
    return delay(demo.demoActions(ref), signal)
  },

  /**
   * Permission-checked read of an operator-owned value. The backend writes the audit row
   * BEFORE returning anything; the frontend check is UX only and is not a security boundary.
   */
  revealFinancial(ref: string, key: 'balance' | 'float', purpose: string, by: string): Promise<OperatorValue> {
    if (config.useLiveApi) {
      return api.post<OperatorValue>(`/api/v1/financial/${encodeURIComponent(ref)}`, { field: key, purpose })
    }
    try {
      return delay(demo.demoRevealFinancial(ref, key, purpose, by))
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('That value is not available.'))
    }
  },

  audit(signal?: AbortSignal): Promise<AuditEntry[]> {
    if (config.useLiveApi) return api.get<AuditEntry[]>('/api/v1/audit', signal)
    return delay(demo.demoAudit(), signal)
  },
}

export { fail }
