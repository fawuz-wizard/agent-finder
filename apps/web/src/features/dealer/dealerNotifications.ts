import { useCallback, useEffect, useState } from 'react'
import type { DealerOverview, FloatForecast, FloatSend } from '@/types/operator'

/**
 * The aggregator's bell. Nothing new on the server: float requests waiting, pins to confirm
 * and the float forecast already come with Home; float sent comes from the send record. The
 * bell gathers them, counts the ones this phone has not opened, and each says where to go.
 * What was seen is kept on the phone, like the agent's bell.
 */
export interface DealerNotice {
  id: string
  group: 'requests' | 'pins' | 'forecast' | 'earlier'
  title: string
  sub: string
  amount?: number
  to: string
  call?: string | null
}

const SEEN_KEY = 'af.dealerSeenNotifications'
const EVENT = 'af-dealer-notifications-seen'

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function writeSeen(ids: Set<string>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-300)))
  } catch {
    // Fine without it: the count comes back next time.
  }
  window.dispatchEvent(new Event(EVENT))
}

const OFF_KEY = 'af.dealerBellOff'

/** The kinds of bell alert, in the order Settings lists them; each can be switched off on this phone. */
export const BELL_KINDS: { group: DealerNotice['group']; label: string }[] = [
  { group: 'requests', label: 'Float requests' },
  { group: 'forecast', label: 'Float forecast' },
  { group: 'pins', label: 'Pins to confirm' },
  { group: 'earlier', label: 'Float sent' },
]

/** The kinds switched off on this phone. Only what the bell shows changes; the server sends the same. */
export function readBellOff(): Set<DealerNotice['group']> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OFF_KEY) ?? '[]') as DealerNotice['group'][])
  } catch {
    return new Set()
  }
}

export function writeBellOff(off: Set<DealerNotice['group']>): void {
  try {
    localStorage.setItem(OFF_KEY, JSON.stringify([...off]))
  } catch {
    // Fine without it: every kind shows.
  }
  window.dispatchEvent(new Event(EVENT))
}

const code = (ref: string) => ref.replace(/^Agent /, '')
const dayKey = () => new Date().toISOString().slice(0, 10)

/** Waiting requests first, then pins, the forecast, and float sent in the last week; kinds switched off in Settings are left out. */
export function buildDealerNotices(o: DealerOverview | null, forecast: FloatForecast[] = [], sends: FloatSend[] = []): DealerNotice[] {
  if (!o) return []
  const off = readBellOff()
  const calls = new Map(forecast.map((f) => [f.agent_ref, f.call_url]))
  const out: DealerNotice[] = []
  for (const r of o.float_requests)
    out.push({
      id: `float-${r.id}`,
      group: 'requests',
      title: r.agent_name,
      sub: `${code(r.agent_ref)} · asked ${r.waiting_text} ago${r.ageing ? ' · ageing' : ''}`,
      amount: r.amount_sle,
      to: `/dealer/float/${r.id}`,
      call: calls.get(r.agent_ref) ?? null,
    })
  for (const w of o.pins_waiting)
    out.push({ id: `pin-${w.ref}`, group: 'pins', title: w.name, sub: `${code(w.ref)} · pinned by ${w.person_name} · ${w.area}`, to: `/dealer/agents/${encodeURIComponent(w.ref)}` })
  const high = o.forecast_counts.high ?? 0
  const watch = o.forecast_counts.medium ?? 0
  if (high + watch > 0) {
    const names = forecast.filter((f) => f.risk === 'high').map((f) => f.agent_name)
    out.push({
      // A new day, or a different count, is a new notice; Home can count it without the names.
      id: `forecast-${dayKey()}-${high}-${watch}`,
      group: 'forecast',
      title: high > 0 ? `${high} likely short by tomorrow` : `${watch} to watch this week`,
      sub: [names.length ? names.slice(0, 3).join(', ') : null, "from the agents' own records", high > 0 && watch > 0 ? `${watch} more to watch` : null].filter(Boolean).join(' · '),
      to: '/dealer/float?tab=low',
    })
  }
  const week = Date.now() - 7 * 86_400_000
  for (const s of sends.filter((x) => new Date(x.sent_at).getTime() >= week).slice(0, 5))
    out.push({
      id: `sent-${s.id}`,
      group: 'earlier',
      title: `Float sent to ${s.agent_name}`,
      sub: `Recorded by ${s.sent_by} · ${new Date(s.sent_at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`,
      amount: s.amount_sle,
      to: '/dealer/float?tab=history',
    })
  return out.filter((n) => !off.has(n.group))
}

/** Which notices this phone has opened, and the unread count for the bell. "Earlier" never counts. */
export function useDealerSeen(notices: DealerNotice[]) {
  const [seen, setSeen] = useState<Set<string>>(readSeen)
  useEffect(() => {
    const on = () => setSeen(readSeen())
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  const unread = notices.filter((n) => n.group !== 'earlier' && !seen.has(n.id)).length
  const markSeen = useCallback((ids: string[]) => {
    const next = readSeen()
    ids.forEach((i) => next.add(i))
    writeSeen(next)
  }, [])
  return { seen, unread, markSeen }
}
