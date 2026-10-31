import { useEffect, useState } from 'react'
import { keepOverview, readOverview } from './overviewCache'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { DealerAction, DealerOverview, Signal, SignalMuteKind } from '@/types/operator'
import { FinderHeader } from '@/features/end-user/components/finder'
import { PILL_OFF } from '@/features/agent/components/agentChrome'
import { Line, PillButton, Section, Tag } from './components/dealerChrome'
import { RowAvatar, ScreenTitle } from './components/designKit'
import { PAGE } from './components/designClasses'

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
  const { data, state, setData } = useAsync<DealerOverview>((s) => operatorApi.dealerOverview(s), [], readOverview())
  useEffect(() => keepOverview(data), [data])
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

  const REASON: Record<Signal['severity'], string> = { high: 'bg-design-red-tint text-design-red', medium: 'bg-design-warn-tint text-finder-limited', low: 'bg-design-track text-finder-muted' }
  const small = 'flex h-9 items-center justify-center rounded-[10px] text-xs font-bold text-finder-muted disabled:opacity-50'
  return (
    <div className={PAGE}>
      <ScreenTitle
        title="Needs attention"
        back="/dealer"
        action={<span className="rounded-pill bg-design-red-tint px-2.5 py-1 text-[13px] font-extrabold text-design-red">{signals.length}</span>}
      />
      <div className="flex flex-col gap-3">
        {state === 'loading' && <p className="text-sm text-finder-muted">Loading…</p>}
        {signals.map((s, i) => (
          <article key={s.id} className="flex flex-col gap-3.5 rounded-[18px] bg-finder-card p-[18px]">
            <Link to={`/dealer/attention/${s.id}`} className="flex items-start gap-3">
              <RowAvatar name={s.agent_name} index={i} />
              <span className="flex min-w-0 flex-1 flex-col items-start gap-[5px]">
                <span className="max-w-full truncate text-[15px] font-bold">{s.agent_name}</span>
                <span className={`rounded-pill px-2 py-1 text-[11px] font-bold ${REASON[s.severity]}`}>{s.title}</span>
                <span className="line-clamp-2 text-[13px] text-finder-muted">
                  {s.agent_ref.replace(/^Agent /, 'Code ')} · {s.sentence}
                </span>
              </span>
            </Link>
            <div className="flex flex-col gap-2" role="group" aria-label={`Actions for ${s.agent_ref}`}>
              <div className="grid grid-cols-2 gap-2.5">
                {s.call_url ? (
                  <a href={s.call_url} onClick={() => void act(s, 'call')} className="flex h-[42px] items-center justify-center rounded-xl border-[1.5px] border-design-field-line text-[13px] font-bold">
                    Call
                  </a>
                ) : (
                  <button type="button" disabled title="No number on file" className="flex h-[42px] items-center justify-center rounded-xl border-[1.5px] border-design-field-line text-[13px] font-bold opacity-50">
                    Call
                  </button>
                )}
                <Link to={`/dealer/network/map?focus=${encodeURIComponent(s.agent_ref)}`} className="flex h-[42px] items-center justify-center rounded-xl bg-design-ink text-[13px] font-bold text-white">
                  View on map
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <button type="button" className={small} onClick={() => act(s, 'nudge')} disabled={busy}>
                  Nudge
                </button>
                <button type="button" className={small} onClick={() => mute(s, 'snooze')} disabled={busy}>
                  Snooze
                </button>
                <button type="button" className={small} onClick={() => mute(s, 'resolve')} disabled={busy}>
                  Resolve
                </button>
              </div>
            </div>
          </article>
        ))}
        {state === 'ready' && signals.length === 0 && (
          <div className="rounded-[18px] bg-finder-card p-[18px]">
            <p className="text-base font-bold">Nothing needs attention right now.</p>
          </div>
        )}
      </div>
    </div>
  )
}
