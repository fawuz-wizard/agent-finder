import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Wordmark } from '@/design'
import { AREAS } from '@/lib/reference'
import type { TransactionType } from '@/types/public'
import { TransactionTypeSelector } from './components/TransactionTypeSelector'
import { AmountInput } from './components/AmountInput'
// Loaded only when a visit is waiting to be reported, so the API client stays out of the
// first customer payload.
const OutcomePrompt = lazy(() => import('./OutcomePrompt').then((m) => ({ default: m.OutcomePrompt })))
import { t } from '@/i18n'

/**
 * U1 — Home. Transaction first, answer second: nothing is recommended until the
 * customer says what they need. No map, no hero, no dashboard.
 */
export default function HomePage() {
  const navigate = useNavigate()
  // Coming back from "Edit" on the results screen restores what was searched.
  const [params] = useSearchParams()
  const initialTx = params.get('tx')
  const [transaction, setTransaction] = useState<TransactionType | null>(
    initialTx === 'cash_out' || initialTx === 'deposit' || initialTx === 'send' ? initialTx : 'cash_out',
  )
  const [amount, setAmount] = useState(() => params.get('amount') ?? '')
  const [area, setArea] = useState<string>(() => params.get('area') ?? AREAS[0])
  const [pickArea, setPickArea] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (!transaction) {
      setError('Choose what you need first.')
      return
    }
    if (amount !== '' && Number(amount) <= 0) {
      setError('Enter an amount above SLE 0.')
      return
    }
    setError(null)
    const q = new URLSearchParams({ tx: transaction, area })
    if (amount) q.set('amount', amount)
    navigate(`/search?${q.toString()}`)
  }

  return (
    <div className="flex flex-1 flex-col gap-5 p-4">
      <header className="flex h-12 items-center justify-between">
        {params.get('from') === 'host' ? (
          <Link
            to="/"
            className="-ml-2 flex h-control items-center gap-1 rounded-card px-2 text-base font-semibold text-muted"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ‹
            </span>
            Back
          </Link>
        ) : (
          <Wordmark />
        )}
        {params.get('from') === 'host' && <Wordmark />}
      </header>

      <button
        type="button"
        onClick={() => setPickArea((v) => !v)}
        aria-expanded={pickArea}
        className="flex h-control items-center gap-2 self-start rounded-card px-1 text-lg font-semibold"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="text-muted">
          <path d="M9 16s6-5.2 6-9A6 6 0 003 7c0 3.8 6 9 6 9z" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="9" cy="7" r="2.2" fill="currentColor" />
        </svg>
        {area}
        <span className="text-base font-semibold text-brand-text">Change</span>
      </button>

      {pickArea && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Choose your area">
          {AREAS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={a === area}
              onClick={() => {
                setArea(a)
                setPickArea(false)
              }}
              className={`h-control rounded-pill border px-4 text-base font-semibold ${a === area ? 'border-brand bg-brand text-ink' : 'border-line bg-paper'}`}
            >
              {a}
            </button>
          ))}
        </div>
      )}

      <h1 className="text-xl font-bold leading-tight">What do you need?</h1>
      <TransactionTypeSelector value={transaction} onChange={setTransaction} />
      <AmountInput value={amount} onChange={setAmount} error={error} />

      <Button size="cta" onClick={submit}>
        Find an agent
      </Button>

      <Card className="bg-canvas">
        <p className="text-sm text-muted">{t('disclaimer')}</p>
      </Card>

      <nav className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-base font-semibold text-brand-text">
        <Link to="/how-availability-works" className="flex h-control items-center rounded-card px-2">
          How availability works
        </Link>
        <Link to="/report-a-visit" className="flex h-control items-center rounded-card px-2">
          Report a visit
        </Link>
      </nav>

      <Suspense fallback={null}>
        <OutcomePrompt />
      </Suspense>
    </div>
  )
}
