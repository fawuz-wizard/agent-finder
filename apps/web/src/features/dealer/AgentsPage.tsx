import { Link } from 'react-router-dom'
import { Card } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { DealerAgentRow } from '@/types/operator'

const TONE: Record<DealerAgentRow['presence'], string> = { open: 'text-success', hidden: 'text-warning', closed: 'text-muted' }

/** Agent register — every agent this dealer is responsible for, with their current word. */
export default function DealerAgentsPage() {
  const { data, state } = useAsync<DealerAgentRow[]>((s) => operatorApi.dealerAgents(s))
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-paper px-4 py-3">
        <h1 className="text-lg font-bold leading-tight">Agents</h1>
        <p className="text-xs text-muted">Registered under you · tap one to see their day</p>
      </header>
      <div className="flex flex-col gap-3 p-4 pb-6">
        {state === 'loading' && <p className="text-sm text-muted">Loading…</p>}
        {(data ?? []).map((a) => (
          <Link key={a.ref} to={`/dealer/agents/${encodeURIComponent(a.ref)}`}>
            <Card interactive className={a.attention ? 'border-l-4 border-l-warning' : ''}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-base font-bold">
                  {a.ref} · {a.name}
                </span>
                <span className="shrink-0 whitespace-nowrap text-xs text-muted">{a.freshness_text}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className={`font-bold ${TONE[a.presence]}`}>{a.presence_text}</span>
                <span className="text-muted">{a.declaration_text}</span>
              </div>
              <p className="text-xs text-muted">{a.area}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
