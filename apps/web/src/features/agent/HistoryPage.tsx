import { useState } from 'react'
import { useAsync } from '@/hooks/useAsync'
import { LoadError } from '@/design'
import { operatorApi } from '@/services/operatorApi'
import { useSession } from '@/features/auth/session'
import type { AgentTransactions } from '@/types/operator'
import { AgentTitle } from './components/agentKit'
import { chip } from './components/agentClasses'
import { formatSle } from './money'

type Filter = 'All' | 'Withdrawal' | 'Deposit' | 'Transfer'
const FILTERS: Filter[] = ['All', 'Withdrawal', 'Deposit', 'Transfer']
// The design's words: a withdrawal is a cash out, a deposit a cash in. Agent Finder records no transfers.
const SIDE: Record<'cash_out' | 'deposit', Filter> = { cash_out: 'Withdrawal', deposit: 'Deposit' }

/**
 * Transaction History, the new design's screen 11, nothing added: the four chips, then each of
 * today's transactions (type, amount, time and result, the amount again on the right). The
 * rows are the agent's own records and Orange's, when connected; a failed one says so.
 */
export default function HistoryPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const [filter, setFilter] = useState<Filter>('All')
  const tx = useAsync<AgentTransactions>((s) => operatorApi.transactions(ref, s), [ref])
  const rows = (tx.data?.rows ?? []).filter((r) => filter === 'All' || SIDE[r.transaction] === filter)

  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <AgentTitle title="Transaction History" />
      <div role="group" aria-label="Show" className="flex gap-2 overflow-x-auto px-[18px] pb-2 pt-5">
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={chip(filter === f)}>
            {f}
          </button>
        ))}
      </div>
      <div className="flex flex-col px-[18px] pb-8">
        {tx.state === 'loading' && !tx.data && <p className="py-4 text-sm text-finder-muted">Loading…</p>}
        {tx.state === 'error' && <LoadError what="your transactions" error={tx.error} onRetry={tx.refresh} className="my-2" />}
        {tx.data && rows.length === 0 && <p className="py-4 text-sm text-finder-muted">{filter === 'Transfer' ? 'No transfers recorded.' : 'Nothing yet today.'}</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex gap-3.5 border-b border-finder-card-line py-4">
            <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${r.successful ? 'bg-agent-green' : 'bg-agent-away-dot'}`}>
              {r.successful ? '+' : '!'}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="text-sm font-bold">{SIDE[r.transaction]}</span>
              <span className="text-[13px] font-bold">{r.amount_text}</span>
              <span className="text-[11px] text-finder-muted">
                {r.time_text} · <span className={`font-semibold ${r.successful ? 'text-agent-green' : 'text-danger'}`}>{r.successful ? 'Success' : 'Could not complete'}</span>
              </span>
            </span>
            <span className={`shrink-0 text-sm font-bold ${r.successful ? 'text-agent-green-ink' : 'text-finder-muted'}`}>{r.amount_sle !== null ? formatSle(r.amount_sle) : r.amount_text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
