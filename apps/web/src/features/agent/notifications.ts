import { useCallback, useEffect, useMemo, useState } from 'react'
import { operatorApi } from '@/services/operatorApi'
import type { AgentFeedback, AgentHome } from '@/types/operator'

/**
 * The bell. Nothing new on the server: the things an agent should hear about already exist
 * (a float decision, customers who could not be served, a comment, a status that wants a
 * check). The bell gathers them, counts the ones this phone has not opened yet, and the list
 * says where to go. What was seen is kept on the phone.
 */
export interface Notification {
  id: string
  text: string
  when: string
  to: string
  tone: 'neutral' | 'good' | 'warning' | 'danger'
}

const SEEN_KEY = 'af.seenNotifications'
const EVENT = 'af-notifications-seen'

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function writeSeen(ids: Set<string>): void {
  try {
    // Keep it short: the last two hundred are plenty for a phone.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200)))
  } catch {
    // Fine without it: the count comes back next time.
  }
  window.dispatchEvent(new Event(EVENT))
}

const dayKey = () => new Date().toISOString().slice(0, 10)
const shorten = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** The list, newest concern first, from what the home and the feedback already say. */
export function buildNotifications(home: AgentHome | null, feedback: AgentFeedback | null): Notification[] {
  const out: Notification[] = []
  const f = home?.latest_float
  if (f && f.decided_at && f.state !== 'pending' && f.state !== 'cancelled') {
    const decidedToday = f.decided_at.slice(0, 10) === dayKey()
    if (decidedToday)
      out.push({
        id: `float-${f.id}-${f.state}`,
        text: `Your float request of ${f.amount_sle.toLocaleString('en-US')} was ${f.state}${f.decision_reason ? `: “${f.decision_reason}”` : ''}`,
        when: 'Today',
        to: '/agent/services',
        tone: f.state === 'declined' ? 'warning' : 'good',
      })
  }
  for (const sentence of home?.attention ?? []) {
    out.push({ id: `attention-${dayKey()}-${sentence.slice(0, 40)}`, text: sentence, when: 'Today', to: '/agent/activity', tone: 'danger' })
  }
  for (const item of feedback?.items ?? []) {
    out.push({
      id: `feedback-${item.id}`,
      text: item.kind === 'not_served' ? `A customer could not be served: ${item.reason_text ?? 'no reason given'}${item.comment ? ` — “${shorten(item.comment)}”` : ''}` : `New customer comment: “${shorten(item.comment ?? '')}”`,
      when: item.day_text,
      to: '/agent/activity',
      tone: item.kind === 'not_served' ? 'warning' : 'neutral',
    })
  }
  if (home?.declaration.confirm_due && home.customers_see.state === 'open') {
    out.push({ id: `confirm-${dayKey()}`, text: home.declaration.confirm_reason ?? 'Still correct? Give your status a look.', when: 'Today', to: '/agent', tone: 'neutral' })
  }
  return out
}

export function useNotifications(ref: string): { items: Notification[]; unseen: number; markSeen: () => void; loading: boolean } {
  const [home, setHome] = useState<AgentHome | null>(null)
  const [feedback, setFeedback] = useState<AgentFeedback | null>(null)
  const [loading, setLoading] = useState(true)
  const [seen, setSeen] = useState<Set<string>>(readSeen)

  useEffect(() => {
    const ctrl = new AbortController()
    let alive = true
    Promise.allSettled([operatorApi.home(ref, ctrl.signal), operatorApi.feedback(ref, ctrl.signal)]).then(([h, f]) => {
      if (!alive) return
      if (h.status === 'fulfilled') setHome(h.value)
      if (f.status === 'fulfilled') setFeedback(f.value)
      setLoading(false)
    })
    return () => {
      alive = false
      ctrl.abort()
    }
  }, [ref])

  useEffect(() => {
    const sync = () => setSeen(readSeen())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const items = useMemo(() => buildNotifications(home, feedback), [home, feedback])
  const unseen = items.filter((n) => !seen.has(n.id)).length
  const markSeen = useCallback(() => {
    const next = new Set(readSeen())
    for (const n of items) next.add(n.id)
    writeSeen(next)
  }, [items])
  return { items, unseen, markSeen, loading }
}
