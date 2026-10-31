import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentHome } from '@/types/operator'
import { AgentTitle } from './components/agentKit'
import { BOX, FIELD, PRIMARY, chip } from './components/agentClasses'
import { formatSle } from './money'

function newToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Record Transaction (the design's "Do Transaction" tile: the app records what the agent did
 * in Orange Money, it never moves money). Which side, then what Orange's own flow asks for:
 * the customer's number for a cash in, and the amount. One token per attempt, so a retry after
 * a timeout cannot record the same transaction twice. Float requests have their own screen.
 */
export default function ServicesPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const home = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])
  const toast = useToast()
  const ids = useId()
  const [side, setSide] = useState<'cash_out' | 'deposit' | null>(null)
  const [txAmount, setTxAmount] = useState('')
  const [customer, setCustomer] = useState('')
  const [logging, setLogging] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [token, setToken] = useState(newToken)

  async function recordTransaction() {
    if (!side || logging) return
    const amount = Number(txAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setLogError('Enter the amount.')
      return
    }
    const digits = customer.replace(/\D/g, '')
    if (side === 'deposit' && digits.length < 8) {
      setLogError("Enter the customer's number, as Orange has it.")
      return
    }
    setLogging(true)
    setLogError(null)
    try {
      const out = await operatorApi.logTransaction(ref, {
        transaction: side,
        amount_sle: amount,
        ...(side === 'deposit' ? { customer_msisdn: digits } : {}),
        client_token: token,
      })
      setToken(newToken())
      setSide(null)
      setTxAmount('')
      setCustomer('')
      toast.show(`Recorded · ${out.text} · +${formatSle(out.commission_sle)} commission`)
      home.refresh()
    } catch (e) {
      setLogError(e instanceof Error ? e.message : 'Could not record that.')
    } finally {
      setLogging(false)
    }
  }

  const unlocated = home.data?.customers_see.state === 'unlocated'

  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <AgentTitle title="Record Transaction" />
      <div className="flex flex-1 flex-col gap-2.5 px-[18px] pb-8 pt-6">
        {unlocated && (
          <section className={`${BOX} mb-2 flex flex-col gap-2 border-finder-accent px-4 py-4`}>
            <p className="text-base font-bold leading-tight">Your shop is not on the map yet</p>
            <p className="text-sm text-finder-muted">Customers cannot find you until it is. Stand inside the shop and pin it.</p>
            <Link to="/agent/profile" className={`${PRIMARY} h-12 w-fit px-5`}>
              Pin my shop
            </Link>
          </section>
        )}

        <h2 className="text-[17px] font-bold">What did you just do?</h2>
        <p className="text-sm text-finder-muted">
          After you serve someone, the same details Orange asks you for. <span className="font-bold text-finder-ink">Logged today: {home.data?.today.logged ?? 0}</span>
        </p>
        <div role="radiogroup" aria-label="What did you just do?" className="mt-2 flex gap-2">
          {(
            [
              ['deposit', 'Cash in'],
              ['cash_out', 'Cash out'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={side === value} onClick={() => setSide(value)} className={`${chip(side === value)} h-11 px-6 text-sm`}>
              {label}
            </button>
          ))}
        </div>

        {side && (
          <div className="mt-3 flex flex-col gap-2.5">
            {side === 'deposit' && (
              <>
                <label htmlFor={`${ids}-customer`} className="text-sm font-semibold">
                  Customer's number
                </label>
                <div className={FIELD}>
                  <input
                    id={`${ids}-customer`}
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value.replace(/[^\d ]/g, '').slice(0, 15))}
                    inputMode="tel"
                    placeholder="e.g. 076 000 000"
                    className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-finder-muted"
                  />
                </div>
                <p className="text-[13px] text-finder-muted">The Orange Money number the cash goes to, as you typed it for Orange. Only its last three digits are kept.</p>
              </>
            )}
            <label htmlFor={`${ids}-tx-amount`} className="text-sm font-semibold">
              Amount (SLE)
            </label>
            <div className={FIELD}>
              <span className="text-[17px] font-semibold">SLE</span>
              <input
                id={`${ids}-tx-amount`}
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value.replace(/\D/g, '').slice(0, 7))}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                className="h-full min-w-0 flex-1 bg-transparent text-[19px] font-extrabold outline-none placeholder:text-finder-muted"
              />
            </div>
            <button type="button" className={`${PRIMARY} mt-2`} onClick={() => void recordTransaction()} disabled={logging}>
              {logging ? 'Recording…' : side === 'deposit' ? 'Record cash in' : 'Record cash out'}
            </button>
          </div>
        )}
        {logError && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {logError}
          </p>
        )}

        <Link to="/agent/float" className={`${BOX} mt-6 flex min-h-14 items-center justify-between px-4`}>
          <span className="text-sm font-semibold">Need float?</span>
          <span className="text-[13px] font-bold text-finder-link">Request float ›</span>
        </Link>
      </div>
    </div>
  )
}
