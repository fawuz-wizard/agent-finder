import { useCallback, useEffect, useState } from 'react'
import { config } from '@/lib/config'
import type { TransactionType } from '@/types/public'

/**
 * The visit a customer was last sent to, so the outcome question can be asked on return.
 * Session-scoped and non-identifying: an agent id, a label and a timestamp — nothing about
 * the customer. Cleared once reported or skipped.
 */
export interface PendingVisit {
  agentId: string
  agentName: string
  transaction: TransactionType | null
  amount: number | null
  at: number
}

const KEY = 'af.pendingVisit'

function read(): PendingVisit | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PendingVisit) : null
  } catch {
    return null
  }
}

export function usePendingVisit() {
  const [visit, setVisit] = useState<PendingVisit | null>(read)

  const [, tick] = useState(0)

  useEffect(() => {
    const sync = () => {
      setVisit(read())
      tick((n) => n + 1)
    }
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  // Re-check once the waiting period has elapsed, so a customer sitting on the home screen
  // after taking directions is still asked.
  useEffect(() => {
    if (!visit) return
    const remaining = visit.at + config.outcomePromptAfterMs - Date.now()
    if (remaining <= 0) return
    const id = window.setTimeout(() => tick((n) => n + 1), remaining + 50)
    return () => window.clearTimeout(id)
  }, [visit])

  const remember = useCallback((v: Omit<PendingVisit, 'at'>) => {
    const next = { ...v, at: Date.now() }
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* private mode — the prompt simply will not appear */
    }
    setVisit(next)
  }, [])

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    setVisit(null)
  }, [])

  const due = visit !== null && Date.now() - visit.at >= config.outcomePromptAfterMs

  return { visit, due, remember, clear }
}
