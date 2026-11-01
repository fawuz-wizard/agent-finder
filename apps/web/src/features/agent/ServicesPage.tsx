import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Check, Delete, Phone } from 'lucide-react'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentHome, LoggedTransaction } from '@/types/operator'
import { AgentTitle } from './components/agentKit'
import { BOX, FIELD, OUTLINE, PRIMARY, chip } from './components/agentClasses'
import { commissionFor } from './commission'
import { formatSle } from './money'
import { floatRowText } from './floatRow'
import { CHECK_IN_NOW } from './shopPresence'

type Side = 'deposit' | 'cash_out'
type Step = 'customer' | 'amount' | 'confirm' | 'done'
const QUICK = [1_000, 5_000, 10_000, 20_000]
const TITLE: Record<Side, string> = { deposit: 'Cash In', cash_out: 'Cash Out' }
const TYPE: Record<Side, string> = { deposit: 'Deposit', cash_out: 'Withdrawal' }
// A cash in asks for the customer first, as Orange's own flow does; a cash out does not.
const STEPS: Record<Side, Step[]> = { deposit: ['customer', 'amount', 'confirm', 'done'], cash_out: ['amount', 'confirm', 'done'] }

function newToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** "+232 •• ••• 456": what the app ever shows of a customer's number once it is recorded. */
function masked(digits: string): string {
  return `+232 •• ••• ${digits.slice(-3)}`
}

/** "76 123 456", as the agent typed it, only on the screens before it is recorded. */
function spaced(digits: string): string {
  return digits.replace(/(\d{2})(\d{3})(\d{0,3})/, '$1 $2 $3').trim()
}

/** Our own record number, short enough to read out: never an Orange reference. */
function recordNo(id: string): string {
  return `AF-${id.replace(/[^0-9a-f]/gi, '').slice(-6).toUpperCase()}`
}

function Header({ side, step, onBack }: { side: Side; step: Step; onBack: () => void }) {
  const steps = STEPS[side]
  const n = steps.indexOf(step) + 1
  return (
    <>
      <div className="flex items-center gap-[18px] px-[22px] pb-1 pt-7">
        <button type="button" aria-label="Back" onClick={onBack} className="-m-2 flex h-10 w-10 shrink-0 items-center justify-center">
          <ArrowLeft size={22} strokeWidth={2} aria-hidden />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[19px] font-bold">{TITLE[side]}</h1>
        <span className="text-xs font-bold text-finder-muted">
          Step {n} of {steps.length}
        </span>
      </div>
      <div className="flex gap-1.5 px-[22px] pb-2 pt-3" aria-hidden>
        {steps.map((s, k) => (
          <span key={s} className={`h-1 flex-1 rounded-full ${k < n ? 'bg-finder-accent' : 'bg-finder-line'}`} />
        ))}
      </div>
    </>
  )
}

function Row({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-finder-muted">{label}</span>
      <b className={`text-right font-bold ${tone}`}>{value}</b>
    </div>
  )
}

/**
 * Do Transaction, the new design's screens 15–18: for a cash in, the customer's number, the
 * amount, a confirmation with the agent's PIN on a keypad, and the result; a cash out skips the
 * number. It records what the agent did in Orange Money and moves no money. Where the design
 * shows what Agent Finder cannot know or must not show, the same slot carries the truth: the
 * number instead of the customer's name, the float request's state instead of a balance, "recorded"
 * and our own record number instead of "sent to the wallet" and an Orange reference. The PIN is
 * checked by the server (with the sign-in lockout) before the record is made; PINs are 4 to 6
 * digits, so Record confirms rather than the fourth digit. One token per
 * attempt, so a retry after a timeout cannot record the same transaction twice.
 */
