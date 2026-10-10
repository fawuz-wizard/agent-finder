/**
 * The shops a customer opened lately, for the "Recent" rows on the finder's first screen.
 * Local to this phone, non-identifying (an agent id, a name, an area, a time), three at most.
 */
export interface RecentAgent {
  id: string
  name: string
  area: string
  at: number
}

const KEY = 'af.recentAgents'
const LIMIT = 3

export function readRecent(): RecentAgent[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? (list as RecentAgent[]).filter((r) => typeof r?.id === 'string' && typeof r.name === 'string') : []
  } catch {
    return []
  }
}

export function rememberRecent(agent: { id: string; name: string; area: string }, now = Date.now()): void {
  try {
    const rest = readRecent().filter((r) => r.id !== agent.id)
    localStorage.setItem(KEY, JSON.stringify([{ ...agent, at: now }, ...rest].slice(0, LIMIT)))
  } catch {
    // Storage may be blocked; the list is a convenience only.
  }
}

/** "today", "yesterday", "3 days ago" — as the file writes it after the area. */
export function whenLabel(at: number, now = Date.now()): string {
  const day = 24 * 60 * 60 * 1000
  const startOfToday = new Date(now).setHours(0, 0, 0, 0)
  if (at >= startOfToday) return 'today'
  const days = Math.ceil((startOfToday - at) / day)
  return days === 1 ? 'yesterday' : `${days} days ago`
}
