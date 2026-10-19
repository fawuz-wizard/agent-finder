import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { DealerAction, DealerOverview, Signal, SignalMuteKind } from '@/types/operator'
import { FinderBox, FinderHeader } from '@/features/end-user/components/finder'
import { PILL_OFF } from '@/features/agent/components/agentChrome'
import { Line, PillButton, Section, Tag } from './components/dealerChrome'

const SEV: Record<Signal['severity'], { tone: 'danger' | 'warning' | 'muted'; edge: string; label: string }> = {
  high: { tone: 'danger', edge: 'bg-danger', label: 'Investigate today' },
  medium: { tone: 'warning', edge: 'bg-warning', label: 'Worth a call' },
  low: { tone: 'muted', edge: 'bg-finder-muted', label: 'Keep an eye on it' },
}

/**
 * Needs attention. A signal is a sentence, its evidence and a next action, never a score.
 * Hiding is allowed and is never punished; the point is an aggregator who calls the right
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
      <div className="flex flex-col gap-4 px-5 pb-8 text-finder-ink">
        <FinderHeader back="/dealer/attention" title="Needs attention" />
        <p className="text-base font-semibold text-finder-muted">That signal has been resolved or no longer exists.</p>
        <Link to="/dealer/attention" className="text-base font-bold text-finder-link">
          Back to Needs attention
        </Link>
      </div>
    )

  if (open) {
    const sev = SEV[open.severity]
    return (
      <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
        <FinderHeader back="/dealer/attention" title="Needs attention" />
        <p className="mt-4 text-sm font-bold text-finder-muted">{sev.label}</p>

        <div className="mt-4 flex flex-col gap-3">
          <div className={`relative rounded-panel ${sev.edge}`}>
            <div className="ml-[9px] flex flex-col gap-2 rounded-panel bg-finder-bg px-4 py-4 shadow-inset-finder">
              <Tag tone={sev.tone}>{open.title}</Tag>
              <p className="text-lg font-bold leading-tight">{open.agent_name}</p>
              <p className="-mt-1 text-sm font-bold text-finder-muted">{open.agent_ref.replace(/^Agent /, 'Code ')}</p>
              <p className="text-sm font-medium leading-snug">{open.sentence}</p>
            </div>
          </div>

          <Section heading="Evidence">
            {open.evidence.map((e, i) => (
              <Line key={i} label={<>{e.at_text} · {e.text}</>} value={<Tag tone="danger">{e.tag}</Tag>} />
            ))}
            <p className="text-xs font-medium text-finder-muted">Reports are anonymous. No customer identity is stored against them.</p>
          </Section>

          {open.explanation && (
            <Section heading="Most likely explanation">
              <p className="text-sm font-medium">{open.explanation}</p>
            </Section>
          )}

          <div className="flex gap-3">
            <PillButton className="flex-1" onClick={() => act(open, 'contact')} disabled={busy}>
              Contact
            </PillButton>
            <PillButton tone="on" className="flex-1" onClick={() => act(open, 'nudge')} disabled={busy}>
              Nudge to update
            </PillButton>
          </div>
          <div className="flex gap-3">
            <Link to={`/dealer/agents/${encodeURIComponent(open.agent_ref)}`} className={`flex min-h-chip flex-1 items-center justify-center rounded-pill text-base font-bold ${PILL_OFF}`}>
              Agent detail
            </Link>
            <PillButton tone="danger" className="flex-1" onClick={() => act(open, 'escalate')} disabled={busy}>
              Escalate
            </PillButton>
          </div>
          <div className="flex gap-3">
            <PillButton className="flex-1" onClick={() => mute(open, 'snooze')} disabled={busy}>
              Snooze 4 h
            </PillButton>
            <PillButton className="flex-1" onClick={() => mute(open, 'resolve')} disabled={busy}>
              Resolve for today
            </PillButton>
          </div>
          <p className="text-center text-xs font-medium text-finder-muted">No automatic suspension. No permanent block. Snooze and resolve only tidy your queue; the signal returns if the condition is still true.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <FinderHeader back="/dealer" title="Needs attention" />
      <p className="mt-4 text-sm font-medium text-finder-muted">{signals.length} open · look into it, don't punish</p>

      <div className="mt-5 flex flex-col gap-3">
        {state === 'loading' && <p className="text-base font-medium text-finder-muted">Loading…</p>}
        {signals.map((s) => (
          <div key={s.id} className={`relative rounded-panel ${SEV[s.severity].edge}`}>
            <div className="ml-[9px] flex flex-col gap-2 rounded-panel bg-finder-bg px-4 py-4 shadow-inset-finder">
              <Link to={`/dealer/attention/${s.id}`} className="flex flex-col gap-1.5">
                <Tag tone={SEV[s.severity].tone}>{s.title}</Tag>
                <span className="mt-1 block text-lg font-bold leading-tight">{s.agent_name}</span>
                <span className="-mt-1 block text-sm font-bold text-finder-muted">{s.agent_ref.replace(/^Agent /, 'Code ')}</span>
                <span className="block text-sm font-medium text-finder-muted">{s.sentence}</span>
              </Link>
              <div className="mt-1 grid grid-cols-2 gap-2" role="group" aria-label={`Actions for ${s.agent_ref}`}>
                <PillButton tone="on" className="px-0 text-sm" onClick={() => act(s, 'nudge')} disabled={busy}>
                  Nudge
                </PillButton>
                {s.call_url ? (
                  <a href={s.call_url} onClick={() => void act(s, 'call')} className={`inline-flex min-h-chip items-center justify-center rounded-pill px-0 text-sm font-bold ${PILL_OFF}`}>
                    Call
                  </a>
                ) : (
                  <PillButton className="px-0 text-sm" disabled title="No number on file">
                    Call
                  </PillButton>
                )}
                <PillButton className="px-0 text-sm" onClick={() => mute(s, 'snooze')} disabled={busy}>
                  Snooze
                </PillButton>
                <PillButton className="px-0 text-sm" onClick={() => mute(s, 'resolve')} disabled={busy}>
                  Resolve
                </PillButton>
              </div>
            </div>
          </div>
        ))}
        {state === 'ready' && signals.length === 0 && (
          <FinderBox className="px-5 py-4">
            <p className="text-base font-bold">Nothing needs attention right now.</p>
          </FinderBox>
        )}
      </div>
    </div>
  )
}
