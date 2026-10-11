import type { DealerAgentRow } from '@/types/operator'

/**
 * What the aggregator searched for lately, for the pills under the Search box. Local to this
 * phone, five at most, the newest first. A query is text only: no result, no agent record.
 */
const KEY = 'af.dealer.searches'
const LIMIT = 5

export function readSearches(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((q): q is string => typeof q === 'string' && q.trim() !== '') : []
  } catch {
    return []
  }
}

export function rememberSearch(query: string): string[] {
  const q = query.trim()
  if (!q) return readSearches()
  const next = [q, ...readSearches().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, LIMIT)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage may be blocked; the list is a convenience only.
  }
  return next
}

/** Does this agent match what was typed? Name, person, number, Orange code, phone, street or town. */
export function agentMatches(a: DealerAgentRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  const text = [a.name, a.person_name, a.ref, a.area, a.city ?? '', a.agent_code ?? ''].join(' ').toLowerCase()
  if (text.includes(q)) return true
  if (digits.length >= 2) {
    if ([a.ref.replace(/\D/g, ''), a.agent_code ?? ''].some((v) => v.includes(digits))) return true
    // Phones: "076 000 009", "76000009" and "+232 76 000 009" are the same line.
    const local = (d: string) => d.replace(/^(232|0)/, '')
    const phone = local((a.phone ?? '').replace(/\D/g, ''))
    if (phone && phone.includes(local(digits))) return true
  }
  return false
}
