import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { AuditEntry } from '@/types/operator'
import { FinderHeader } from '@/features/end-user/components/finder'
import { Line } from '@/features/agent/components/agentChrome'

/** Your financial reveals: which field you saw, for whom, why and when. Never the amount. */
export default function DealerRevealsPage() {
  const audit = useAsync<AuditEntry[]>((s) => operatorApi.audit(s))
  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <FinderHeader back="/dealer/profile" title="Your financial reveals" />
      <div className="mt-4 flex flex-col">
        {audit.state === 'loading' && <p className="py-2 text-base font-medium text-finder-muted">Loading…</p>}
        {(audit.data ?? []).map((a) => (
          <Line
            key={a.id}
            className="py-2"
            label={
              <span className="block">
                <span className="block font-bold text-finder-ink">
                  {a.field === 'balance' ? 'Balance' : 'Float position'} · {a.agent_ref.replace(/^Agent /, 'Code ')}
                </span>
                <span className="block text-xs font-medium text-finder-muted">“{a.purpose}”</span>
              </span>
            }
            value={new Date(a.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          />
        ))}
        {audit.state === 'ready' && (audit.data ?? []).length === 0 && <p className="py-2 text-base font-medium text-finder-muted">None yet.</p>}
      </div>
      <p className="mt-2 text-xs font-medium text-finder-muted">The record keeps which field you saw and why. It never keeps the amount.</p>
    </div>
  )
}
