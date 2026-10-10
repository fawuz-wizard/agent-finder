import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { TRANSACTION_BANDS } from '@/types/operator'
import type { AgentHome, FloatRequest, TransactionBand } from '@/types/operator'
import { FinderBox, FinderCta } from '@/features/end-user/components/finder'
import { Label, Panel, Title } from './components/agentChrome'
import { OperatorValueRow } from './components/OperatorValue'
import { formatSle } from './money'

function newToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
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
    <ol className="mt-2 flex flex-col gap-1.5">
      <li className="flex items-center gap-2 text-sm font-bold text-finder-likely">
        <span className="h-3 w-3 rounded-full bg-finder-likely" />
        Requested · {new Date(request.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </li>
      {STEPS.map((s, i) => {
        const done = current > i
        const now = current === i
        return (
          <li key={s.state} className={`flex items-center gap-2 text-sm font-bold ${done ? 'text-finder-likely' : now ? 'text-finder-link' : 'text-finder-muted'}`}>
            <span className={`h-3 w-3 rounded-full ${done ? 'bg-finder-likely' : now ? 'bg-finder-link' : 'bg-finder-line'}`} />
            {s.label}
          </li>
        )
      })}
    </ol>
  )
}

const fieldClass = 'h-[52px] w-full rounded-field bg-finder-bg px-4 text-white shadow-inset-finder outline-none placeholder:text-finder-muted/60 focus:outline focus:outline-2 focus:outline-finder-link'

/**
 * Services: what the agent does in the app. Record a transaction (two taps, a band, never
 * the amount) for the stakeholders' log; ask the aggregator for float and follow the
 * request; pin the shop while it is not on the map yet.
 */
export default function ServicesPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const home = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])
  const list = useAsync<FloatRequest[]>((s) => operatorApi.floatRequests(ref, s), [ref])
  const toast = useToast()

  // Transaction: the side, then an amount band. One token per attempt, so a retry after a
  // timeout cannot log the same transaction twice.
  const [side, setSide] = useState<'cash_out' | 'deposit' | null>(null)
  const [logging, setLogging] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [token, setToken] = useState(newToken)

  // Float request form.
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tok, setTok] = useState(newToken)

  const requests = list.data ?? []
  const pending = requests.find((r) => r.state === 'pending' || r.state === 'approved')
  const history = requests.filter((r) => r !== pending)

  async function logBand(band: TransactionBand) {
    if (!side || logging) return
    setLogging(true)
    setLogError(null)
    try {
      const out = await operatorApi.logTransaction(ref, side, band, token)
      setToken(newToken())
      setSide(null)
      toast.show(`Logged · ${out.text}`)
      home.refresh()
    } catch (e) {
      setLogError(e instanceof Error ? e.message : 'Could not log that.')
    } finally {
      setLogging(false)
    }
  }

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

  const unlocated = home.data?.customers_see.state === 'unlocated'

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pb-8 pt-2 text-white">
      <Title sub="What you do here">Services</Title>

      {unlocated && (
        <Panel className="border-l-4 border-warning">
          <p className="text-base font-bold">Your shop is not on the map yet</p>
          <p className="text-sm font-medium text-finder-muted">Customers cannot find you until it is. Stand inside the shop and pin it.</p>
          <Link to="/agent/profile" className="inline-flex h-chip w-fit items-center rounded-pill bg-finder-link px-5 text-base font-bold text-finder-on-orange">
            Pin my shop
          </Link>
        </Panel>
      )}

      <Panel aria-labelledby="log-tx">
        <div className="flex items-baseline justify-between gap-3">
          <Label id="log-tx">Record a transaction</Label>
          <span className="text-xs font-semibold text-finder-muted">Logged today: {home.data?.today.logged ?? 0}</span>
        </div>
        <p className="text-sm font-medium text-finder-muted">Two taps after you serve someone. The amount is never sent, only a band.</p>
        <div role="radiogroup" aria-label="What did you just do?" className="mt-1 flex gap-3">
          {(
            [
              ['cash_out', 'Cash out'],
              ['deposit', 'Deposit'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={side === value}
              onClick={() => setSide(value)}
              className={`h-[50px] flex-1 rounded-pill text-base font-bold transition-colors ${side === value ? 'bg-finder-link text-finder-on-orange' : 'border-2 border-white text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {side && (
          <div role="group" aria-label="How much, roughly? (SLE)" className="mt-1 grid grid-cols-2 gap-2">
            {TRANSACTION_BANDS.map((b) => (
              <button
                key={b.band}
                type="button"
                onClick={() => void logBand(b.band)}
                disabled={logging}
                className="h-chip whitespace-nowrap rounded-pill border-2 border-white/60 px-2 text-sm font-bold text-white disabled:opacity-45"
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
        {logError && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {logError}
          </p>
        )}
      </Panel>

      <Panel aria-labelledby="float">
        <Label id="float">Float</Label>
        <OperatorValueRow label="Your position" value={home.data?.float_position ?? null} big />
        {pending && (
          <FinderBox className="mt-1 flex flex-col gap-1 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-finder-muted">Request in progress</span>
              <span className="rounded-tag bg-finder-limited-tint px-3 py-1 text-xs font-bold text-finder-limited">
                {STATE_TEXT[pending.state]} · waiting {pending.waiting_text}
              </span>
            </div>
            <p className="text-2xl font-bold">{formatSle(pending.amount_sle)}</p>
            <Progress request={pending} />
            <p className="mt-2 text-sm font-medium text-finder-muted">Reason you gave: “{pending.reason}”</p>
            {pending.state === 'pending' && (
              <button type="button" disabled={busy} onClick={() => cancel(pending.id)} className="h-control self-start text-base font-bold text-finder-link">
                Cancel request
              </button>
            )}
          </FinderBox>
        )}
        {!pending &&
          (open ? (
            <div className="mt-1 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[15px] font-medium">Amount (SLE)</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))} inputMode="numeric" className={`${fieldClass} text-2xl font-bold`} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[15px] font-medium">Reason</span>
                <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 120))} placeholder="Customer demand is high this morning" className={`${fieldClass} text-base font-medium`} />
              </label>
              {error && (
                <p role="alert" className="text-sm font-semibold text-danger">
                  {error}
                </p>
              )}
              <FinderCta onClick={submit} disabled={busy}>
                {busy ? 'Sending…' : 'Submit request'}
              </FinderCta>
            </div>
          ) : (
            <FinderCta className="mt-1" onClick={() => setOpen(true)}>
              Request float
            </FinderCta>
          ))}
        <Label>Recent requests</Label>
        {history.length === 0 && <p className="text-sm font-medium text-finder-muted">Nothing yet.</p>}
        {history.map((r) => (
          <div key={r.id} className="border-b border-finder-line py-2 last:border-b-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-finder-muted">
                {new Date(r.requested_at).toLocaleDateString([], { day: 'numeric', month: 'short' })} · {formatSle(r.amount_sle)}
              </span>
              <span className={`rounded-tag px-3 py-1 text-xs font-bold ${r.state === 'declined' ? 'bg-danger-tint text-danger' : r.state === 'cancelled' ? 'bg-finder-line text-finder-muted' : 'bg-finder-likely-tint text-finder-likely'}`}>
                {STATE_TEXT[r.state]}
              </span>
            </div>
            {r.decision_reason && <p className="mt-1 text-sm font-medium text-finder-muted">“{r.decision_reason}”</p>}
          </div>
        ))}
      </Panel>
    </div>
  )
}
