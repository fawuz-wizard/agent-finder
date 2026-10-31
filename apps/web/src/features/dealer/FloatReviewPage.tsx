import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { CAPACITY_RANGES, PERMISSIONS, PRESENCE_LABELS } from '@/types/operator'
import type { DealerAgentDetail, FloatRequest } from '@/types/operator'
import { formatSle } from '@/features/agent/money'
import { FinderHeader, FinderSheet } from '@/features/end-user/components/finder'
import { FieldLabel, TextField } from '@/features/agent/components/agentChrome'
import { Line, PillButton } from './components/dealerChrome'
import { Info } from 'lucide-react'
import { Pill, RowAvatar, ScreenTitle } from './components/designKit'
import { CARD, OUTLINE, PAGE, SOLID } from './components/designClasses'
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

  const open = req.state === 'pending' || req.state === 'approved'
  return (
    <div className={PAGE}>
      <ScreenTitle title="Float request" back="/dealer/float" />

      <section className={`${CARD} flex flex-col gap-3.5 p-[18px]`}>
        <div className="flex items-center gap-3">
          <RowAvatar name={req.agent_name} index={1} />
          <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <span className="text-[15px] font-bold leading-tight">{req.agent_name}</span>
            <span className="text-[12.5px] text-finder-muted">
              {req.agent_ref.replace(/^Agent /, 'Code ')} · requested {new Date(req.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <Pill tone={req.state === 'pending' ? 'warn' : req.state === 'declined' ? 'bad' : 'good'}>{req.state === 'pending' ? `Waiting ${req.waiting_text}` : req.state === 'approved' ? 'Approved · not sent yet' : `Already ${req.state}`}</Pill>
          </span>
        </div>
        <div className="py-1 text-center">
          <p className="text-[13px] text-finder-muted">Amount requested</p>
          <p className="text-[36px] font-extrabold leading-tight tracking-[-0.02em]">{formatSle(req.amount_sle)}</p>
        </div>
        <p className="flex gap-2.5 rounded-[14px] bg-finder-tile px-3.5 py-3 text-[13px] leading-snug">
          <Info size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-finder-link" aria-hidden />
          <span>
            “{req.reason}” <span className="text-finder-muted">· the agent's reason</span>
          </span>
        </p>
        {!open && req.decision_reason && <p className="text-[13px] text-finder-muted">“{req.decision_reason}”</p>}
      </section>

      <section className={`${CARD} px-[18px] py-1`} aria-label="What the app knows">
        <h2 className="pb-1 pt-3 text-sm font-extrabold">What the app knows</h2>
        <Line label="Declared now" value={a ? `${PRESENCE_LABELS[a.declaration.presence].split(' ·')[0]} · ${word(a.declaration.cash_out)} · ${word(a.declaration.deposit)}` : '…'} />
        <Line label="Transactions today" value={a ? (a.today.transactions ?? '—') : '…'} />
        <Line label="Reported problems today" value={a ? a.today.reported_problems : '…'} tone={a && a.today.reported_problems > 0 ? 'text-danger' : ''} />
        <MaskedValue agentRef={req.agent_ref} field="float" label="Float position" />
      </section>

      {open && may && (
        <div className="mt-auto flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-3">
            {req.state === 'pending' ? (
              <button type="button" className={`${OUTLINE} text-[15px]`} onClick={() => setDeclining(true)} disabled={busy}>
                Decline
              </button>
            ) : (
              <span />
            )}
            <Link to={`/dealer/float/send?request=${encodeURIComponent(req.id)}`} className={`${SOLID} text-[15px]`}>
              {req.state === 'pending' ? 'Approve & send' : 'Send now'}
            </Link>
          </div>
          {req.state === 'pending' && (
            <button type="button" onClick={() => decide('approved')} disabled={busy} className="h-control text-sm font-bold text-finder-link">
              Approve
            </button>
          )}
          <p className="text-center text-xs text-finder-muted">Approve now and send later, or Approve &amp; send records the Orange Money transfer at once. A decline needs a reason the agent reads.</p>
        </div>
      )}
      {open && !may && <p className="text-center text-sm font-semibold text-finder-muted">You can see this request but not decide it.</p>}
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}

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
