import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { DealerAction, DealerOverview, Signal, SignalMuteKind } from '@/types/operator'

const SEV: Record<Signal['severity'], { pill: string; card: string; label: string }> = {
  high: { pill: 'bg-danger-tint text-danger', card: 'border-danger/40 bg-danger-tint/40', label: 'Investigate today' },
  medium: { pill: 'bg-warning-tint text-warning', card: 'border-warning/40 bg-warning-tint/40', label: 'Worth a call' },
  low: { pill: 'bg-canvas text-muted', card: '', label: 'Keep an eye on it' },
}

/**
 * D4 — Needs attention. A signal is a sentence, its evidence and a next action — never a
 * score. Hiding is allowed and is never punished; the point is a dealer who calls the right
 * agent before lunch. There is no automatic suspension and no permanent block.
 */
export default function DealerAttentionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { session } = useSession()
  const { data, state, setData } = useAsync<DealerOverview>((s) => operatorApi.dealerOverview(s))
  const [busy, setBusy] = useState(false)
  const signals = data?.signals ?? []
  const open = id ? signals.find((s) => s.id === id) : null

  async function act(sig: Signal, action: DealerAction) {
    setBusy(true)
    try {
      const logged = await operatorApi.act(sig.agent_ref, action, session?.name ?? 'Dealer')
      toast.show(logged.note)
    } finally {
      setBusy(false)
    }
  }

  /** Snooze or resolve: the row leaves my queue; the agent's status is untouched. */
  async function mute(sig: Signal, kind: SignalMuteKind) {
    setBusy(true)
    try {
      const muted = await operatorApi.muteSignal(sig.id, kind, session?.name ?? 'Dealer')
      toast.show(muted.note)
      setData((prev) => (prev ? { ...prev, signals: prev.signals.filter((s) => s.id !== sig.id) } : prev))
      if (id) navigate('/dealer/attention')
    } finally {
      setBusy(false)
    }
  }

  if (id && state === 'ready' && !open)
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-base font-semibold text-muted">That signal has been resolved or no longer exists.</p>
        <Link to="/dealer/attention" className="text-base font-bold text-brand-text">
          Back to Needs attention
        </Link>
      </div>
    )

  if (open) {
    const sev = SEV[open.severity]
    return (
      <div className="flex flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-paper px-4 py-3">
          <button type="button" onClick={() => navigate('/dealer/attention')} aria-label="Back" className="-ml-2 flex h-control w-control items-center justify-center rounded-card text-2xl leading-none text-muted">
            ‹
          </button>
          <div>
            <h1 className="text-lg font-bold leading-tight">Needs attention</h1>
            <p className="text-xs text-muted">{sev.label}</p>
          </div>
        </header>
        <div className="flex flex-col gap-3 p-4 pb-6">
          <Card className={sev.card}>
            <span className={`w-fit rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${sev.pill}`}>{open.title}</span>
            <p className="mt-1 text-base font-bold">
              {open.agent_ref} · {open.agent_name}
            </p>
            <p className="text-sm leading-snug">{open.sentence}</p>
          </Card>

          <Card>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Evidence</p>
            {open.evidence.map((e, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
                <span className="text-sm text-muted">
                  {e.at_text} · {e.text}
                </span>
                <span className="shrink-0 rounded-pill bg-danger-tint px-2 py-0.5 text-[11px] font-bold text-danger">{e.tag}</span>
              </div>
            ))}
            <p className="pt-2 text-xs text-muted">Reports are anonymous. No customer identity is stored against them.</p>
          </Card>

          {open.explanation && (
            <Card>
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Most likely explanation</p>
              <p className="mt-1 text-sm">{open.explanation}</p>
            </Card>
          )}

          <div className="flex gap-2">
            <Button size="control" variant="secondary" className="flex-1" onClick={() => act(open, 'contact')} disabled={busy}>
              Contact
            </Button>
            <Button size="control" className="flex-1" onClick={() => act(open, 'nudge')} disabled={busy}>
              Nudge to update
            </Button>
          </div>
          <div className="flex gap-2">
            <Link to={`/dealer/agents/${encodeURIComponent(open.agent_ref)}`} className="flex-1">
              <Button size="control" variant="secondary" block className="w-full">
                Agent detail
              </Button>
            </Link>
            <Button size="control" variant="destructive" className="flex-1" onClick={() => act(open, 'escalate')} disabled={busy}>
              Escalate
            </Button>
          </div>
          <div className="flex gap-2">
            <Button size="control" variant="secondary" className="flex-1" onClick={() => mute(open, 'snooze')} disabled={busy}>
              Snooze 4 h
            </Button>
            <Button size="control" variant="secondary" className="flex-1" onClick={() => mute(open, 'resolve')} disabled={busy}>
              Resolve for today
            </Button>
          </div>
          <p className="text-center text-xs text-muted">No automatic suspension. No permanent block. Snooze and resolve only tidy your queue; the signal returns if the condition is still true.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-paper px-4 py-3">
        <h1 className="text-lg font-bold leading-tight">Needs attention</h1>
        <p className="text-xs text-muted">{signals.length} open · investigate, don't punish</p>
      </header>
      <div className="flex flex-col gap-3 p-4 pb-6">
        {state === 'loading' && <p className="text-sm text-muted">Loading…</p>}
        {signals.map((s) => (
          <Card key={s.id} className={SEV[s.severity].card}>
            <Link to={`/dealer/attention/${s.id}`} className="flex flex-col gap-1.5">
              <span className={`w-fit rounded-pill px-2.5 py-0.5 text-[11px] font-bold ${SEV[s.severity].pill}`}>{s.title}</span>
              <p className="text-base font-bold">
                {s.agent_ref} · {s.agent_name}
              </p>
              <p className="text-sm text-muted">{s.sentence}</p>
            </Link>
            <div className="mt-1 grid grid-cols-4 gap-2" role="group" aria-label={`Actions for ${s.agent_ref}`}>
              <Button size="control" className="px-0 text-sm" onClick={() => act(s, 'nudge')} disabled={busy}>
                Nudge
              </Button>
              {s.call_url ? (
                <a
                  href={s.call_url}
                  onClick={() => void act(s, 'call')}
                  className="inline-flex h-control items-center justify-center rounded-card border-2 border-brand-deep px-0 text-sm font-semibold text-brand-text"
                >
                  Call
                </a>
              ) : (
                <Button size="control" variant="secondary" className="px-0 text-sm" disabled title="No number on file">
                  Call
                </Button>
              )}
              <Button size="control" variant="secondary" className="px-0 text-sm" onClick={() => mute(s, 'snooze')} disabled={busy}>
                Snooze
              </Button>
              <Button size="control" variant="secondary" className="px-0 text-sm" onClick={() => mute(s, 'resolve')} disabled={busy}>
                Resolve
              </Button>
            </div>
          </Card>
        ))}
        {state === 'ready' && signals.length === 0 && <p className="text-sm text-muted">Nothing needs attention right now.</p>}
      </div>
    </div>
  )
}