export default function ServicesPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const home = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])
  const navigate = useNavigate()
  const ids = useId()
  const [side, setSide] = useState<Side | null>(null)
  const [step, setStep] = useState<Step>('customer')
  const [txAmount, setTxAmount] = useState('')
  const [customer, setCustomer] = useState('')
  const [pin, setPin] = useState('')
  const [logging, setLogging] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [token, setToken] = useState(newToken)
  const [done, setDone] = useState<LoggedTransaction | null>(null)

  const amount = Number(txAmount)
  const digits = customer.replace(/\D/g, '').replace(/^232/, '').replace(/^0/, '')
  const amountOk = Number.isFinite(amount) && amount > 0
  const numberOk = digits.length === 8
  const commission = side && amountOk ? commissionFor(side, amount) : 0
  const float = floatRowText(home.data?.latest_float ?? null)

  function start(s: Side) {
    setSide(s)
    setStep(STEPS[s][0]!)
    setLogError(null)
  }

  function go(s: Step) {
    setLogError(null)
    setPin('')
    setStep(s)
  }

  function back() {
    if (!side) return
    const k = STEPS[side].indexOf(step)
    if (k <= 0) setSide(null)
    else go(STEPS[side][k - 1]!)
  }

  function again() {
    setToken(newToken())
    setTxAmount('')
    setCustomer('')
    setPin('')
    setDone(null)
    setSide(null)
  }

  function press(key: string) {
    if (logging) return
    setPin((p) => (key === 'del' ? p.slice(0, -1) : (p + key).slice(0, 6)))
    setLogError(null)
  }

  async function record() {
    if (logging || !side || pin.length < 4) return
    setLogging(true)
    try {
      await operatorApi.checkPin(ref, pin)
      const out = await operatorApi.logTransaction(ref, {
        transaction: side,
        amount_sle: amount,
        ...(side === 'deposit' ? { customer_msisdn: digits } : {}),
        client_token: token,
      })
      setDone(out)
      setStep('done')
      // Recording counts as a check-in when the phone is at the shop.
      window.dispatchEvent(new Event(CHECK_IN_NOW))
      home.refresh()
    } catch (e) {
      setLogError(e instanceof Error ? e.message : 'Could not record that.')
      setPin('')
    } finally {
      setLogging(false)
    }
  }

  const error = logError && (
    <p role="alert" className="text-center text-sm font-semibold text-danger">
      {logError}
    </p>
  )
  const page = 'flex flex-1 flex-col text-finder-ink'
  const content = 'flex flex-1 flex-col gap-3 px-[18px] pb-6 pt-4'

  // Which side: "Do Transaction" opens here.
  if (!side) {
    const unlocated = home.data?.customers_see.state === 'unlocated'
    return (
      <div className={page}>
        <AgentTitle title="Do Transaction" />
        <div className="flex flex-1 flex-col gap-3 px-[18px] pb-8 pt-6">
          {unlocated && (
            <section className={`${BOX} mb-2 flex flex-col gap-2 border-finder-accent px-4 py-4`}>
              <p className="text-base font-bold leading-tight">Your shop is not on the map yet</p>
              <p className="text-sm text-finder-muted">Customers cannot find you until it is. Stand inside the shop and pin it.</p>
              <Link to="/agent/shop" className={`${PRIMARY} h-12 w-fit px-5`}>
                Pin my shop
              </Link>
            </section>
          )}
          <h2 className="text-[17px] font-bold">What did you just do?</h2>
          <p className="text-sm text-finder-muted">
            After you serve someone in Orange Money, record it here. <span className="font-bold text-finder-ink">Logged today: {home.data?.today.logged ?? 0}</span>
          </p>
          <div role="radiogroup" aria-label="What did you just do?" className="mt-1 grid grid-cols-2 gap-3">
            {(
              [
                ['deposit', 'Cash in', ArrowDownToLine, 'Customer gives cash'],
                ['cash_out', 'Cash out', ArrowUpFromLine, 'You hand over cash'],
              ] as const
            ).map(([value, label, Icon, sub]) => (
              <button key={value} type="button" role="radio" aria-checked={false} aria-label={label} onClick={() => start(value)} className="flex h-[118px] flex-col items-center justify-center gap-2 rounded-[14px] bg-finder-tile text-center transition-transform duration-150 active:scale-[0.97] active:bg-agent-tile-press">
                <Icon size={24} strokeWidth={2} className="text-finder-link" aria-hidden />
                <span className="text-[15px] font-bold">{label}</span>
                <span className="text-xs text-finder-muted">{sub}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // 15 · The customer's number.
  if (step === 'customer') {
    return (
      <div className={page}>
        <Header side={side} step={step} onBack={back} />
        <div className={content}>
          <label htmlFor={`${ids}-customer`} className="text-sm font-bold">
            Customer phone number
          </label>
          <div className={`${FIELD} border-finder-accent`}>
            <span className="border-r border-agent-field-line pr-3 text-[15px] font-bold">+232</span>
            <input id={`${ids}-customer`} value={customer} onChange={(e) => setCustomer(e.target.value.replace(/[^\d ]/g, '').slice(0, 12))} inputMode="tel" autoComplete="off" placeholder="76 123 456" className="h-full min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:font-normal placeholder:text-finder-muted" />
          </div>
          {numberOk && (
            <div className="mt-2 flex items-center gap-3 rounded-[14px] border border-agent-open-line bg-agent-green-tint px-4 py-3.5">
              <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-agent-avatar text-agent-avatar-ink">
                <Phone size={18} strokeWidth={2.2} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="text-[15px]">+232 {spaced(digits)}</b>
                <span className="text-xs text-agent-open-sub">Orange Money number</span>
              </span>
              <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-agent-green text-white">
                <Check size={14} strokeWidth={3} />
              </span>
            </div>
          )}
          <p className="text-xs text-finder-muted">Check this number with the customer before continuing. Only its last three digits are kept.</p>
          {error}
          <button type="button" className={`${PRIMARY} mt-auto`} onClick={() => go('amount')} disabled={!numberOk}>
            Continue
          </button>
        </div>
      </div>
    )
  }

  // 16 · The amount.
  if (step === 'amount') {
    return (
      <div className={page}>
        <Header side={side} step={step} onBack={back} />
        <div className={content}>
          {side === 'deposit' && (
            <p className="flex items-center gap-2 text-[13px] text-finder-muted">
              <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-agent-avatar text-agent-avatar-ink">
                <Phone size={12} strokeWidth={2.4} />
              </span>
              +232 {spaced(digits)}
            </p>
          )}
          <label htmlFor={`${ids}-tx-amount`} className="flex flex-col items-center gap-1 rounded-[14px] border-[1.5px] border-finder-accent bg-finder-card px-4 py-5">
            <span className="text-xs text-finder-muted">Amount</span>
            <span className="flex items-baseline justify-center gap-1.5">
              <span className="text-base font-bold">SLE</span>
              <input id={`${ids}-tx-amount`} aria-label="Amount (SLE)" value={txAmount ? Number(txAmount).toLocaleString('en-US') : ''} onChange={(e) => setTxAmount(e.target.value.replace(/\D/g, '').slice(0, 7))} inputMode="numeric" autoComplete="off" placeholder="0" className="w-[7ch] bg-transparent text-center text-[32px] font-extrabold outline-none placeholder:text-finder-muted" />
            </span>
          </label>
          <div role="group" aria-label="Quick amounts" className="grid grid-cols-4 gap-2">
            {QUICK.map((q) => (
              <button key={q} type="button" aria-pressed={amount === q} onClick={() => setTxAmount(String(q))} className={`${chip(amount === q)} h-10 justify-center px-0 text-[13px]`}>
                {q.toLocaleString('en-US')}
              </button>
            ))}
          </div>
          <div className={`${BOX} px-4 py-2`}>
            <Row label="Your commission" value={amountOk ? formatSle(commission) : '—'} tone="text-agent-green-ink" />
            <div className="border-t border-finder-card-line">
              <Row label={side === 'deposit' ? 'Collect in cash' : 'Hand over in cash'} value={amountOk ? formatSle(amount) : '—'} />
            </div>
          </div>
          <p className="text-xs text-finder-muted">
            Float request: <b className="text-finder-ink">{float === 'Request float' ? 'none waiting' : float}</b> · Commission on the indicative tariff.
          </p>
          {error}
          <button type="button" className={`${PRIMARY} mt-auto`} onClick={() => go('confirm')} disabled={!amountOk}>
            Continue
          </button>
        </div>
      </div>
    )
  }

  // 17 · Confirm and PIN.
  if (step === 'confirm') {
    return (
      <div className={page}>
        <Header side={side} step={step} onBack={back} />
        <div className={content}>
          <div className={`${BOX} px-4 py-2`} aria-label="Check">
            <Row label="Type" value={TYPE[side]} />
            {side === 'deposit' && <Row label="Number" value={`+232 ${spaced(digits)}`} />}
            <Row label="Amount" value={formatSle(amount)} />
            <div className="border-t border-finder-card-line">
              <Row label={side === 'deposit' ? 'From your float' : 'From your cash'} value={formatSle(amount)} />
            </div>
          </div>
          <p className="mt-3 text-center text-sm font-bold">Enter your PIN</p>
          <div aria-hidden className="flex justify-center gap-3.5">
            {Array.from({ length: Math.max(4, pin.length) }, (_, k) => k).map((k) => (
              <span key={k} className={`h-3.5 w-3.5 rounded-full border-[1.5px] ${k < pin.length ? 'border-finder-ink bg-finder-ink' : 'border-finder-muted'}`} />
            ))}
          </div>
          <p className="sr-only" role="status">
            {logging ? 'Checking your PIN' : `${pin.length} digits entered`}
          </p>
          {error}
          <button type="button" className={`${PRIMARY} mt-auto`} onClick={() => void record()} disabled={pin.length < 4 || logging}>
            {logging ? 'Checking…' : 'Record'}
          </button>
          <div role="group" aria-label="PIN keypad" className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k) =>
              k === '' ? (
                <span key="blank" />
              ) : (
                <button key={k} type="button" disabled={logging} onClick={() => press(k)} aria-label={k === 'del' ? 'Delete' : k} className="flex h-[52px] items-center justify-center rounded-[12px] border border-finder-card-line bg-finder-card text-xl font-bold transition-transform duration-100 active:scale-[0.96] disabled:opacity-50">
                  {k === 'del' ? <Delete size={22} strokeWidth={2} aria-hidden /> : k}
                </button>
              ),
            )}
          </div>
        </div>
      </div>
    )
  }

  // 18 · Recorded.
  const share = async () => {
    if (!done) return
    const text = `Agent Finder record ${recordNo(done.id)}: ${TYPE[side]} ${formatSle(amount)}${side === 'deposit' ? ` for ${masked(digits)}` : ''}, ${new Date(done.at).toLocaleString('en-GB')}. Not an Orange Money receipt.`
    try {
      if (navigator.share) await navigator.share({ text })
      else await navigator.clipboard.writeText(text)
    } catch {
      // The agent closed the share sheet: nothing to do.
    }
  }
  return (
    <div className={page}>
      <Header side={side} step="done" onBack={again} />
      <div className="flex flex-1 flex-col gap-3.5 px-[18px] pb-6 pt-4">
        <span aria-hidden className="mx-auto mt-2 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-agent-green-tint">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-agent-green text-white">
            <Check size={26} strokeWidth={3} />
          </span>
        </span>
        <h2 role="status" className="text-center text-xl font-extrabold">
          {TYPE[side]} recorded
        </h2>
        <p className="-mt-2 text-center text-sm text-finder-muted">
          {formatSle(amount)} {side === 'deposit' ? `for ${masked(digits)}` : 'cash out'}, in your history.
        </p>
        {done && (
          <div className={`${BOX} px-4 py-2`}>
            {side === 'deposit' && <Row label="Number" value={masked(digits)} />}
            <Row label="Amount" value={formatSle(amount)} />
            <Row label="Your commission" value={formatSle(done.commission_sle)} tone="text-agent-green-ink" />
            <Row label="Record" value={recordNo(done.id)} />
            <Row label="Date" value={new Date(done.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
          </div>
        )}
        <div className="mt-auto flex flex-col gap-3">
          <button type="button" className={OUTLINE} onClick={() => void share()}>
            Share Receipt
          </button>
          <button type="button" className={PRIMARY} onClick={again}>
            New Transaction
          </button>
          <button type="button" className="h-11 text-sm font-bold" onClick={() => navigate('/agent')}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  )
}
