import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Card, useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { CAPACITY_RANGES, PERMISSIONS, PRESENCE_LABELS } from '@/types/operator'
import type { DealerAction, DealerAgentDetail } from '@/types/operator'
import { formatSle } from '@/features/agent/money'
import { MaskedValue } from './components/MaskedValue'

const word = (w: DealerAgentDetail['declaration']['cash_out']) => CAPACITY_RANGES.find((c) => c.word === w)?.label ?? w

/**
 * D2 — Agent detail. Declaration, money (masked), today's counts with their source, the
 * day's availability changes, and the fixed action row. Every action is logged with the
 * dealer's name; none of them changes the agent's availability.
 */
export default function DealerAgentDetailPage() {
  const { ref = '' } = useParams()
  const { session, can } = useSession()
  const toast = useToast()
  const { state, data, error, refresh } = useAsync<DealerAgentDetail>((s) => operatorApi.dealerAgent(ref, s), [ref])
  const [busy, setBusy] = useState<DealerAction | null>(null)

  async function act(action: DealerAction) {
    setBusy(action)
    try {
      const logged = await operatorApi.act(ref, action, session?.name ?? 'Dealer')
      toast.show(logged.note)
    } finally {
      setBusy(null)
    }
  }

  if (state === 'loading' && !data) return <p className="p-4 text-base text-muted">Loading…</p>
  if (!data)
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-base font-semibold text-danger">{error ?? 'We could not find that agent.'}</p>
        <Link to="/dealer/agents" className="text-base font-bold text-brand-text">
          Back to agents
        </Link>
      </div>
    )

  const d = data.declaration
  const tone = d.presence === 'open' ? 'text-success' : d.presence === 'hidden' ? 'text-warning' : 'text-muted'

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-paper px-4 py-3">
        <Link to="/dealer/agents" aria-label="Back" className="-ml-2 flex h-control w-control items-center justify-center rounded-card text-2xl leading-none text-muted">
          ‹
        </Link>
        <div>
          <h1 className="text-lg font-bold leading-tight">{data.ref}</h1>
          <p className="text-xs text-muted">
            {data.shop_name} · {data.area}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3 p-4 pb-6">
        <Card>
          <div className="flex items-center justify-between">
            <span className={`text-base font-bold ${tone}`}>
              {PRESENCE_LABELS[d.presence]} · {word(d.cash_out)} / {word(d.deposit)}
            </span>
            <span className="text-xs font-semibold text-muted">{d.age_min < 60 ? `${d.age_min} min ago` : d.freshness_text.replace('You updated this ', '')}</span>
          </div>
          {d.freshness === 'expired' && <p className="mt-1 text-sm font-semibold text-danger">Expired — customers are not being sent here.</p>}
          <p className="mt-1 text-sm text-muted">
            <span className="font-bold">{data.reliability.label_text}</span> · {data.reliability.text}
          </p>
        </Card>

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Float &amp; balance</p>
          <MaskedValue agentRef={data.ref} field="balance" label="Balance" />
          <MaskedValue agentRef={data.ref} field="float" label="Float position" />
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted">Pending request</span>
            {data.pending_float ? (
              <Link to={`/dealer/float/${data.pending_float.id}`} className="text-sm font-bold text-brand-text">
                {formatSle(data.pending_float.amount_sle)} · Review
              </Link>
            ) : (
              <span className="text-sm font-semibold text-muted">None</span>
            )}
          </div>
          {!can(PERMISSIONS.viewFinancial) && (
            <p className="pt-1 text-xs text-muted">Financial detail needs a permission you do not hold.</p>
          )}
        </Card>

        <UsualCard detail={data} onSaved={refresh} />

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Today</p>
          <div className="flex items-baseline justify-between border-b border-line py-2">
            <span className="text-sm text-muted">
              Transactions <span className="text-xs font-semibold">· {data.today.transactions === null ? 'not connected' : 'Orange'}</span>
            </span>
            <span className="text-base font-bold">{data.today.transactions ?? '—'}</span>
          </div>
          <div className="flex items-baseline justify-between border-b border-line py-2">
            <span className="text-sm text-muted">Successful</span>
            <span className="text-base font-bold">{data.today.successful ?? '—'}</span>
          </div>
          <div className="flex items-baseline justify-between border-b border-line py-2">
            <span className="text-sm text-muted">Customers who found them</span>
            <span className="text-base font-bold text-brand-text">{data.today.found_you}</span>
          </div>
          <div className="flex items-baseline justify-between py-2">
            <span className="text-sm text-muted">Reported problems</span>
            <span className={`text-base font-bold ${data.today.reported_problems > 0 ? 'text-danger' : ''}`}>{data.today.reported_problems}</span>
          </div>
        </Card>

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Availability today</p>
          {data.availability_today.map((e, i) => (
            <div key={i} className="flex items-baseline justify-between border-b border-line py-2 last:border-b-0">
              <span className="text-sm text-muted">{e.time_text}</span>
              <span className={`text-sm font-bold ${e.tone === 'warning' ? 'text-warning' : ''}`}>{e.text}</span>
            </div>
          ))}
        </Card>

        <div className="flex gap-2">
          <Button size="control" variant="secondary" className="flex-1" onClick={() => act('contact')} disabled={busy !== null}>
            Contact
          </Button>
          <Button size="control" variant="primary" className="flex-1" onClick={() => act('nudge')} disabled={busy !== null}>
            Nudge
          </Button>
        </div>
        <div className="flex gap-2">
          <Link to="/dealer/attention" className="flex-1">
            <Button size="control" variant="secondary" block className="w-full">
              History
            </Button>
          </Link>
          <Button size="control" variant="destructive" className="flex-1" onClick={() => act('escalate')} disabled={busy !== null}>
            Escalate
          </Button>
        </div>
        <p className="text-center text-xs text-muted">Every action is recorded with your name. None of them changes the agent's status.</p>
      </div>
    </div>
  )
}

