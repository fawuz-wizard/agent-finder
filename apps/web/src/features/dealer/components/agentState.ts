import type { DealerBucket, Presence } from '@/types/operator'

export type StateTone = 'good' | 'warn' | 'bad' | 'neutral'

/**
 * One word for an agent's state, the same on the agent list, the agent's page, the chips and
 * the home's count cards, so no two screens ever disagree.
 */
export function agentState(a: { active: boolean; bucket: DealerBucket; presence: Presence }): { text: string; tone: StateTone } {
  if (!a.active) return { text: 'Inactive at Orange', tone: 'bad' }
  if (a.bucket === 'active') return { text: 'Open', tone: 'good' }
  if (a.bucket === 'limited') return { text: 'Low today', tone: 'warn' }
  if (a.bucket === 'hidden') return { text: 'Away', tone: 'warn' }
  if (a.presence === 'open') return { text: 'Status too old', tone: 'neutral' }
  return { text: 'Closed', tone: 'neutral' }
}

/** What keeps customers from finding the shop at all, if anything; the worst first. */
export function mapBlock(a: { active: boolean; verified: boolean; located: boolean; location_confirmed: boolean }): string | null {
  if (!a.active) return null // the state already says it
  if (!a.verified) return 'Not verified'
  if (!a.located) return 'Not on the map'
  if (!a.location_confirmed) return 'Pin to confirm'
  return null
}
