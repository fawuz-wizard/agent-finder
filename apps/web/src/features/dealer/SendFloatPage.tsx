import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, CircleCheck, Smartphone } from 'lucide-react'
import { useAsync } from '@/hooks/useAsync'
import { LoadError } from '@/design'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { DealerAgentRow, FloatRequest, FloatSend } from '@/types/operator'
import { formatSle } from '@/features/agent/money'
import { ScreenTitle } from './components/designKit'
import { CARD, OUTLINE, PAGE, SOLID } from './components/designClasses'

const QUICK = [5_000, 10_000, 20_000]
const last8 = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').slice(-8)
/** 76000031 → 76 000 031, as Sierra Leone numbers are written. */
const spaced = (d: string) => [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8)].filter(Boolean).join(' ')
const newToken = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)

/**
 * Send float: the agent (their number, matched to one of yours), the amount, the Orange Money
 * reference from the SMS when you have it. The money moves in Orange Money; this records it,
 * completes the request it answers and tells the agent. ?request=<id> or ?agent=<ref> fills it.
 */
export default function SendFloatPage() {
  const navigate = useNavigate()
  const { session } = useSession()
  const [params] = useSearchParams()
  const agents = useAsync<DealerAgentRow[]>((s) => operatorApi.dealerAgents(s))
  const requests = useAsync<FloatRequest[]>((s) => operatorApi.floatRequests(null, s))
  const request = (requests.data ?? []).find((r) => r.id === params.get('request') && (r.state === 'pending' || r.state === 'approved')) ?? null
  const preset = request?.agent_ref ?? params.get('agent')
  const presetAgent = (agents.data ?? []).find((a) => a.ref === preset) ?? null

  const [number, setNumber] = useState<string | null>(null)
  const [amount, setAmount] = useState<string | null>(null)
  const [omRef, setOmRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token] = useState(newToken)
  const [done, setDone] = useState<FloatSend | null>(null)

  // Until the aggregator types, the fields show what the request or the link brought.
  const shownNumber = number ?? (presetAgent?.phone ? last8(presetAgent.phone) : '')
  const shownAmount = amount ?? (request ? String(request.amount_sle) : '')
  const digits = shownNumber.replace(/\D/g, '')
  const match = useMemo(() => (digits.length === 8 ? (agents.data ?? []).find((a) => last8(a.phone) === digits) ?? null : null), [digits, agents.data])
  const agent = match ?? (number === null ? presetAgent : null)
  const value = Number(shownAmount.replace(/\D/g, ''))
  const linked = request && agent && request.agent_ref === agent.ref ? request : null
  const ready = !!agent && value >= 100 && !busy

  async function record() {
    if (!agent || !ready) return
    setBusy(true)
    setError(null)
    try {
      setDone(await operatorApi.sendFloat({ agent_ref: agent.ref, amount_sle: value, om_reference: omRef.trim() || null, request_id: linked?.id ?? null, client_token: token }, session?.name ?? 'Aggregator'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record that.')
    } finally {
      setBusy(false)
    }
  }

  if (done)
    return (
      <div className={PAGE}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-2 text-center" role="status">
          <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-design-good-tint text-finder-likely-ink">
            <Check size={42} strokeWidth={2.6} aria-hidden />
          </span>
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">Float recorded</h1>
          <p className="text-[15px] leading-normal text-finder-muted">
            {formatSle(done.amount_sle)} to <b className="text-finder-ink">{done.agent_name}</b>
            <br />
            {done.om_reference ? `Ref ${done.om_reference} · ` : ''}
            {new Date(done.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <div className={`${CARD} mt-2 w-full py-1 text-left`}>
            <div className="flex items-center justify-between px-[18px] py-3.5">
              <span className="text-[13px] text-finder-muted">Request</span>
              <span className="text-sm font-extrabold">{done.request_id ? 'Completed' : 'No request linked'}</span>
            </div>
            <div className="flex items-center justify-between border-t border-finder-card-line px-[18px] py-3.5">
              <span className="text-[13px] text-finder-muted">Agent told in the app</span>
              <span className="text-sm font-extrabold">Yes</span>
            </div>
          </div>
        </div>
        <button type="button" className={SOLID} onClick={() => navigate('/dealer/float?tab=history')}>
          Done
        </button>
        <Link to="/dealer/float/send" reloadDocument className={`${OUTLINE} h-[46px] text-sm`}>
          Send another
        </Link>
      </div>
    )

  return (
    <div className={PAGE}>
      <ScreenTitle title="Send float" back="/dealer/float" />

      <div className="flex flex-col gap-2">
        <label htmlFor="send-number" className="text-[13px] font-bold text-finder-muted">
          Agent number
        </label>
        <div className="flex h-14 items-center gap-3 rounded-[14px] bg-finder-card px-4 focus-within:outline focus-within:outline-2 focus-within:outline-finder-link">
          <span className="text-base font-bold">+232</span>
          <span aria-hidden="true" className="h-6 w-px bg-design-field-line" />
          <input
            id="send-number"
            value={spaced(digits)}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="76X XXX XXX"
            inputMode="numeric"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold tracking-[0.04em] outline-none placeholder:text-finder-muted"
          />
        </div>
        <p className="flex min-h-4 items-center gap-1.5 text-xs font-semibold" aria-live="polite">
          {agent ? (
            <span className="flex items-center gap-1.5 text-finder-likely-ink">
              <CircleCheck size={14} strokeWidth={2.2} aria-hidden />
              {agent.name} · {agent.ref.replace(/^Agent /, 'Code ')} · your agent
            </span>
          ) : digits.length === 8 && agents.data ? (
            <span className="text-danger">That number is not one of your agents.</span>
          ) : null}
        </p>
        {agents.state === 'error' && !agents.data && <LoadError what="your agents" error={agents.error} onRetry={agents.refresh} />}
      </div>

      <div className={`${CARD} flex flex-col items-center gap-1.5 px-[18px] py-6`}>
        <label htmlFor="send-amount" className="text-[13px] font-semibold text-finder-muted">
          Amount (SLE)
        </label>
        <input
          id="send-amount"
          value={value ? value.toLocaleString('en-US') : ''}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))}
          placeholder="0"
          inputMode="numeric"
          autoComplete="off"
          className="w-full bg-transparent text-center text-[40px] font-extrabold tracking-[-0.02em] outline-none placeholder:text-finder-muted"
        />
        <span className="text-xs font-semibold text-finder-muted">{linked ? `For the request of ${linked.waiting_text} ago` : 'No request linked'}</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => setAmount(String(q))} aria-pressed={value === q} className={`flex h-11 items-center justify-center rounded-xl text-sm font-bold ${value === q ? 'bg-finder-tile text-finder-link outline outline-[1.5px] outline-finder-accent' : 'bg-finder-card'}`}>
            {q.toLocaleString('en-US')}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="send-ref" className="text-[13px] font-bold text-finder-muted">
          Orange Money reference <span className="font-semibold">(optional, from your SMS)</span>
        </label>
        <input
          id="send-ref"
          value={omRef}
          onChange={(e) => setOmRef(e.target.value.slice(0, 40))}
          placeholder="e.g. MP2910.1432"
          autoComplete="off"
          className="h-14 rounded-[14px] bg-finder-card px-4 text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-finder-muted focus:outline focus:outline-2 focus:outline-finder-link"
        />
      </div>

      <p className="flex gap-2.5 rounded-[14px] bg-finder-tile px-3.5 py-3 text-[13px] leading-snug text-finder-ink">
        <Smartphone size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-finder-link" aria-hidden />
        Send the float in Orange Money as usual. This records it{linked ? ', completes the request' : ''} and tells the agent. The app never moves money.
      </p>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <button type="button" disabled={!ready} onClick={() => void record()} className={`${SOLID} mt-auto disabled:opacity-55`}>
        {busy ? 'Recording…' : `Record ${value ? formatSle(value) : 'float'} sent`}
      </button>
    </div>
  )
}
