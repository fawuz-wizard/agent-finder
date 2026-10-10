import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Card, useToast, AppBar } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS, PRESENCE_LABELS } from '@/types/operator'
import type { DealerAction, DealerAgentDetail } from '@/types/operator'
import { formatSle } from '@/features/agent/money'
import { MaskedValue } from './components/MaskedValue'
import { locationErrorText } from '@/lib/location'


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
      <AppBar back="/dealer/agents" title={data.shop_name} subtitle={<>{data.ref.replace(/^Agent /, 'Code ')} · {data.area}</>} />

      <div className="flex flex-col gap-3 p-4 pb-6">
        <Card>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={`text-lg font-bold leading-tight ${tone}`}>{PRESENCE_LABELS[d.presence]}</span>
            <span className="text-sm text-muted">{d.age_min < 60 ? `${d.age_min} min ago` : d.freshness_text.replace('You updated this ', '')}</span>
          </div>
          <p className="mt-1 text-sm text-muted">{data.capacity_text}</p>
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

        {(!data.located || !data.active) && <PlacementCard detail={data} onSaved={refresh} />}
        {data.located && data.active && !data.location_confirmed && <ConfirmCard detail={data} onSaved={refresh} />}

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Orange record</p>
          <div className="grid grid-cols-2 gap-x-4">
            <p className="text-sm text-muted">Agent code</p>
            <p className="text-right text-sm font-bold">{data.agent_code ?? '—'}</p>
            <p className="text-sm text-muted">Status</p>
            <p className={`text-right text-sm font-bold ${data.active ? 'text-success' : 'text-danger'}`}>{data.active ? 'Active' : 'Inactive'}</p>
            <p className="text-sm text-muted">Region · city</p>
            <p className="text-right text-sm font-bold">
              {data.region ? data.region[0]!.toUpperCase() + data.region.slice(1) : '—'} · {data.city ?? '—'}
            </p>
            <p className="text-sm text-muted">On the map</p>
            <p className="text-right text-sm font-bold">{data.located ? (data.location_confirmed ? 'Yes' : 'Pinned, not confirmed') : 'No'}</p>
            <p className="text-sm text-muted">Source</p>
            <p className="text-right text-sm font-bold">{data.source === 'orange_file' ? "Orange's file" : 'Registered in the app'}</p>
          </div>
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
          {data.availability_today.length === 0 && <p className="py-1 text-sm text-muted">No changes today.</p>}
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

/** The agent pinned the shop from the phone. Nobody is sent there until the aggregator confirms. */
function ConfirmCard({ detail, onSaved }: { detail: DealerAgentDetail; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await operatorApi.confirmLocation(detail.ref)
      toast.show(`${detail.shop_name} is on the map`)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="border-warning bg-warning-tint/40" aria-labelledby="confirm-location">
      <p id="confirm-location" className="text-xs font-bold uppercase tracking-wider text-muted">Pin waiting for your confirmation</p>
      <p className="text-sm">
        The agent pinned the shop at <b>{detail.area}</b>. Customers are not sent there until you confirm it is right.
      </p>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <Button size="control" className="mt-1" onClick={confirm} disabled={busy}>
        {busy ? 'Confirming…' : 'Confirm this location'}
      </Button>
    </Card>
  )
}

/**
 * An agent with no point on the map (every agent from Orange's file arrives this way) is never
 * shown to customers. The dealer pins the shop here: standing at it with the phone, or by
 * typing the coordinates. An agent inactive at Orange is shown the reason and nothing else.
 */
function PlacementCard({ detail, onSaved }: { detail: DealerAgentDetail; onSaved: () => void }) {
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!detail.active) {
    return (
      <Card className="border-warning/40 bg-warning-tint/40">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Not shown to customers</p>
        <p className="text-sm">This agent is marked inactive at Orange. Customers cannot find them until Orange's record changes.</p>
      </Card>
    )
  }
  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('This phone cannot share its location. Type the coordinates instead.')
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5))
        setLng(pos.coords.longitude.toFixed(5))
        setLocating(false)
      },
      (err) => {
        setError(locationErrorText(err, 'Could not read the location. Type the coordinates instead.'))
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  }
  async function save() {
    setSaving(true)
    setError(null)
    try {
      await operatorApi.editAgent(detail.ref, { lat: Number(lat), lng: Number(lng) })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the location.')
    } finally {
      setSaving(false)
    }
  }
  const field = 'mt-1 h-control w-full rounded-card border border-line bg-paper px-3 text-base font-normal'
  return (
    <Card className="border-warning/40 bg-warning-tint/40" aria-labelledby="place-agent">
      <p id="place-agent" className="text-xs font-bold uppercase tracking-wider text-muted">Not on the map yet</p>
      <p className="text-sm">Customers cannot find this shop until it has a location. Stand at the shop and use the phone's position, or type the coordinates.</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-sm font-semibold" htmlFor="place-lat">
          Latitude
          <input id="place-lat" value={lat} inputMode="decimal" placeholder="8.4700" onChange={(e) => setLat(e.target.value)} className={field} />
        </label>
        <label className="text-sm font-semibold" htmlFor="place-lng">
          Longitude
          <input id="place-lng" value={lng} inputMode="decimal" placeholder="-13.2600" onChange={(e) => setLng(e.target.value)} className={field} />
        </label>
      </div>
      <Button size="control" variant="secondary" className="mt-2" onClick={useMyLocation} disabled={locating}>
        {locating ? 'Reading location…' : 'Use my location (stand at the shop)'}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <Button size="control" className="mt-2" onClick={save} disabled={saving || !lat || !lng}>
        {saving ? 'Saving…' : 'Pin this shop'}
      </Button>
    </Card>
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
            Cash in, up to about (SLE)
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
