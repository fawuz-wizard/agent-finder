import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useToast } from '@/design'
import { FinderCta, FinderHeader } from '@/features/end-user/components/finder'
import { FieldLabel, TextField } from '@/features/agent/components/agentChrome'
import { Line, PillButton, Section } from './components/dealerChrome'
import { PILL_OFF } from '@/features/agent/components/agentChrome'
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
  // Straight from registration: the one-time code came along in navigation state.
  const location = useLocation() as { state?: { code?: string } }
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

  if (state === 'loading' && !data)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 text-white">
        <FinderHeader back="/dealer/agents" title="Agent" />
        <p className="text-base font-medium text-finder-muted">Loading…</p>
      </div>
    )
  if (!data)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 text-white">
        <FinderHeader back="/dealer/agents" title="Agent" />
        <p className="text-base font-semibold text-danger">{error ?? 'We could not find that agent.'}</p>
        <Link to="/dealer/agents" className="text-base font-bold text-finder-link">
          Back to agents
        </Link>
      </div>
    )

  const d = data.declaration
  const tone = d.presence === 'open' ? 'text-finder-likely' : d.presence === 'hidden' ? 'text-warning' : 'text-finder-muted'

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-white">
      <FinderHeader back="/dealer/agents" title={data.shop_name} />
      <p className="mt-4 text-sm font-bold text-finder-muted">
        {data.ref.replace(/^Agent /, 'Code ')} · {data.area}
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <Section heading="Now">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={`text-lg font-bold leading-tight ${tone}`}>{PRESENCE_LABELS[d.presence]}</span>
            <span className="text-sm font-medium text-finder-muted">{d.age_min < 60 ? `${d.age_min} min ago` : d.freshness_text.replace('You updated this ', '')}</span>
          </div>
          <p className="text-sm font-medium text-finder-muted">{data.capacity_text}</p>
          {d.freshness === 'expired' && <p className="text-sm font-semibold text-danger">Expired — customers are not being sent here.</p>}
          <p className="text-sm font-medium text-finder-muted">
            <span className="font-bold text-white">{data.reliability.label_text}</span> · {data.reliability.text}
          </p>
        </Section>

        <Section heading={<>Float &amp; balance</>}>
          <MaskedValue agentRef={data.ref} field="balance" label="Balance" />
          <MaskedValue agentRef={data.ref} field="float" label="Float position" />
          <Line
            label="Pending request"
            value={
              data.pending_float ? (
                <Link to={`/dealer/float/${data.pending_float.id}`} className="text-finder-link">
                  {formatSle(data.pending_float.amount_sle)} · Review
                </Link>
              ) : (
                'None'
              )
            }
          />
          {!can(PERMISSIONS.viewFinancial) && <p className="text-xs font-medium text-finder-muted">Financial detail needs a permission you do not hold.</p>}
        </Section>

        {(!data.located || !data.active) && <PlacementCard detail={data} onSaved={refresh} />}
        {data.located && data.active && !data.location_confirmed && <ConfirmCard detail={data} onSaved={refresh} />}

        <Section heading="Orange record">
          <Line label="Agent code" value={data.agent_code ?? '—'} />
          <Line label="Status" value={data.active ? 'Active' : 'Inactive'} tone={data.active ? 'text-finder-likely' : 'text-danger'} />
          <Line label="Region · city" value={<>{data.region ? data.region[0]!.toUpperCase() + data.region.slice(1) : '—'} · {data.city ?? '—'}</>} />
          <Line label="On the map" value={data.located ? (data.location_confirmed ? 'Yes' : 'Pinned, not confirmed') : 'No'} />
          <Line label="Verified" value={data.verified ? 'Yes · shown to customers' : (data.verification_note ?? 'Pending · not shown to customers')} tone={data.verified ? 'text-finder-likely' : 'text-warning'} />
          <Line label="Source" value={data.source === 'orange_file' ? "Orange's file" : 'Registered in the app'} />
        </Section>

        {data.photo && <PhotoCard detail={data} onSaved={refresh} />}

        {can(PERMISSIONS.manageAgent) && <SignInCard detail={data} initialCode={location.state?.code ?? null} />}

        <UsualCard detail={data} onSaved={refresh} />

        <Section heading="Today">
          <Line label={<>Transactions <span className="text-xs">· {data.today.transactions === null ? 'not connected' : 'Orange'}</span></>} value={data.today.transactions ?? '—'} />
          <Line label="Successful" value={data.today.successful ?? '—'} />
          <Line label="Customers who found them" value={data.today.found_you} tone="text-finder-link" />
          <Line label="Reported problems" value={data.today.reported_problems} tone={data.today.reported_problems > 0 ? 'text-danger' : ''} />
        </Section>

        <Section heading="Availability today">
          {data.availability_today.length === 0 && <p className="text-sm font-medium text-finder-muted">No changes today.</p>}
          {data.availability_today.map((e, i) => (
            <Line key={i} label={e.time_text} value={e.text} tone={e.tone === 'warning' ? 'text-warning' : ''} />
          ))}
        </Section>

        <div className="flex gap-3">
          <PillButton className="flex-1" onClick={() => act('contact')} disabled={busy !== null}>
            Contact
          </PillButton>
          <PillButton tone="on" className="flex-1" onClick={() => act('nudge')} disabled={busy !== null}>
            Nudge
          </PillButton>
        </div>
        <div className="flex gap-3">
          <Link to="/dealer/attention" className={`flex h-chip flex-1 items-center justify-center rounded-pill text-base font-bold ${PILL_OFF}`}>
            History
          </Link>
          <PillButton tone="danger" className="flex-1" onClick={() => act('escalate')} disabled={busy !== null}>
            Escalate
          </PillButton>
        </div>
        <p className="text-center text-xs font-medium text-finder-muted">Every action is recorded with your name. None of them changes the agent's status.</p>
      </div>
    </div>
  )
}

