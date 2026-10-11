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

/**
 * The words the Search box understands. Each one is a fact about an agent; a word in the
 * query keeps only the agents it is true for, and several words narrow in turn. The Agents
 * tab's pills are the same facts, so a pill and a word can never disagree. Longer phrases are
 * listed before the single words they contain ("not on map" before "map").
 */
export interface Keyword {
  key: string
  /** How the fact is written in the summary line: "2 agents away". */
  label: string
  /** The spellings that mean it, lower case. */
  words: string[]
  test: (a: DealerAgentRow) => boolean
}

const onMap = (a: DealerAgentRow) => a.active && a.located && a.location_confirmed

export const KEYWORDS: Keyword[] = [
  { key: 'unlocated', label: 'not on the map', words: ['not on the map', 'not on map', 'off the map', 'unlocated', 'no pin', 'unpinned'], test: (a) => a.active && !onMap(a) },
  { key: 'to_confirm', label: 'with a pin to confirm', words: ['pin to confirm', 'to confirm', 'unconfirmed', 'confirm'], test: (a) => a.active && a.located && !a.location_confirmed },
  { key: 'no_photo', label: 'without a photo', words: ['no photo', 'without photo', 'without a photo', 'no picture'], test: (a) => !a.photo },
  { key: 'orange_file', label: "from Orange's file", words: ["orange's file", 'orange file', 'from orange', 'imported'], test: (a) => a.source === 'orange_file' },
  { key: 'registered', label: 'registered in the app', words: ['registered', 'in the app', 'manual'], test: (a) => a.source === 'manual' },
  { key: 'active', label: 'active', words: ['active', 'fresh'], test: (a) => a.bucket === 'active' },
  { key: 'open', label: 'open', words: ['open', 'serving'], test: (a) => a.presence === 'open' },
  { key: 'limited', label: 'limited', words: ['limited', 'small', 'none'], test: (a) => a.bucket === 'limited' },
  { key: 'hidden', label: 'away', words: ['away', 'hidden', 'paused'], test: (a) => a.bucket === 'hidden' },
  { key: 'closed', label: 'closed', words: ['closed', 'stale', 'expired'], test: (a) => a.bucket === 'closed' },
  { key: 'inactive', label: 'inactive at Orange', words: ['inactive', 'non active', 'non-active', 'not active', 'deactivated'], test: (a) => !a.active },
  { key: 'attention', label: 'needing attention', words: ['attention', 'needs attention', 'flagged', 'problem', 'problems'], test: (a) => a.attention },
  { key: 'float', label: 'asking for float', words: ['float', 'float request', 'asking'], test: (a) => a.pending_float },
  { key: 'photo', label: 'with a photo', words: ['photo', 'picture', 'photographed'], test: (a) => a.photo },
  { key: 'verified', label: 'verified', words: ['verified', 'checked'], test: (a) => a.verified },
  { key: 'unverified', label: 'not verified', words: ['unverified', 'not verified', 'unchecked'], test: (a) => !a.verified },
  { key: 'new', label: 'with no track record yet', words: ['new', 'no track record', 'no record'], test: (a) => a.reliability.label === 'new' },
  { key: 'reliable', label: 'reliable', words: ['reliable', 'trusted'], test: (a) => a.reliability.label === 'reliable' },
  { key: 'mixed', label: 'mixed', words: ['mixed'], test: (a) => a.reliability.label === 'mixed' },
  { key: 'unreliable', label: 'unreliable', words: ['unreliable'], test: (a) => a.reliability.label === 'unreliable' },
  { key: 'west', label: 'in the West', words: ['west', 'western'], test: (a) => a.region === 'west' },
  { key: 'north', label: 'in the North', words: ['north', 'northern'], test: (a) => a.region === 'north' },
  { key: 'east', label: 'in the East', words: ['east', 'eastern'], test: (a) => a.region === 'east' },
  { key: 'south', label: 'in the South', words: ['south', 'southern'], test: (a) => a.region === 'south' },
]

export function keywordByKey(key: string): Keyword | undefined {
  return KEYWORDS.find((k) => k.key === key)
}

/** A query split into the facts it names and the free text left over. */
export interface ParsedQuery {
  keywords: Keyword[]
  /** What was not a keyword: a name, a number, a street, a phone. Lower case, trimmed. */
  text: string
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseQuery(query: string): ParsedQuery {
  let rest = ` ${query.trim().toLowerCase().replace(/\s+/g, ' ')} `
  const keywords: Keyword[] = []
  for (const k of KEYWORDS) {
    for (const w of k.words) {
      const re = new RegExp(` ${escape(w)}(?= )`)
      if (re.test(rest)) {
        if (!keywords.includes(k)) keywords.push(k)
        rest = rest.replace(re, ' ')
      }
    }
  }
  return { keywords, text: rest.replace(/\s+/g, ' ').trim() }
}

/** Does this agent match the free text: name, person, number, Orange code, phone, street or town? */
export function agentMatchesText(a: DealerAgentRow, text: string): boolean {
  const q = text.trim().toLowerCase()
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  const haystack = [a.name, a.person_name, a.ref, a.area, a.city ?? '', a.agent_code ?? ''].join(' ').toLowerCase()
  if (haystack.includes(q)) return true
  if (digits.length >= 2) {
    if ([a.ref.replace(/\D/g, ''), a.agent_code ?? ''].some((v) => v.includes(digits))) return true
    // Phones: "076 000 009", "76000009" and "+232 76 000 009" are the same line.
    const local = (d: string) => d.replace(/^(232|0)/, '')
    const phone = local((a.phone ?? '').replace(/\D/g, ''))
    if (phone && phone.includes(local(digits))) return true
  }
  return false
}

/** Every word narrows; the free text must match too. */
export function agentMatches(a: DealerAgentRow, query: string): boolean {
  const { keywords, text } = parseQuery(query)
  return keywords.every((k) => k.test(a)) && agentMatchesText(a, text)
}

/** "2 agents away in the West · 5 in all", or "1 agent" when only a name was typed. */
export function summaryLine(shown: number, total: number, keywords: Keyword[]): string {
  const noun = shown === 1 ? 'agent' : 'agents'
  const facts = keywords.map((k) => k.label).join(', ')
  return keywords.length === 0 ? `${shown} ${noun}` : `${shown} ${noun} ${facts} · ${total} in all`
}
