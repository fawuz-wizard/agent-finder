import { useId, useState } from 'react'
import { useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentProfile } from '@/types/operator'
import { FinderCta, FinderSheet } from '@/features/end-user/components/finder'
import { FieldLabel, PILL_OFF, PILL_ON, Switch, TextField } from './components/agentChrome'
import { AgentTitle } from './components/agentKit'
import { BOX } from './components/agentClasses'

const MISTAKE_FIELDS = [
  ['name', 'Name'],
  ['agent_code', 'Agent code'],
  ['address', 'Address'],
  ['city', 'City'],
  ['region', 'Region'],
  ['aggregator', 'Aggregator'],
  ['status', 'Status at Orange'],
  ['other', 'Something else'],
] as const

function Line({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-agent-divider px-4 py-3 text-sm first:border-t-0">
      <span className="shrink-0 text-finder-muted">{label}</span>
      <b className={`text-right font-semibold ${tone}`}>{value}</b>
    </div>
  )
}

/**
 * Personal Information, a page of its own from Profile: who the agent is, read only. Orange's
 * record and the agent's place in Agent Finder (the agent number, the aggregator, verified),
 * with a way to report a mistake to the aggregator, who corrects it with Orange. The shop's
 * photo, pin and hours live on Your shop, from Service Status.
 */
export default function PersonalInfoPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const toast = useToast()
  const ids = useId()
  const { data, setData, state, error } = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])
  const [open, setOpen] = useState(false)
  const [field, setField] = useState<(typeof MISTAKE_FIELDS)[number][0]>('address')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  async function send() {
    if (text.trim().length < 3) {
      setSendError('Say what is wrong, in a few words.')
      return
    }
    setBusy(true)
    setSendError(null)
    try {
      await operatorApi.reportMistake(ref, field, text.trim())
      setOpen(false)
      setText('')
      toast.show('Sent to your aggregator. They correct it with Orange.')
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Could not send that.')
    } finally {
      setBusy(false)
    }
  }

  const region = data?.region ? data.region[0]!.toUpperCase() + data.region.slice(1) : null
  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <AgentTitle title="Personal Information" back="/agent/profile" />
      <div className="flex flex-col gap-3 px-[18px] pb-8 pt-5">
        {state === 'loading' && !data && <p className="text-sm text-finder-muted">Loading…</p>}
        {state === 'error' && <p className="text-sm font-semibold text-danger">{error}</p>}
        {data && (
          <>
            <div className={`${BOX} flex flex-col`} aria-label="Your record">
              <Line label="Name" value={data.name} />
              <Line label="Phone" value={data.phone_masked ?? '—'} />
              <div className="flex items-center gap-3 border-t border-agent-divider bg-finder-tile px-4 py-3">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-bold">Customers may call me</span>
                  <span className="text-xs text-finder-muted">Shows a Call button on your shop. They never see your balance or your float.</span>
                </span>
                <Switch on={data.phone_visible} label="Customers may call me" onChange={(next) => void operatorApi.setPhoneVisible(ref, next).then(setData)} />
              </div>
              <Line label="Shop" value={data.shop_name} />
              <Line label="Agent number" value={data.ref.replace(/^Agent /, '')} />
              <Line label="Orange agent code" value={data.agent_code ?? '—'} />
              <Line label="Aggregator" value={data.dealer_name || '—'} />
              <Line label="Address" value={[data.street || data.area, data.city, region].filter(Boolean).join(', ')} />
              <Line label="Status at Orange" value={data.active ? 'Active' : 'Inactive'} tone={data.active ? 'text-agent-green-ink' : 'text-danger'} />
              <Line label="Verified" value={data.verified ? 'Yes · shown to customers' : 'Pending · not shown to customers'} tone={data.verified ? 'text-agent-green-ink' : 'text-warning'} />
            </div>
            <button type="button" onClick={() => setOpen(true)} className="flex h-11 items-center self-start text-sm font-bold text-finder-link">
              Report a mistake
            </button>
            <p className="text-xs text-finder-muted">As Orange holds it. The app never changes it; your aggregator corrects it with Orange.</p>
          </>
        )}
      </div>

      <FinderSheet open={open} onClose={() => setOpen(false)} title="Report a mistake">
        <p className="text-sm font-medium text-finder-muted">Goes to your aggregator, who corrects it with Orange. The app never edits the record itself.</p>
        <div role="radiogroup" aria-label="Which part is wrong?" className="flex flex-wrap gap-2">
          {MISTAKE_FIELDS.map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={field === key} onClick={() => setField(key)} className={`h-chip rounded-pill px-4 text-sm font-bold ${field === key ? PILL_ON : PILL_OFF}`}>
              {label}
            </button>
          ))}
        </div>
        <FieldLabel htmlFor={`${ids}-mistake`}>What is wrong</FieldLabel>
        <TextField id={`${ids}-mistake`} value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} placeholder="e.g. We moved to Lumley Beach Road" />
        {sendError && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {sendError}
          </p>
        )}
        <FinderCta onClick={() => void send()} disabled={busy}>
          {busy ? 'Sending…' : 'Send to my aggregator'}
        </FinderCta>
      </FinderSheet>
    </div>
  )
}