/** The picture the agent put on the shop's page. Customers see it already; take it down if it is wrong. */
/**
 * The agent's sign-in, from the aggregator's side: never their PIN, only a one-time code.
 * The code is shown once, right here, to be read out in person. It opens the Choose-PIN
 * screen and nothing else, and stops working the moment the agent has chosen a PIN.
 */
function SignInCard({ detail, initialCode }: { detail: DealerAgentDetail; initialCode: string | null }) {
  const toast = useToast()
  const [code, setCode] = useState<string | null>(initialCode)
  const [busy, setBusy] = useState(false)

  async function issue() {
    setBusy(true)
    try {
      const out = await operatorApi.issueCode(detail.ref)
      setCode(out.code)
      toast.show(`New sign-in code issued for ${detail.shop_name}`)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not issue a code.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="agent-sign-in" heading="Sign-in">
      {code ? (
        <>
          <p className="text-sm font-medium text-finder-muted">One-time code for {detail.name}. Read it out in person; it is not shown again.</p>
          <p className="text-center text-3xl font-bold tracking-[0.3em] text-white" aria-label={`One-time code ${code.split('').join(' ')}`}>
            {code.slice(0, 3)} {code.slice(3)}
          </p>
          <p className="text-sm font-medium text-finder-muted">They sign in with their agent number and this code, then choose a PIN only they know. The code works once.</p>
        </>
      ) : (
        <p className="text-sm font-medium text-finder-muted">
          The agent signs in with a PIN only they know. If they forget it, issue a new one-time code: their phones are signed out and they choose
          a new PIN at the next sign-in.
        </p>
      )}
      <PillButton className="self-start" onClick={() => void issue()} disabled={busy}>
        {busy ? 'Issuing…' : code ? 'Issue another code' : 'Issue a new sign-in code'}
      </PillButton>
    </Section>
  )
}

function PhotoCard({ detail, onSaved }: { detail: DealerAgentDetail; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await operatorApi.removeAgentPhoto(detail.ref)
      toast.show(`The photo of ${detail.shop_name} is down`)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove it.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section id="shop-photo" heading="Shop photo">
      <img src={detail.photo ?? ''} alt={`${detail.shop_name}, photographed by the agent`} className="aspect-[4/3] w-full rounded-field object-cover" />
      <p className="text-sm font-medium text-finder-muted">Customers see this on the shop's page. If it is not the shop, take it down; the agent can take a new one.</p>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <PillButton className="self-start" onClick={remove} disabled={busy}>
        {busy ? 'Removing…' : 'Remove photo'}
      </PillButton>
    </Section>
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
    <Section id="confirm-location" heading="Pin waiting for your confirmation" tone="warning">
      <p className="text-sm font-medium">
        The agent pinned the shop at <b>{detail.area}</b>. Customers are not sent there until you confirm it is right.
      </p>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <PillButton tone="on" className="self-start" onClick={confirm} disabled={busy}>
        {busy ? 'Confirming…' : 'Confirm this location'}
      </PillButton>
    </Section>
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
      <Section heading="Not shown to customers" tone="danger">
        <p className="text-sm font-medium">This agent is marked inactive at Orange. Customers cannot find them until Orange's record changes.</p>
      </Section>
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
  return (
    <Section id="place-agent" heading="Not on the map yet" tone="warning">
      <p className="text-sm font-medium">Customers cannot find this shop until it has a location. Stand at the shop and use the phone's position, or type the coordinates.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor="place-lat">Latitude</FieldLabel>
          <TextField id="place-lat" value={lat} inputMode="decimal" placeholder="8.4700" onChange={(e) => setLat(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor="place-lng">Longitude</FieldLabel>
          <TextField id="place-lng" value={lng} inputMode="decimal" placeholder="-13.2600" onChange={(e) => setLng(e.target.value)} />
        </div>
      </div>
      <PillButton className="self-start" onClick={useMyLocation} disabled={locating}>
        {locating ? 'Reading location…' : 'Use my location'}
      </PillButton>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <FinderCta onClick={save} disabled={saving || !lat || !lng}>
        {saving ? 'Saving…' : 'Pin this shop'}
      </FinderCta>
    </Section>
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
    <Section heading="Usually handles">
      <p className="text-sm font-medium text-finder-muted">{detail.evidence.cash.text}</p>
      {detail.evidence.float.source !== 'none' && <p className="text-sm font-medium text-finder-muted">{detail.evidence.float.text}</p>}
      {fromRecords ? (
        <p className="text-xs font-medium text-finder-muted">From the operator's records. Your note is no longer needed.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="usual-cash">Cash out, up to about (SLE)</FieldLabel>
            <TextField id="usual-cash" type="number" inputMode="numeric" min={0} value={cash} onChange={(e) => setCash(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="usual-float">Cash in, up to about (SLE)</FieldLabel>
            <TextField id="usual-float" type="number" inputMode="numeric" min={0} value={float} onChange={(e) => setFloat(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor="usual-daily">Transactions on a usual day</FieldLabel>
            <TextField id="usual-daily" type="number" inputMode="numeric" min={0} value={daily} onChange={(e) => setDaily(e.target.value)} />
          </div>
          <PillButton className="self-start" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save note'}
          </PillButton>
          <p className="text-xs font-medium text-finder-muted">Sets what amounts customers are told this agent can likely handle. The figure is never shown to them, and it is replaced by the operator's records on integration.</p>
        </div>
      )}
    </Section>
  )
}
