import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { CAPACITY_RANGES, wordForFigure } from '@/types/operator'
import type { AgentHome, CapacityWord, Presence } from '@/types/operator'

const PRESENCE: { value: Presence; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'closed', label: 'Closed' },
]

function WordGrid({
  legend,
  value,
  onChange,
  figure,
  onFigure,
}: {
  legend: string
  value: CapacityWord
  onChange: (w: CapacityWord) => void
  /** Optional "up to about" figure, kept as typed; '' means none. */
  figure: string
  onFigure: (raw: string) => void
}) {
  const figureId = `${(legend.split(' ')[0] ?? 'side').toLowerCase()}-figure`
  return (
    <Card>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{legend}</p>
      <div role="radiogroup" aria-label={legend} className="grid grid-cols-2 gap-2">
        {CAPACITY_RANGES.map((c) => (
          <button
            key={c.word}
            type="button"
            role="radio"
            aria-checked={value === c.word}
            onClick={() => onChange(c.word)}
            className={`rounded-card border-2 p-3 text-center ${
              value === c.word ? 'border-brand-deep bg-brand-light' : 'border-line bg-paper'
            }`}
          >
            <span className="block text-base font-bold">{c.label}</span>
            <span className="block text-xs font-semibold text-muted">{c.hint}</span>
          </button>
        ))}
      </div>
      <label htmlFor={figureId} className="mt-3 block text-sm font-semibold">
        Up to about (SLE) — optional
      </label>
      <input
        id={figureId}
        type="number"
        inputMode="numeric"
        min={0}
        step={100}
        value={figure}
        placeholder="e.g. 5000"
        onChange={(e) => onFigure(e.target.value)}
        className="mt-1 h-control w-full rounded-card border-2 border-line bg-paper px-3 text-base"
      />
      <p className="mt-1 text-xs text-muted">
        A figure picks the word for you and lets the app count confirmed visits against it. Customers never see it.
      </p>
    </Card>
  )
}

/** '' → null; anything else → a whole number of Leones, never negative. */
function figureOf(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Math.max(0, Math.floor(Number(raw)))
  return Number.isFinite(n) ? n : null
}

/**
 * A2 — Availability. The four words are the agent's private vocabulary; the customer
 * never sees them, only the phrase they produce against the amount asked for. Hiding is
 * offered plainly and never punished — an agent who fears a black mark will leave
 * themselves open and turn people away, which is the behaviour that breaks the product.
 */
export default function AvailabilityPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const navigate = useNavigate()
  const { state, data } = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])

  const [presence, setPresence] = useState<Presence>('open')
  const [cashOut, setCashOut] = useState<CapacityWord>('most')
  const [deposit, setDeposit] = useState<CapacityWord>('some')
  const [cashOutSle, setCashOutSle] = useState('')
  const [depositSle, setDepositSle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setPresence(data.declaration.presence)
    setCashOut(data.declaration.cash_out)
    setDeposit(data.declaration.deposit)
    setCashOutSle(data.declaration.cash_out_sle === null ? '' : String(data.declaration.cash_out_sle))
    setDepositSle(data.declaration.deposit_sle === null ? '' : String(data.declaration.deposit_sle))
  }, [data])

  /** Typing a figure picks the word; picking a word clears the figure so the two never disagree. */
  function cashFigure(raw: string) {
    setCashOutSle(raw)
    const n = figureOf(raw)
    if (n !== null) setCashOut(wordForFigure(n))
  }
  function depositFigure(raw: string) {
    setDepositSle(raw)
    const n = figureOf(raw)
    if (n !== null) setDeposit(wordForFigure(n))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await operatorApi.declare(ref, {
        presence,
        cash_out: cashOut,
        deposit,
        cash_out_sle: figureOf(cashOutSle),
        deposit_sle: figureOf(depositSle),
        night_mode: data?.declaration.night_mode ?? true,
      })
      navigate('/agent')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
      setSaving(false)
    }
  }

  if (state === 'loading') return <p className="p-4 text-base text-muted">Loading…</p>

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-paper px-4 py-3">
        <h1 className="text-lg font-bold leading-tight">Availability</h1>
        <p className="text-xs text-muted">What customers can see about you</p>
      </header>

      <div className="flex flex-col gap-3 p-4 pb-6">
        <Card>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Right now</p>
          <div role="radiogroup" aria-label="Right now" className="grid grid-cols-3 gap-2">
            {PRESENCE.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={presence === p.value}
                onClick={() => setPresence(p.value)}
                className={`h-control rounded-card border-2 text-base font-bold ${
                  presence === p.value ? 'border-brand-deep bg-brand-light' : 'border-line bg-paper'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">
            Hiding is never held against you. It is recorded so your dealer can see a cash problem, not punish you.
          </p>
        </Card>

        {data?.declaration.capacity_source === 'operator' && (
          <p className="rounded-card border border-line bg-canvas px-3 py-2 text-sm text-muted" role="note">
            Capacity comes from Orange Money while the link is connected. The words and figures below are used only if the link drops.
          </p>
        )}
        <WordGrid
          legend="Cash out — how much can you give?"
          value={cashOut}
          onChange={(w) => {
            setCashOut(w)
            setCashOutSle('')
          }}
          figure={cashOutSle}
          onFigure={cashFigure}
        />
        <WordGrid
          legend="Deposit — how much float do you have?"
          value={deposit}
          onChange={(w) => {
            setDeposit(w)
            setDepositSle('')
          }}
          figure={depositSle}
          onFigure={depositFigure}
        />

        <Link to="/agent/hours" className="rounded-card border border-line bg-paper px-4 py-3.5">
          <p className="text-base font-bold">Working hours</p>
          <p className="text-sm text-muted">{data?.schedule.hours_text ?? 'Set your weekly hours'} · outside them customers are told you are closed, by your own schedule.</p>
        </Link>

        {error && (
          <p role="alert" className="text-base font-semibold text-danger">
            {error}
          </p>
        )}

        <Button size="cta" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <p className="text-center text-xs text-muted">
          Saving resets your freshness clock, so customers see your status as current again.
        </p>
      </div>
    </div>
  )
}
