import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { TRANSACTION_BANDS } from '@/types/operator'
import type { AgentHome, FloatRequest, TransactionBand } from '@/types/operator'
import { FinderBox, FinderCta, FinderHeader } from '@/features/end-user/components/finder'
import { EdgeCard, FieldLabel, MoneyField, PILL_OFF, PILL_ON, SectionLabel, TextField } from './components/agentChrome'
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
    <ol className="mt-1 flex flex-col gap-1.5">
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

/**
 * Services: what the agent does in the app, laid out like the finder's first screen. One
 * question with two pills, the bands as quick amounts; then Float: your position, the
 * request you are waiting on, the form, and what came before.
 */
export default function ServicesPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const home = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])
  const list = useAsync<FloatRequest[]>((s) => operatorApi.floatRequests(ref, s), [ref])
  const toast = useToast()
  const ids = useId()

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
  const position = home.data?.float_position ?? null

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
    <div className="flex flex-1 flex-col px-5 pb-8 text-white">
      <FinderHeader title="Services" />

      {unlocated && (
        <EdgeCard className="mt-6">
          <p className="text-md font-bold leading-tight">Your shop is not on the map yet</p>
          <p className="text-sm font-medium text-finder-muted">Customers cannot find you until it is. Stand inside the shop and pin it.</p>
          <Link to="/agent/profile" className={`inline-flex h-chip w-fit items-center rounded-pill px-5 text-base font-bold ${PILL_ON}`}>
            Pin my shop
          </Link>
        </EdgeCard>
      )}

      <h1 className="mt-6 text-xl font-bold leading-tight">What did you just do?</h1>
      <p className="mt-1 text-sm font-medium text-finder-muted">
        Two taps after you serve someone. The amount is never sent, only a band. <span className="font-bold text-white">Logged today: {home.data?.today.logged ?? 0}</span>
      </p>
      <div role="radiogroup" aria-label="What did you just do?" className="mt-5 flex gap-10">
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
            className={`h-[50px] w-[117px] rounded-pill text-base font-bold transition-colors ${side === value ? PILL_ON : PILL_OFF}`}
          >
            {label}
          </button>
        ))}
      </div>
      {side && (
        <>
          <p className="mt-4 text-[15px] font-medium">How much, roughly? (SLE)</p>
          <div role="group" aria-label="How much, roughly? (SLE)" className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
            {TRANSACTION_BANDS.map((b) => (
              <button
                key={b.band}
                type="button"
                onClick={() => void logBand(b.band)}
                disabled={logging}
                className="h-chip shrink-0 whitespace-nowrap rounded-pill border-2 border-white/60 px-4 text-base font-bold text-white disabled:opacity-45"
              >
                {b.label}
              </button>
            ))}
          </div>
        </>
      )}
      {logError && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {logError}
        </p>
      )}

      <SectionLabel className="mt-8">Float</SectionLabel>
      <FinderBox className="mt-3 flex min-h-[60px] items-center justify-between gap-3 px-5 py-2">
        <span className="text-base font-bold">Your position</span>
        {position ? (
          <span className="text-right">
            <span className="block text-md font-bold">{formatSle(position.amount_sle)}</span>
            <span className="block text-xs font-semibold text-finder-muted">
              from {position.source} · {new Date(position.read_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
        ) : (
          <span className="text-base font-bold text-finder-muted">Not connected</span>
        )}
      </FinderBox>

      {pending && (
        <EdgeCard className="mt-3">
          <span className="w-fit rounded-tag bg-finder-limited-tint px-3 py-1 text-xs font-bold text-finder-limited">
            {STATE_TEXT[pending.state]} · waiting {pending.waiting_text}
          </span>
          <p className="text-md font-bold leading-tight">{formatSle(pending.amount_sle)}</p>
          <Progress request={pending} />
          <p className="text-sm font-medium text-finder-muted">Reason you gave: “{pending.reason}”</p>
          {pending.state === 'pending' && (
            <button type="button" disabled={busy} onClick={() => cancel(pending.id)} className="h-control self-start text-base font-bold text-finder-link">
              Cancel request ›
            </button>
          )}
        </EdgeCard>
      )}

      {!pending &&
        (open ? (
          <div className="mt-4 flex flex-col gap-3">
            <FieldLabel htmlFor={`${ids}-amount`}>Amount (SLE)</FieldLabel>
            <MoneyField id={`${ids}-amount`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))} />
            <FieldLabel htmlFor={`${ids}-reason`}>Reason</FieldLabel>
            <TextField id={`${ids}-reason`} value={reason} onChange={(e) => setReason(e.target.value.slice(0, 120))} placeholder="Customer demand is high this morning" />
            {error && (
              <p role="alert" className="text-sm font-semibold text-danger">
                {error}
              </p>
            )}
            <FinderCta className="mt-2" onClick={submit} disabled={busy}>
              {busy ? 'Sending…' : 'Submit request'}
            </FinderCta>
          </div>
        ) : (
          <FinderCta className="mt-4" onClick={() => setOpen(true)}>
            Request float
          </FinderCta>
        ))}

      <SectionLabel className="mt-8">Recent requests</SectionLabel>
      <div className="mt-3 flex flex-col gap-2">
        {history.length === 0 && <p className="text-sm font-medium text-finder-muted">Nothing yet.</p>}
        {history.map((r) => (
          <FinderBox key={r.id} className="flex min-h-[60px] flex-col justify-center gap-1 px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-base font-bold">
                {formatSle(r.amount_sle)} <span className="font-semibold text-finder-muted">· {new Date(r.requested_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>
              </span>
              <span className={`shrink-0 rounded-tag px-3 py-1 text-xs font-bold ${r.state === 'declined' ? 'bg-danger-tint text-danger' : r.state === 'cancelled' ? 'bg-finder-line text-finder-muted' : 'bg-finder-likely-tint text-finder-likely'}`}>
                {STATE_TEXT[r.state]}
              </span>
            </div>
            {r.decision_reason && <p className="text-sm font-medium text-finder-muted">“{r.decision_reason}”</p>}
          </FinderBox>
        ))}
      </div>
    </div>
  )
}
