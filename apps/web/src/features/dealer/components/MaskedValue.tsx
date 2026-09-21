import { useEffect, useState } from 'react'
import { Button, Sheet } from '@/design'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS } from '@/types/operator'
import type { OperatorValue } from '@/types/operator'
import { formatSle } from '@/features/agent/money'

const REVEAL_SECONDS = 60

/**
 * S7 rule, applied one tier down. Money is masked by default even for the dealer. A reveal
 * asks for a purpose, the server writes the audit row before returning the value, the value
 * shows for sixty seconds and re-masks. Without VIEW_AGENT_FINANCIAL_DETAIL there is no
 * button at all — the permission decides what is offered, the API decides what is returned.
 */
export function MaskedValue({ agentRef, field, label }: { agentRef: string; field: 'balance' | 'float'; label: string }) {
  const { session, can } = useSession()
  const allowed = can(PERMISSIONS.viewFinancial)
  const [asking, setAsking] = useState(false)
  const [purpose, setPurpose] = useState('')
  const [value, setValue] = useState<OperatorValue | null>(null)
  const [left, setLeft] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!value) return
    setLeft(REVEAL_SECONDS)
    const id = window.setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          window.clearInterval(id)
          setValue(null)
          return 0
        }
        return n - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [value])

  async function reveal() {
    setBusy(true)
    setError(null)
    try {
      const v = await operatorApi.revealFinancial(agentRef, field, purpose, session?.name ?? 'dealer')
      setValue(v)
      setAsking(false)
      setPurpose('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reveal.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      {value ? (
        <span className="text-right">
          <span className="block text-base font-bold">{formatSle(value.amount_sle)}</span>
          <span className="text-xs font-semibold text-muted">
            from {value.source} · hides in {left}s
          </span>
        </span>
      ) : allowed ? (
        <button type="button" onClick={() => setAsking(true)} className="-my-2 flex h-control items-center gap-2 text-right">
          <span className="text-base font-bold tracking-[3px] text-muted" aria-label="hidden">
            •••••
          </span>
          <span className="text-sm font-bold text-brand-text">Reveal</span>
        </button>
      ) : (
        <span className="text-sm font-semibold text-muted">Not available to you</span>
      )}

      <Sheet open={asking} onClose={() => setAsking(false)} title={`Reveal ${label.toLowerCase()} for ${REVEAL_SECONDS} seconds`}>
        <p className="text-sm text-muted">
          You will be asked why. The reveal is recorded against your name before the value appears — the record keeps
          which field you saw, never the amount.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-muted">Why do you need to see it?</span>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value.slice(0, 120))}
            placeholder="Reviewing a float request"
            className="h-control rounded-card border-2 border-line bg-paper px-3 text-base outline-none focus:border-brand-deep"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <Button size="control" onClick={reveal} disabled={busy || !purpose.trim()}>
          {busy ? 'Recording…' : 'Reveal'}
        </Button>
        <Button size="control" variant="tertiary" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </Sheet>
    </div>
  )
}
