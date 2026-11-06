import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { DealerAgentRow, MapAgentRow } from '@/types/operator'

export type PinTone = 'open' | 'limited' | 'away' | 'inactive'
export interface AgentPin {
  key: string
  lat: number
  lng: number
  tone: PinTone
  label: string
}
export const TONE_DOT: Record<PinTone, string> = {
  open: 'bg-design-green',
  limited: 'bg-design-amber',
  away: 'bg-agent-away-dot',
  inactive: 'bg-design-red',
}

/** One of the aggregator's agents with a confirmed point, and the colour the maps draw it in. */
export interface PlacedAgent extends DealerAgentRow {
  lat: number
  lng: number
  tone: PinTone
}

/** Today's state as a map colour, from the same bucket the dashboard counts. */
export function pinTone(a: DealerAgentRow): PinTone {
  if (!a.active) return 'inactive'
  if (a.bucket === 'limited') return 'limited'
  if (a.bucket === 'active') return 'open'
  return 'away'
}

export const TONE_LABEL: Record<PinTone, string> = { open: 'Open now', limited: 'Low today', away: 'Away or closed', inactive: 'Inactive at Orange' }

/** The aggregator's agents joined to their confirmed points (the server scopes both to this aggregator). */
export function usePlacedAgents() {
  const agents = useAsync<DealerAgentRow[]>((s) => operatorApi.dealerAgents(s))
  const points = useAsync<MapAgentRow[]>((s) => operatorApi.mapAgents({}, s))
  const at = new Map((points.data ?? []).filter((p) => p.lat !== null && p.lng !== null).map((p) => [p.ref, p] as const))
  const placed: PlacedAgent[] = (agents.data ?? []).flatMap((a) => {
    const p = at.get(a.ref)
    return p ? [{ ...a, lat: p.lat!, lng: p.lng!, tone: pinTone(a) }] : []
  })
  const loading = agents.state === 'loading' || points.state === 'loading'
  const error = agents.state === 'error' ? agents.error : points.state === 'error' ? points.error : null
  const refresh = () => {
    agents.refresh()
    points.refresh()
  }
  return { placed, all: agents.data ?? [], loading, error, refresh }
}

export const toPins = (rows: PlacedAgent[]): AgentPin[] => rows.map((a) => ({ key: a.ref, lat: a.lat, lng: a.lng, tone: a.tone, label: `${a.name} · ${TONE_LABEL[a.tone]}` }))