/**
 * What this agent usually handles: the dealer's note until the operator's records replace it.
 * It sets what amounts read as likely for customers; the figure itself is never shown to them.
 */
function UsualCard({ detail, onSaved }: { detail: DealerAgentDetail; onSaved: () => void }) {
  const [cash, setCash] = useState(detail.usual.usual_max_sle === null ? '' : String(detail.usual.usual_max_sle))
  const [float, setFloat] = useState(detail.usual.usual_float_max_sle === null ? '' : String(detail.usual.usual_float_max_sle))
  const [daily, setDaily] = useState(detail.usual.usual_daily_transactions === null ? '' : String(detail.usual.usual_daily_transactions))
  const [saving, setSaving] = useState(false)
  const num = (raw: string) => (raw.trim() === '' ? null : Math.max(0, Math.floor(Number(raw))))
  async function save() {
    setSaving(true)
    try {
      await operatorApi.setUsual(detail.ref, { usual_max_sle: num(cash), usual_float_max_sle: num(float), usual_daily_transactions: num(daily) })
      onSaved()
    } finally {
      setSaving(false)
    }
  }
  const fromRecords = detail.evidence.cash.source === 'operator'
  return (
    <Card>
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Usually handles</p>
      <p className="text-sm text-muted">{detail.evidence.cash.text}</p>
      {detail.evidence.float.source !== 'none' && <p className="text-sm text-muted">{detail.evidence.float.text}</p>}
      {fromRecords ? (
        <p className="mt-1 text-xs text-muted">From the operator's records. Your note is no longer needed.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <label className="text-sm font-semibold" htmlFor="usual-cash">
            Cash out, up to about (SLE)
            <input id="usual-cash" type="number" inputMode="numeric" min={0} value={cash} onChange={(e) => setCash(e.target.value)} className="mt-1 h-control w-full rounded-card border border-line bg-paper px-3 text-base font-normal" />
          </label>
          <label className="text-sm font-semibold" htmlFor="usual-float">
            Deposit, up to about (SLE)
            <input id="usual-float" type="number" inputMode="numeric" min={0} value={float} onChange={(e) => setFloat(e.target.value)} className="mt-1 h-control w-full rounded-card border border-line bg-paper px-3 text-base font-normal" />
          </label>
          <label className="text-sm font-semibold" htmlFor="usual-daily">
            Transactions on a usual day
            <input id="usual-daily" type="number" inputMode="numeric" min={0} value={daily} onChange={(e) => setDaily(e.target.value)} className="mt-1 h-control w-full rounded-card border border-line bg-paper px-3 text-base font-normal" />
          </label>
          <Button size="control" variant="secondary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save note'}
          </Button>
          <p className="text-xs text-muted">Sets what amounts customers are told this agent can likely handle. The figure is never shown to them, and it is replaced by the operator's records on integration.</p>
        </div>
      )}
    </Card>
  )
}
