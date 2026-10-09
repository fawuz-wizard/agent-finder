import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Banner, Button, Card, useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import { useSession } from '@/features/auth/session'
import { PRESENCE_LABELS, TRANSACTION_BANDS } from '@/types/operator'
import type { AgentHome, TransactionBand } from '@/types/operator'
import { OperatorValueRow } from './components/OperatorValue'
import { formatSle } from './money'

function newToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * A1 — Agent Home. The agent opens this to run their day: presence, hours, what customers
 * see, float, and what customers reported. Nothing to declare and nothing to refresh: what
 * they can cover comes from their history.
 */
export default function AgentHomePage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const { state, data, error, refresh } = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])
  const toast = useToast()

  const [extending, setExtending] = useState(false)
  // Two taps after serving a customer: the side, then an amount band. One token per attempt,
  // so a retry after a timeout cannot log the same transaction twice.
  const [side, setSide] = useState<'cash_out' | 'deposit' | null>(null)
  const [logging, setLogging] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [token, setToken] = useState(newToken)

  async function logBand(band: TransactionBand) {
    if (!side || logging) return
    setLogging(true)
    setLogError(null)
    try {
      const out = await operatorApi.logTransaction(ref, side, band, token)
      setToken(newToken())
      setSide(null)
      toast.show(`Logged · ${out.text}`)
      refresh()
    } catch (e) {
      setLogError(e instanceof Error ? e.message : 'Could not log that.')
    } finally {
      setLogging(false)
    }
  }
  async function stayOpen() {
    setExtending(true)
    try {
      await operatorApi.setToday(ref, { extend_minutes: 60 })
      refresh()
    } finally {
      setExtending(false)
    }
  }

  if (state === 'loading') return <p className="p-4 text-base text-muted">Loading your day…</p>
  if (state === 'error' || !data)
    return (
      <div className="flex flex-col gap-3 p-4 pb-6">
        <p className="text-base font-semibold text-danger">{error}</p>
        <Button size="control" onClick={refresh}>
          Try again
        </Button>
      </div>
    )

  const d = data.declaration
  const see = data.customers_see
  const presenceTone =
    d.presence === 'open' ? 'text-success-strong' : d.presence === 'hidden' ? 'text-warning' : 'text-muted'

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-paper px-4 py-3">
        <h1 className="text-lg font-bold leading-tight">{data.name}</h1>
        <p className="text-xs text-muted">
          {data.ref} · {data.area}
        </p>
      </header>

      <div className="flex flex-col gap-3 p-4">
        {data.schedule.notice && (
          <Banner tone="warning">
            {data.schedule.notice}{' '}
            <button type="button" onClick={stayOpen} disabled={extending} className="font-bold underline">
              {extending ? 'Saving…' : 'Stay open 1 more hour'}
            </button>
          </Banner>
        )}
        <Card className="border-brand-deep bg-brand-faint">
          <div className="flex items-center justify-between">
            <span className={`text-2xl font-bold leading-tight ${presenceTone}`}>{PRESENCE_LABELS[d.presence]}</span>
            <Link to="/agent/availability" className="-mr-2 flex h-control items-center rounded-card px-2 text-base font-bold text-brand-text">
              Change
            </Link>
          </div>
          {d.source_text && <p className="mt-2 text-xs text-muted">{d.source_text}</p>}
          <p className="mt-1 text-xs text-muted">
            {data.schedule.hours_text} ·{' '}
            <Link to="/agent/hours" className="font-semibold text-brand-text">
              Working hours
            </Link>
          </p>

        </Card>

        <Card aria-labelledby="customers-see">
          <p id="customers-see" className="text-xs font-bold uppercase tracking-wider text-muted">
            Customers now see
          </p>
          {see.sides.length === 0 ? (
            <>
              <p className="text-xl font-bold leading-tight">{see.headline}</p>
              <p className="text-sm text-muted">{see.explanation}</p>
            </>
          ) : (
            <>
              {see.sides.map((side) => (
                <div key={side.label} className="border-b border-line py-2 last:border-b-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">{side.label}</p>
                  <p className="text-base font-bold leading-snug">
                    {side.phrase} <span className="font-semibold text-muted">· {side.range_text}</span>
                  </p>
                  {side.above_text && <p className="text-sm text-muted">Above that: {side.above_text}</p>}
                  {side.estimate_text && <p className="text-sm text-muted">{side.estimate_text}</p>}
                  {side.why && <p className="text-sm font-semibold text-warning">{side.why}</p>}
                </div>
              ))}
              <p className="pt-1 text-xs text-muted">{see.explanation}</p>
            </>
          )}
        </Card>

        <Card aria-labelledby="log-tx">
          <div className="flex items-baseline justify-between">
            <p id="log-tx" className="text-xs font-bold uppercase tracking-wider text-muted">
              Log a transaction
            </p>
            <span className="text-xs font-semibold text-muted">Logged today: {data.today.logged}</span>
          </div>
          <p className="text-sm text-muted">Two taps after you serve someone. The amount is never sent, only a band.</p>
          <div role="radiogroup" aria-label="What did you just do?" className="mt-2 grid grid-cols-2 gap-2">
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
                className={`h-control rounded-card border-2 text-base font-bold ${side === value ? 'border-brand-deep bg-brand-light' : 'border-line bg-paper'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {side && (
            <div role="group" aria-label="How much, roughly? (SLE)" className="mt-2 grid grid-cols-3 gap-2">
              {TRANSACTION_BANDS.map((b) => (
                <button
                  key={b.band}
                  type="button"
                  onClick={() => void logBand(b.band)}
                  disabled={logging}
                  className="h-control rounded-card border border-line bg-paper px-1 text-sm font-semibold disabled:opacity-45"
                >
                  {b.label}
                </button>
              ))}
            </div>
          )}
          {logError && (
            <p role="alert" className="mt-2 text-sm font-semibold text-danger">
              {logError}
            </p>
          )}
        </Card>

        <Card>
          <OperatorValueRow label="Balance" value={data.balance} />
          <div className="flex items-center justify-between border-b border-line py-2 last:border-b-0">
            <span className="text-sm text-muted">Float request</span>
            {data.pending_float ? (
              <Link
                to="/agent/float"
                className="rounded-pill bg-warning-tint px-3 py-1 text-sm font-bold text-warning"
              >
                Pending · {formatSle(data.pending_float.amount_sle)}
              </Link>
            ) : (
              <Link to="/agent/float" className="-mr-2 flex h-control items-center rounded-card px-2 text-sm font-bold text-brand-text">
                Request float
              </Link>
            )}
          </div>
        </Card>

        <Card>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Today</p>
          <div className="flex items-baseline justify-between border-b border-line py-2">
            <span className="text-sm text-muted">Customers who found you</span>
            <span className="text-base font-bold text-brand-text">{data.today.found_you}</span>
          </div>
          <div className="flex items-baseline justify-between py-2">
            <span className="text-sm text-muted">
              Transactions <span className="text-xs font-semibold">· Orange</span>
            </span>
            <span className="text-base font-bold">{data.today.transactions ?? '—'}</span>
          </div>
        </Card>

        {data.attention.map((sentence) => (
          <Banner key={sentence} tone="danger">
            {sentence}{' '}
            <Link to="/agent/dashboard" className="font-bold underline">
              View
            </Link>
          </Banner>
        ))}

        <p className="text-center text-xs text-muted">
          Transactions happen in Max it. This app keeps your availability, float and what customers report.
        </p>
      </div>
    </div>
  )
}
