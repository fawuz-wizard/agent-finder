import { useId, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Delete } from 'lucide-react'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentHome, LoggedTransaction } from '@/types/operator'
import { BOX, FIELD, OUTLINE, PRIMARY, chip } from './components/agentClasses'
import { commissionFor } from './commission'
import { formatSle } from './money'
import { CHECK_IN_NOW } from './shopPresence'

type Step = 'details' | 'pin' | 'done'
type Kind = 'deposit' | 'cash_out'
const KIND_LABEL: Record<Kind, string> = { deposit: 'Cash in', cash_out: 'Cash out' }
const QUICK = [1_000, 5_000, 10_000, 20_000]

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

function Header({ step, kind, onBack }: { step: Step; kind: Kind; onBack: () => void }) {
  const n = step === 'details' ? 1 : 2
  return (
    <>
      <div className="flex items-center gap-[18px] px-[22px] pb-1 pt-7">
        <button type="button" aria-label="Back" onClick={onBack} className="-m-2 flex h-10 w-10 shrink-0 items-center justify-center">
          <ArrowLeft size={22} strokeWidth={2} aria-hidden />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[19px] font-bold">{KIND_LABEL[kind]}</h1>
        {step !== 'done' && <span className="text-xs font-bold text-finder-muted">Step {n} of 2</span>}
      </div>
      <div className="flex gap-1.5 px-[22px] pb-2 pt-3" aria-hidden>
        {[1, 2].map((k) => (
          <span key={k} className={`h-1 flex-1 rounded-full ${k <= n ? 'bg-finder-accent' : 'bg-finder-line'}`} />
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
 * Do Transaction records a cash in or a cash out the agent has just served, so the 7-day rule
 * sees every transaction while there is no Orange feed (the pilot). A cash in: the customer
 * hands over cash and the agent sends e-money. A cash out: the customer asks for cash the usual
 * way and the agent hands it over. Both count the same for the rule. Two steps: the type, the
 * customer's number and the amount on one screen, then the agent's PIN on a keypad; then the
 * result. `?type=cash_out` opens on cash out. It
 * moves no money. The number is checked with the customer, never looked up, and only its last
 * three digits are kept; the result shows "recorded" and our own record number, never an
 * Orange reference. The PIN is checked by the server (with the sign-in lockout) before the
 * record is made; PINs are 4 to 6 digits, so Record confirms rather than the fourth digit.
 * One token per attempt, so a retry after a timeout cannot record the same cash in twice.
 */
export default function ServicesPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const home = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [kind, setKind] = useState<Kind>(params.get('type') === 'cash_out' ? 'cash_out' : 'deposit')
  const ids = useId()
  const [step, setStep] = useState<Step>('details')
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
  const commission = amountOk ? commissionFor(kind, amount) : 0

  function go(s: Step) {
    setLogError(null)
    setPin('')
    setStep(s)
  }

  function back() {
    if (step === 'pin') go('details')
    else navigate('/agent')
  }

  function again() {
    setToken(newToken())
    setTxAmount('')
    setCustomer('')
    setDone(null)
    go('details')
  }

  function press(key: string) {
    if (logging) return
    setPin((p) => (key === 'del' ? p.slice(0, -1) : (p + key).slice(0, 6)))
    setLogError(null)
  }

  async function record() {
    if (logging || pin.length < 4) return
    setLogging(true)
    try {
      await operatorApi.checkPin(ref, pin)
      const out = await operatorApi.logTransaction(ref, { transaction: kind, amount_sle: amount, customer_msisdn: digits, client_token: token })
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

  // 1 · The customer's number and the amount, on one screen.
  if (step === 'details') {
    const unlocated = home.data?.customers_see.state === 'unlocated'
    // Why Continue is grey, once they have started: the first thing still missing.
    const missing = !numberOk ? "Enter the customer's 8-digit number" : !amountOk ? 'Enter an amount' : null
    return (
      <div className={page}>
        <Header step={step} kind={kind} onBack={back} />
        <div className={content}>
          <div role="radiogroup" aria-label="Transaction" className="grid grid-cols-2 gap-2">
            {(['deposit', 'cash_out'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`${chip(kind === k)} h-12 justify-center text-[15px]`}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          {unlocated && (
            <section className={`${BOX} flex flex-col gap-2 border-finder-accent px-4 py-4`}>
              <p className="text-base font-bold leading-tight">Your shop is not on the map yet</p>
              <p className="text-sm text-finder-muted">Customers cannot find you until it is. Stand inside the shop and pin it.</p>
              <Link to="/agent/shop" className={`${PRIMARY} h-12 w-fit px-5`}>
                Pin my shop
              </Link>
            </section>
          )}
          <label htmlFor={`${ids}-customer`} className="text-sm font-bold">
            Customer phone number
          </label>
          <div className={`${FIELD} ${numberOk ? '' : 'border-finder-accent'}`}>
            <span className="border-r border-agent-field-line pr-3 text-[15px] font-bold">+232</span>
            <input id={`${ids}-customer`} value={customer} onChange={(e) => setCustomer(e.target.value.replace(/[^\d ]/g, '').slice(0, 12))} inputMode="tel" autoComplete="off" placeholder="76 123 456" className="h-full min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:font-normal placeholder:text-finder-muted" />
            {numberOk && (
              <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-agent-green-ink">
                <Check size={16} strokeWidth={3} aria-hidden />
                Orange Money number
              </span>
            )}
          </div>
          <label htmlFor={`${ids}-tx-amount`} className="mt-1 text-sm font-bold">
            Amount (SLE)
          </label>
          <div className={`${FIELD} ${numberOk && !amountOk ? 'border-finder-accent' : ''}`}>
            <span className="border-r border-agent-field-line pr-3 text-[15px] font-bold">SLE</span>
            <input id={`${ids}-tx-amount`} value={txAmount ? Number(txAmount).toLocaleString('en-US') : ''} onChange={(e) => setTxAmount(e.target.value.replace(/\D/g, '').slice(0, 7))} inputMode="numeric" autoComplete="off" placeholder="0" className="h-full min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:font-normal placeholder:text-finder-muted" />
          </div>
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
              <Row label={kind === 'deposit' ? 'Collect in cash' : 'Give in cash'} value={amountOk ? formatSle(amount) : '—'} />
            </div>
          </div>
          <p className="text-xs text-finder-muted">
            Check the number and the amount with the customer. Only the last three digits are kept. <span className="font-bold text-finder-ink">Logged today: {home.data?.today.logged ?? 0}</span>
          </p>
          {error}
          <button type="button" className={`${PRIMARY} mt-auto`} onClick={() => go('pin')} disabled={!numberOk || !amountOk}>
            Continue
          </button>
          {missing && (customer !== '' || txAmount !== '') && <p className="-mt-1 text-center text-sm text-finder-muted">{missing}</p>}
        </div>
      </div>
    )
  }

  // 2 · Check, and confirm with the agent's PIN.
  if (step === 'pin') {
    return (
      <div className={page}>
        <Header step={step} kind={kind} onBack={back} />
        <div className={content}>
          <div className={`${BOX} px-4 py-2`} aria-label="Check">
            <Row label="Type" value={KIND_LABEL[kind]} />
            <Row label="Number" value={`+232 ${spaced(digits)}`} />
            <Row label="Amount" value={formatSle(amount)} />
            <div className="border-t border-finder-card-line">
              <Row label="Your commission" value={formatSle(commission)} tone="text-agent-green-ink" />
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

  // Recorded.
  const share = async () => {
    if (!done) return
    const text = `Agent Finder record ${recordNo(done.id)}: ${KIND_LABEL[kind]} ${formatSle(amount)} for ${masked(digits)}, ${new Date(done.at).toLocaleString('en-GB')}. Not an Orange Money receipt.`
    try {
      if (navigator.share) await navigator.share({ text })
      else await navigator.clipboard.writeText(text)
    } catch {
      // The agent closed the share sheet: nothing to do.
    }
  }
  return (
    <div className={page}>
      <Header step="done" kind={kind} onBack={again} />
      <div className="flex flex-1 flex-col gap-3.5 px-[18px] pb-6 pt-4">
        <span aria-hidden className="mx-auto mt-2 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-agent-green-tint">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-agent-green text-white">
            <Check size={26} strokeWidth={3} />
          </span>
        </span>
        <h2 role="status" className="text-center text-xl font-extrabold">
          {KIND_LABEL[kind]} recorded
        </h2>
        <p className="-mt-2 text-center text-sm text-finder-muted">
          {formatSle(amount)} for {masked(digits)}, in your history.
        </p>
        {done && (
          <div className={`${BOX} px-4 py-2`}>
            <Row label="Number" value={masked(digits)} />
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
            Record another
          </button>
          <button type="button" className="h-11 text-sm font-bold" onClick={() => navigate('/agent')}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  )
}
