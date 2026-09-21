import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { CAPACITY_RANGES } from '@/types/operator'
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
}: {
  legend: string
  value: CapacityWord
  onChange: (w: CapacityWord) => void
}) {
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
    </Card>
  )
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
  const [night, setNight] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setPresence(data.declaration.presence)
    setCashOut(data.declaration.cash_out)
    setDeposit(data.declaration.deposit)
    setNight(data.declaration.night_mode)
  }, [data])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await operatorApi.declare(ref, { presence, cash_out: cashOut, deposit, night_mode: night })
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

        <WordGrid legend="Cash out — how much can you give?" value={cashOut} onChange={setCashOut} />
        <WordGrid legend="Deposit — how much float do you have?" value={deposit} onChange={setDeposit} />

        <div className="rounded-card border border-night bg-night px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-bold text-night-text">Night mode</p>
              <p className="text-sm text-night-text/75">Hides you from customers outside your opening hours</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={night}
              aria-label="Night mode"
              onClick={() => setNight((v) => !v)}
              className="-mr-1 flex h-control w-14 shrink-0 items-center justify-center"
            >
              <span className={`block h-7 w-12 rounded-full p-1 transition-colors ${night ? 'bg-brand' : 'bg-muted'}`}>
                <span className={`block h-5 w-5 rounded-full bg-paper transition-transform ${night ? 'translate-x-5' : ''}`} />
              </span>
            </button>
          </div>
        </div>

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
