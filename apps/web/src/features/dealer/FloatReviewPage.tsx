import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { CAPACITY_RANGES, PERMISSIONS, PRESENCE_LABELS } from '@/types/operator'
import type { DealerAgentDetail, FloatRequest } from '@/types/operator'
import { formatSle } from '@/features/agent/money'
import { FinderCta, FinderHeader, FinderSheet } from '@/features/end-user/components/finder'
import { EdgeCard, FieldLabel, TextField } from '@/features/agent/components/agentChrome'
import { Line, PillButton, Section } from './components/dealerChrome'
import { MaskedValue } from './components/MaskedValue'

/**
 * Float request review. Three outcomes, never a silent one: approve, contact the agent
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

  if (list.state === 'loading' && !list.data)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 text-finder-ink">
        <FinderHeader back="/dealer/float" title="Float request" />
        <p className="text-base font-medium text-finder-muted">Loading…</p>
      </div>
    )
  if (!req)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 text-finder-ink">
        <FinderHeader back="/dealer/float" title="Float request" />
        <p className="text-base font-semibold text-danger">That request no longer exists.</p>
        <Link to="/dealer/float" className="text-base font-bold text-finder-link">
          Back to float requests
        </Link>
      </div>
    )

  const a = agent.data
  const word = (w: DealerAgentDetail['declaration']['cash_out']) => CAPACITY_RANGES.find((c) => c.word === w)?.label ?? w

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <FinderHeader back="/dealer/float" title="Float request" />
      <p className="mt-4 text-sm font-bold text-finder-muted">
        {req.agent_name} · {req.agent_ref.replace(/^Agent /, 'Code ')} · requested {new Date(req.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <EdgeCard muted={req.state !== 'pending'}>
          <p className="text-xs font-bold uppercase tracking-wider text-finder-muted">Amount requested</p>
          <p className="text-2xl font-bold leading-none">{formatSle(req.amount_sle)}</p>
          <p className="mt-2 text-xs font-bold uppercase tracking-wider text-finder-muted">Reason given</p>
          <p className="text-base font-medium">“{req.reason}”</p>
          {req.state !== 'pending' && (
            <p className="text-sm font-semibold text-finder-muted">
              Already {req.state}
              {req.decision_reason ? ` — “${req.decision_reason}”` : ''}
            </p>
          )}
        </EdgeCard>

        <Section heading="Context">
          <Line label="Declared now" value={a ? `${PRESENCE_LABELS[a.declaration.presence].split(' ·')[0]} · ${word(a.declaration.cash_out)} · ${word(a.declaration.deposit)}` : '…'} />
          <Line label="Transactions today" value={a ? (a.today.transactions ?? '—') : '…'} />
          <Line label="Reported problems today" value={a ? a.today.reported_problems : '…'} tone={a && a.today.reported_problems > 0 ? 'text-danger' : ''} />
          <MaskedValue agentRef={req.agent_ref} field="float" label="Float position" />
        </Section>

        {req.state === 'pending' && may && (
          <>
            <FinderCta onClick={() => decide('approved')} disabled={busy}>
              Approve
            </FinderCta>
            <PillButton className="h-[2.9rem]" onClick={() => toast.show(`Contact ${req.agent_name} — logged`)} disabled={busy}>
              Contact agent first
            </PillButton>
            <PillButton tone="danger" className="h-[2.9rem]" onClick={() => setDeclining(true)} disabled={busy}>
              Decline
            </PillButton>
            <p className="text-center text-xs font-medium text-finder-muted">A decline needs a reason. The agent reads it in their app; no phone call is needed to find out what happened.</p>
          </>
        )}
        {req.state === 'pending' && !may && <p className="text-center text-sm font-semibold text-finder-muted">You can see this request but not decide it.</p>}
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </div>

      <FinderSheet open={declining} onClose={() => setDeclining(false)} title="Decline this request">
        <p className="text-sm font-medium text-finder-muted">Write it as you would say it to them. They will see these exact words.</p>
        <FieldLabel htmlFor="decline-reason">Your reason</FieldLabel>
        <TextField id="decline-reason" value={reason} onChange={(e) => setReason(e.target.value.slice(0, 160))} placeholder="Too close to your last top-up — call me" />
        <PillButton tone="danger" className="h-[2.9rem]" onClick={() => decide('declined')} disabled={busy || !reason.trim()}>
          Decline with this reason
        </PillButton>
        <button type="button" onClick={() => setDeclining(false)} className="h-control text-base font-bold text-finder-link">
          Cancel
        </button>
      </FinderSheet>
    </div>
  )
}
