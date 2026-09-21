import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Sheet, useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { CAPACITY_RANGES, PERMISSIONS, PRESENCE_LABELS } from '@/types/operator'
import type { DealerAgentDetail, FloatRequest } from '@/types/operator'
import { formatSle } from '@/features/agent/money'
import { MaskedValue } from './components/MaskedValue'

/**
 * D3 — Float request review. Three outcomes, never a silent one: approve, contact the agent
 * first, or decline with a reason the agent reads in their own app.
 */
export default function DealerFloatReviewPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { session, can } = useSession()
  const list = useAsync<FloatRequest[]>((s) => operatorApi.floatRequests(null, s), [id])
  const req = (list.data ?? []).find((r) => r.id === id) ?? null
  const agent = useAsync<DealerAgentDetail | null>((s) => (req ? operatorApi.dealerAgent(req.agent_ref, s) : Promise.resolve(null)), [req?.agent_ref])
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const may = can(PERMISSIONS.manageFloat)

  async function decide(to: 'approved' | 'declined') {
    if (!req) return
    setBusy(true)
    setError(null)
    try {
      await operatorApi.moveFloat(req.id, to, session?.name ?? 'Dealer', to === 'declined' ? reason : null)
      toast.show(to === 'approved' ? `Approved ${formatSle(req.amount_sle)} for ${req.agent_name}` : `Declined — ${req.agent_name} can read your reason`)
      navigate('/dealer/float')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the decision.')
    } finally {
      setBusy(false)
    }
  }

  if (list.state === 'loading' && !list.data) return <p className="p-4 text-base text-muted">Loading…</p>
  if (!req)
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-base font-semibold text-danger">That request no longer exists.</p>
        <Link to="/dealer/float" className="text-base font-bold text-brand-text">
          Back to float requests
        </Link>
      </div>
    )

  const a = agent.data
  const word = (w: DealerAgentDetail['declaration']['cash_out']) => CAPACITY_RANGES.find((c) => c.word === w)?.label ?? w

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-paper px-4 py-3">
        <Link to="/dealer/float" aria-label="Back" className="-ml-2 flex h-control w-control items-center justify-center rounded-card text-2xl leading-none text-muted">
          ‹
        </Link>
        <div>
          <h1 className="text-lg font-bold leading-tight">Float request</h1>
          <p className="text-xs text-muted">
            {req.agent_ref} · requested {new Date(req.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3 p-4 pb-6">
        <Card className="border-brand-deep bg-brand-faint">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Amount requested</p>
          <p className="text-2xl font-bold">{formatSle(req.amount_sle)}</p>
          <p className="mt-2 text-xs font-bold uppercase tracking-wider text-muted">Reason given</p>
          <p className="text-base">“{req.reason}”</p>
          {req.state !== 'pending' && (
            <p className="mt-2 text-sm font-semibold text-muted">
              Already {req.state}
              {req.decision_reason ? ` — “${req.decision_reason}”` : ''}
            </p>
          )}
        </Card>

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Context</p>
          <div className="flex items-baseline justify-between border-b border-line py-2">
            <span className="text-sm text-muted">Declared now</span>
            <span className="text-sm font-bold">{a ? `${PRESENCE_LABELS[a.declaration.presence].split(' ·')[0]} · ${word(a.declaration.cash_out)} · ${word(a.declaration.deposit)}` : '…'}</span>
          </div>
          <div className="flex items-baseline justify-between border-b border-line py-2">
            <span className="text-sm text-muted">Transactions today</span>
            <span className="text-sm font-bold">{a ? (a.today.transactions ?? '—') : '…'}</span>
          </div>
          <div className="flex items-baseline justify-between border-b border-line py-2">
            <span className="text-sm text-muted">Reported problems today</span>
            <span className="text-sm font-bold">{a ? a.today.reported_problems : '…'}</span>
          </div>
          <MaskedValue agentRef={req.agent_ref} field="float" label="Float position" />
        </Card>

        {req.state === 'pending' && may && (
          <>
            <Button size="cta" onClick={() => decide('approved')} disabled={busy}>
              Approve
            </Button>
            <Button size="cta" variant="secondary" onClick={() => toast.show(`Contact ${req.agent_name} — logged`)} disabled={busy}>
              Contact agent first
            </Button>
            <Button size="cta" variant="destructive" onClick={() => setDeclining(true)} disabled={busy}>
              Decline
            </Button>
            <p className="text-center text-xs text-muted">A decline needs a reason. The agent reads it in their app — no phone call needed to find out what happened.</p>
          </>
        )}
        {req.state === 'pending' && !may && <p className="text-center text-sm font-semibold text-muted">You can see this request but not decide it.</p>}
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </div>

      <Sheet open={declining} onClose={() => setDeclining(false)} title="Decline this request">
        <p className="text-sm text-muted">Write it as you would say it to them. They will see these exact words.</p>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 160))}
          placeholder="Too close to your last top-up — call me"
          className="h-control rounded-card border-2 border-line bg-paper px-3 text-base outline-none focus:border-brand-deep"
        />
        <Button size="control" variant="destructive" onClick={() => decide('declined')} disabled={busy || !reason.trim()}>
          Decline with this reason
        </Button>
        <Button size="control" variant="tertiary" onClick={() => setDeclining(false)}>
          Cancel
        </Button>
      </Sheet>
    </div>
  )
}
