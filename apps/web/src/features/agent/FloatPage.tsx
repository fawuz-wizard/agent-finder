import { useState } from 'react'
import { Button, Card } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { FloatRequest } from '@/types/operator'
import { OperatorValueRow } from './components/OperatorValue'
import { formatSle } from './money'

function newToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const STEPS: { state: FloatRequest['state']; label: string }[] = [
  { state: 'pending', label: 'Waiting for dealer' },
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
    <ol className="mt-3 flex flex-col gap-1">
      <li className="flex items-center gap-2 text-sm font-bold text-success">
        <span className="h-3 w-3 rounded-full bg-success" />
        Requested · {new Date(request.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </li>
      {STEPS.map((s, i) => {
        const done = current > i
        const now = current === i
        return (
          <li
            key={s.state}
            className={`flex items-center gap-2 text-sm font-bold ${done ? 'text-success' : now ? 'text-brand-text' : 'text-muted'}`}
          >
            <span
              className={`h-3 w-3 rounded-full ${done ? 'bg-success' : now ? 'bg-brand ring-4 ring-brand-light' : 'bg-line'}`}
            />
            {s.label}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * A3 — Float. Today this happens on WhatsApp with no record of who asked for what and
 * when. A request with a state, a reason and a history is the feature most likely to make
 * an agent open the app without being asked to.
 */
export default function FloatPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const home = useAsync((s) => operatorApi.home(ref, s), [ref])
  const list = useAsync((s) => operatorApi.floatRequests(ref, s), [ref])

  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One token per attempt: a retry after a timeout cannot create a second request.
  const [tok, setTok] = useState(newToken)

  const requests = list.data ?? []
  const pending = requests.find((r) => r.state === 'pending' || r.state === 'approved')
  const history = requests.filter((r) => r !== pending)

  async function submit() {
    const value = Number(amount)
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
      setOpen(false)
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
      list.refresh()
      home.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-paper px-4 py-3">
        <h1 className="text-lg font-bold leading-tight">Float</h1>
        <p className="text-xs text-muted">Dealer: Kissy Distribution</p>
      </header>

      <div className="flex flex-col gap-3 p-4 pb-6">
        <Card>
          <OperatorValueRow label="Your position" value={home.data?.float_position ?? null} big />
        </Card>

        {pending && (
          <Card className="border-brand-deep bg-brand-faint">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Request in progress</p>
              <span className="rounded-pill bg-warning-tint px-3 py-1 text-xs font-bold text-warning">
                {STATE_TEXT[pending.state]} · waiting {pending.waiting_text}
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold">{formatSle(pending.amount_sle)}</p>
            <Progress request={pending} />
            <p className="mt-3 text-sm text-muted">Reason you gave: “{pending.reason}”</p>
            {pending.state === 'pending' && (
              <Button
                size="control"
                variant="secondary"
                className="mt-3"
                block
                disabled={busy}
                onClick={() => cancel(pending.id)}
              >
                Cancel request
              </Button>
            )}
          </Card>
        )}

        {!pending &&
          (open ? (
            <Card>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Request float</p>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-muted">Amount (SLE)</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))}
                  inputMode="numeric"
                  className="h-cta rounded-cta border-2 border-line bg-paper px-4 text-2xl font-bold outline-none focus:border-brand-deep"
                />
              </label>
              <label className="mt-3 flex flex-col gap-1">
                <span className="text-sm font-semibold text-muted">Reason</span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, 120))}
                  placeholder="Customer demand is high this morning"
                  className="h-control rounded-card border-2 border-line bg-paper px-3 text-base outline-none focus:border-brand-deep"
                />
              </label>
              {error && (
                <p role="alert" className="mt-2 text-base font-semibold text-danger">
                  {error}
                </p>
              )}
              <Button size="cta" className="mt-3" onClick={submit} disabled={busy}>
                {busy ? 'Sending…' : 'Submit request'}
              </Button>
            </Card>
          ) : (
            <Button size="cta" onClick={() => setOpen(true)}>
              Request float
            </Button>
          ))}

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Recent requests</p>
          {history.length === 0 && <p className="py-2 text-sm text-muted">Nothing yet.</p>}
          {history.map((r) => (
            <div key={r.id} className="border-b border-line py-2 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted">
                  {new Date(r.requested_at).toLocaleDateString([], { day: 'numeric', month: 'short' })} ·{' '}
                  {formatSle(r.amount_sle)}
                </span>
                <span
                  className={`rounded-pill px-3 py-1 text-xs font-bold ${
                    r.state === 'declined'
                      ? 'bg-danger-tint text-danger'
                      : r.state === 'cancelled'
                        ? 'bg-canvas text-muted'
                        : 'bg-success-tint text-success'
                  }`}
                >
                  {STATE_TEXT[r.state]}
                </span>
              </div>
              {r.decision_reason && <p className="mt-1 text-sm text-muted">“{r.decision_reason}”</p>}
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
