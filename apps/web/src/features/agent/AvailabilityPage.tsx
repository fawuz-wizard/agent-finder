import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentHome, Presence } from '@/types/operator'

const PRESENCE: { value: Presence; label: string; hint: string }[] = [
  { value: 'open', label: 'Open', hint: 'Customers can find you' },
  { value: 'hidden', label: 'Away', hint: 'A pause — back soon' },
  { value: 'closed', label: 'Closed', hint: 'Done for today' },
]

/**
 * A2 — Availability. The agent sets presence and working hours; that is all they are asked.
 * What they can cover comes from their history (the operator's records, the dealer's note,
 * confirmed visits), never from a word or a figure, and there is nothing to refresh. Away is
 * offered plainly and never punished.
 */
export default function AvailabilityPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const navigate = useNavigate()
  const { state, data } = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])

  const [presence, setPresence] = useState<Presence>('open')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data) setPresence(data.declaration.presence)
  }, [data])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await operatorApi.declare(ref, { presence, night_mode: data?.declaration.night_mode ?? true })
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
        <p className="text-xs text-muted">Whether customers can find you right now</p>
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
                className={`rounded-card border-2 p-3 text-center ${
                  presence === p.value ? 'border-brand-deep bg-brand-light' : 'border-line bg-paper'
                }`}
              >
                <span className="block text-base font-bold">{p.label}</span>
                <span className="block text-xs font-semibold text-muted">{p.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">
            Away is never held against you. It is recorded so your dealer can see a cash problem, not punish you.
          </p>
        </Card>

        <Link to="/agent/hours" className="rounded-card border border-line bg-paper px-4 py-3.5">
          <p className="text-base font-bold">Working hours</p>
          <p className="text-sm text-muted">{data?.schedule.hours_text ?? 'Set your weekly hours'} · outside them customers are told you are closed, by your own schedule.</p>
        </Link>

        <Card className="bg-canvas">
          <p className="text-sm text-muted">
            What you can cover is worked out from your history, never asked. Your dealer can note what you usually handle until Orange Money's records take over.
          </p>
        </Card>

        {error && (
          <p role="alert" className="text-base font-semibold text-danger">
            {error}
          </p>
        )}

        <Button size="cta" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
