import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, Skeleton } from '@/design'
import { customerApi } from '@/services/customerApi'
import { ApiRequestError } from '@/lib/api'
import { usePendingVisit } from '@/hooks/usePendingVisit'
import type { AgentDetail, TransactionType } from '@/types/public'
import { ServiceStatus } from './components/ServiceStatus'
import { FreshnessBadge } from './components/FreshnessBadge'
import { DistanceLabel } from './components/DistanceLabel'
import { ErrorState } from './components/states'

/** Agent detail — the outcome restated against the customer's own request, then directions. */
export default function AgentDetailPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { remember } = usePendingVisit()

  const tx = (params.get('tx') as TransactionType | null) ?? null
  const amount = params.get('amount') ? Number(params.get('amount')) : null

  useEffect(() => {
    const ctrl = new AbortController()
    setError(null)
    customerApi
      .agent(id, { transaction: tx, amount_sle: amount }, ctrl.signal)
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
  }, [id, tx, amount])

  if (error) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <ErrorState message={error} />
        <Link to="/find">
          <Button size="control">Search again</Button>
        </Link>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-paper px-4 py-3">
        <button type="button" onClick={() => history.back()} aria-label="Back" className="-ml-2 flex h-control w-control items-center justify-center rounded-card text-2xl leading-none text-muted">
          ‹
        </button>
        <p className="truncate text-base font-bold text-muted">Agent</p>
      </header>

      <div className="flex flex-col gap-4 p-4 pb-32">
        <div>
          <h1 className="text-xl font-bold leading-tight">{agent.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            {agent.area} · <DistanceLabel metres={agent.distance_m} />
            {agent.verified_label && (
              <span className="rounded-pill bg-canvas px-2 py-0.5 text-xs font-semibold text-muted">{agent.verified_label}</span>
            )}
          </p>
        </div>

        <Card>
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">{agent.request_label}</p>
            <ServiceStatus outcome={agent.outcome} text={agent.outcome_text} size="lg" />
            <FreshnessBadge state={agent.freshness} text={agent.freshness_text} />
            <p className="text-sm text-muted">{agent.hours_text}</p>
          </div>
        </Card>

        <Card className="bg-canvas">
          <h2 className="text-base font-bold">What this means</h2>
          <p className="mt-1 text-sm text-muted">
            The agent told us what they can handle. We never show their cash. Ask when you arrive.
          </p>
        </Card>

        <Link to="/report-a-visit" className="-mx-2 flex h-control items-center self-start rounded-card px-2 text-base font-semibold text-brand-text">
          Report a visit
        </Link>
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-line bg-paper p-4">
        <a
          href={agent.directions_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            remember({ agentId: agent.id, agentName: agent.name, transaction: tx, amount })
          }
          className="inline-flex h-cta w-full items-center justify-center rounded-cta bg-brand text-lg font-bold text-ink"
        >
          Get directions
        </a>
        {agent.call_url && (
          <a
            href={agent.call_url}
            className="inline-flex h-control w-full items-center justify-center rounded-card border-2 border-brand-deep text-base font-semibold text-brand-text"
          >
            Call agent
          </a>
        )}
      </div>
    </div>
  )
}
