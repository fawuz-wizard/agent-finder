import { useId, useState } from 'react'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentHome, FloatRequest } from '@/types/operator'
import { AgentTitle } from './components/agentKit'
import { BOX, FIELD, PRIMARY } from './components/agentClasses'
import { formatSle } from './money'

function newToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const STEPS: { state: FloatRequest['state']; label: string }[] = [
  { state: 'pending', label: 'Waiting for your aggregator' },
  { state: 'approved', label: 'Approved' },
  { state: 'completed', label: 'Completed' },
]
const STATE_TEXT: Record<FloatRequest['state'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
}

function Progress({ request }: { request: FloatRequest }) {
  const order = ['pending', 'approved', 'completed']
  const current = order.indexOf(request.state)
  return (
    <ol className="mt-1 flex flex-col gap-1.5">
      <li className="flex items-center gap-2 text-sm font-bold text-agent-green">
        <span className="h-3 w-3 rounded-full bg-agent-green" />
        Requested · {new Date(request.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </li>
      {STEPS.map((s, i) => {
        const done = current > i
        const now = current === i
        return (
          <li key={s.state} className={`flex items-center gap-2 text-sm font-bold ${done ? 'text-agent-green' : now ? 'text-finder-link' : 'text-finder-muted'}`}>
            <span className={`h-3 w-3 rounded-full ${done ? 'bg-agent-green' : now ? 'bg-finder-accent' : 'bg-agent-field-line'}`} />
            {s.label}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Request Float, as the approved agent design's screen 12: the amount with its commas, an
 * optional reason, Submit, and "Request Sent ✓" in green once the aggregator has it. One
 * request at a time: while one is open its progress shows in place of the form. Then what
 * came before, with the aggregator's reply.
 */
export default function FloatPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const home = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])
  const list = useAsync<FloatRequest[]>((s) => operatorApi.floatRequests(ref, s), [ref])
  const ids = useId()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tok, setTok] = useState(newToken)

  const requests = list.data ?? []
  const pending = requests.find((r) => r.state === 'pending' || r.state === 'approved')
  const digits = amount.replace(/\D/g, '')

  async function submit() {
    const value = Number(digits)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter the amount you need.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await operatorApi.requestFloat(ref, value, reason.trim() || 'No reason given', tok)
      setTok(newToken())
      setAmount('')
      setReason('')
      setSent(true)
      list.refresh()
      home.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the request.')
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id: string) {
    setBusy(true)
    try {
      await operatorApi.moveFloat(id, 'cancelled', ref, null)
      setSent(false)
      list.refresh()
      home.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <AgentTitle title="Request Float" />
      <div className="flex flex-1 flex-col gap-2.5 px-[18px] pb-8 pt-8">
        {sent && pending && (
          <p role="status" className="flex h-14 items-center justify-center rounded-[14px] bg-agent-green text-[15px] font-bold text-white">
            Request Sent ✓
          </p>
        )}
        {pending ? (
          <section className={`${BOX} flex flex-col gap-2 px-4 py-4`}>
            <span className="w-fit rounded-pill bg-finder-limited-tint px-3 py-1 text-xs font-bold text-finder-limited">
              {STATE_TEXT[pending.state]} · waiting {pending.waiting_text}
            </span>
            <p className="text-[19px] font-extrabold">{formatSle(pending.amount_sle)}</p>
            <Progress request={pending} />
            <p className="text-sm font-medium text-finder-muted">Reason you gave: “{pending.reason}”</p>
            {pending.state === 'pending' && (
              <button type="button" disabled={busy} onClick={() => void cancel(pending.id)} className="h-control self-start text-sm font-bold text-finder-link">
                Cancel request ›
              </button>
            )}
          </section>
        ) : (
          <>
            <label htmlFor={`${ids}-amount`} className="text-sm font-semibold">
              Amount
            </label>
            <div className={FIELD}>
              <span className="text-[17px] font-semibold">SLE</span>
              <input
                id={`${ids}-amount`}
                value={digits ? Number(digits).toLocaleString('en-US') : ''}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                className="h-full min-w-0 flex-1 bg-transparent text-[19px] font-extrabold text-finder-ink outline-none placeholder:text-finder-muted"
              />
            </div>
            <label htmlFor={`${ids}-reason`} className="mt-[18px] text-sm font-semibold">
              Reason <span className="font-medium text-finder-muted">(optional)</span>
            </label>
            <textarea
              id={`${ids}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 120))}
              placeholder="e.g. For better service"
              className="h-24 resize-none rounded-[14px] border-[1.5px] border-agent-field-line bg-finder-card px-4 py-3.5 text-sm text-finder-ink outline-none placeholder:text-finder-muted focus:border-finder-accent"
            />
            {error && (
              <p role="alert" className="text-sm font-semibold text-danger">
                {error}
              </p>
            )}
            <button type="button" onClick={() => void submit()} disabled={busy} className={`${PRIMARY} mt-5`}>
              {busy ? 'Sending…' : 'Submit Request'}
            </button>
          </>
        )}

        <p className="mt-auto pt-8 text-center text-xs leading-relaxed text-finder-muted">
          Your request will be reviewed
          <br />
          by your aggregator.
        </p>
      </div>
    </div>
  )
}
