import { useEffect, useState } from 'react'
import { customerApi } from '@/services/customerApi'
import { ApiRequestError } from '@/lib/api'
import type { AgentDetail, TransactionType } from '@/types/public'
import { pointFrom } from './searchPoint'

/** What the detail and directions pages read from the URL: the request the customer made. */
export interface AgentRequest {
  tx: TransactionType | null
  amount: number | null
  area: string
  point: { lat: number; lng: number } | null
}

export function requestFrom(params: URLSearchParams): AgentRequest {
  return {
    tx: (params.get('tx') as TransactionType | null) ?? null,
    amount: params.get('amount') ? Number(params.get('amount')) : null,
    area: params.get('area') ?? 'Lumley',
    point: pointFrom(params),
  }
}

/**
 * One agent, restated against the customer's own request. The details page and the
 * directions page load the same answer from the same URL, so what the customer read on one
 * is exactly what the other draws.
 */
export function useAgentDetail(id: string, req: AgentRequest): { agent: AgentDetail | null; error: string | null } {
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pointKey = req.point ? `${req.point.lat},${req.point.lng}` : ''

  useEffect(() => {
    const ctrl = new AbortController()
    setError(null)
    customerApi
      .agent(id, { transaction: req.tx, amount_sle: req.amount, area: req.area, ...(req.point ?? {}) }, ctrl.signal)
      .then(setAgent)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(
          e instanceof ApiRequestError
            ? e.error.message
            : 'We could not find that agent. It may have been removed from the network.',
        )
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, req.tx, req.amount, req.area, pointKey])

  return { agent, error }
}
