import { useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { BellRing, ChevronDown, Ellipsis, Navigation, Phone, TriangleAlert, Wallet } from 'lucide-react'
import { useToast } from '@/design'
import { FinderCta } from '@/features/end-user/components/finder'
import { FieldLabel, Line as ActionLine, TextField } from '@/features/agent/components/agentChrome'
import { Block, Line, PillButton } from './components/dealerChrome'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS } from '@/types/operator'
import type { DealerAction, DealerAgentDetail } from '@/types/operator'
import { formatSle } from '@/features/agent/money'
import { MaskedValue } from './components/MaskedValue'
import { PinMap } from './components/PinMap'
import { Pill, RowAvatar, ScreenTitle } from './components/designKit'
import { CARD, PAGE } from './components/designClasses'
import { agentState, mapBlock } from './components/agentState'
import { locationErrorText } from '@/lib/location'

/** A row that opens in place: its title, a short summary while closed, the details when open. */
function Fold({ id, title, summary, open, onToggle, children }: { id: string; title: string; summary: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="border-t border-finder-card-line first:border-t-0">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className="flex min-h-[48px] w-full items-center justify-between gap-3 py-2 text-left">
        <span className="text-[15px] font-bold">{title}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-finder-muted">
          {!open && <span className="truncate">{summary}</span>}
          <ChevronDown size={18} strokeWidth={2.2} aria-hidden className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-4 pb-4">
          {children}
        </div>
      )}
    </section>
  )
}

/** One thing waiting for the aggregator: an icon, what it is, and the link that deals with it. */
function NeedRow({ icon, title, sub, to, go, danger = false }: { icon: ReactNode; title: string; sub: string; to: string; go: string; danger?: boolean }) {
  return (
    <Link to={to} className="flex min-h-[52px] items-center gap-3 border-t border-finder-card-line py-2 first:border-t-0">
      <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${danger ? 'bg-design-bad-tint text-danger' : 'bg-finder-tile text-finder-link'}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-snug">{title}</span>
        <span className="block text-[13px] text-finder-muted">{sub}</span>
      </span>
      <span className="shrink-0 text-sm font-bold text-finder-link">{go} ›</span>
    </Link>
  )
}

const SECTION = 'text-xs font-extrabold uppercase tracking-[0.06em] text-finder-muted'
/** The header's three equal buttons: icon over one word, 60 px tall. */
const HEAD_BTN = 'flex h-[60px] flex-col items-center justify-center gap-1 rounded-[14px] px-1 text-[13px] font-extrabold max-[359px]:text-xs transition-transform duration-150 active:scale-[0.97] disabled:opacity-60'
const PAGE_TIGHT = PAGE.replace('gap-5', 'gap-4')

/**
 * One agent, as the aggregator opens them from the list: what to act on first, on one screen.
 * Who and how to reach them (the same state as the list, Call and Nudge), what needs the
 * aggregator, today in three numbers, and how customers see them in words. The Orange record,
 * the masked money, and more details (what raises the listing, today's changes, the photo, the
 * sign-in code, the usual-amount note) fold underneath; history, a new code, the note and
 * Escalate are also in the ••• menu. Every action is logged with the dealer's name; none of
 * them changes the agent's availability.
 */
export default function DealerAgentDetailPage() {
  const { ref = '' } = useParams()
  const { session, can } = useSession()
  const toast = useToast()
  // Straight from registration: the one-time code came along in navigation state.
  const location = useLocation() as { state?: { code?: string } }
  const { state, data, error, refresh } = useAsync<DealerAgentDetail>((s) => operatorApi.dealerAgent(ref, s), [ref])
  const [busy, setBusy] = useState<DealerAction | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({ more: Boolean(location.state?.code) })
  const [menu, setMenu] = useState(false)
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }))

  async function act(action: DealerAction) {
    setBusy(action)
    try {
      const logged = await operatorApi.act(ref, action, session?.name ?? 'Dealer')
      toast.show(logged.note)
    } finally {
      setBusy(null)
    }
  }

  /** From the ••• menu: open More details and bring one card into view. */
  function reveal(anchor: string) {
    setMenu(false)
    setOpen((o) => ({ ...o, more: true }))
    window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  if (state === 'loading' && !data)
    return (
      <div className={PAGE}>
        <ScreenTitle title="Agent" back="/dealer/agents" />
        <p className="text-base font-medium text-finder-muted">Loading…</p>
      </div>
    )
  if (!data)
    return (
      <div className={PAGE}>
        <ScreenTitle title="Agent" back="/dealer/agents" />
        <p className="text-base font-semibold text-danger">{error ?? 'We could not find that agent.'}</p>
        <Link to="/dealer/agents" className="text-base font-bold text-finder-link">
          Back to agents
        </Link>
      </div>
    )

  const st = agentState({ active: data.active, bucket: data.bucket, presence: data.declaration.presence })
  const block = mapBlock(data)
  const t = data.today
  const regionText = data.region ? data.region[0]!.toUpperCase() + data.region.slice(1) : 'No region'
  const needs: ReactNode[] = []
  if (data.pending_float)
    needs.push(<NeedRow key="float" icon={<Wallet size={18} strokeWidth={2} />} title={`Float request ${formatSle(data.pending_float.amount_sle)}`} sub={`asked ${data.pending_float.waiting_text} ago`} to={`/dealer/float/${data.pending_float.id}`} go="Review" />)
  if (t.reported_problems > 0)
    needs.push(<NeedRow key="problems" danger icon={<TriangleAlert size={18} strokeWidth={2} />} title={`${t.reported_problems} ${t.reported_problems === 1 ? 'customer' : 'customers'} not served today`} sub="from visit reports" to={`/dealer/agents/${encodeURIComponent(data.ref)}/reports`} go="See" />)
  else if (data.open_signals > 0)
    needs.push(<NeedRow key="signals" danger icon={<TriangleAlert size={18} strokeWidth={2} />} title={`${data.open_signals} ${data.open_signals === 1 ? 'thing' : 'things'} to look into`} sub="on the Attention screen" to="/dealer/attention" go="See" />)
  const pinCard = (!data.located || !data.active) ? <PlacementCard detail={data} onSaved={refresh} /> : !data.location_confirmed ? <ConfirmCard detail={data} onSaved={refresh} /> : null

  return (
    <div className={PAGE_TIGHT}>
      <ScreenTitle
        title="Agent"
        back="/dealer/agents"
        action={
          <div className="relative">
            <button type="button" aria-label="More actions" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-finder-card text-finder-ink">
              <Ellipsis size={20} strokeWidth={2.4} aria-hidden />
            </button>
            {menu && (
              <>
                <button type="button" aria-label="Close the menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
                <div role="menu" className="absolute right-0 top-12 z-20 flex w-56 flex-col rounded-2xl bg-finder-card py-1.5 shadow-lg">
                  <Link role="menuitem" to="/dealer/attention" className="px-4 py-3 text-sm font-bold">
                    Action history
                  </Link>
                  {can(PERMISSIONS.manageAgent) && (
                    <button role="menuitem" type="button" onClick={() => reveal('agent-sign-in')} className="px-4 py-3 text-left text-sm font-bold">
                      Issue a new sign-in code
                    </button>
                  )}
                  <button role="menuitem" type="button" onClick={() => reveal('agent-note')} className="px-4 py-3 text-left text-sm font-bold">
                    Edit my note
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      setMenu(false)
                      void act('escalate')
                    }}
                    className="px-4 py-3 text-left text-sm font-bold text-danger"
                  >
                    Escalate to Orange
                  </button>
                </div>
              </>
            )}
          </div>
        }
      />

      <div className={`${CARD} flex flex-col gap-4 p-4`}>
        <div className="flex items-center gap-3">
          <RowAvatar name={data.shop_name} index={0} />
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold leading-tight">{data.shop_name}</h2>
            <p className="text-[13px] text-finder-muted">
              {data.ref.replace(/^Agent /, '')} · {data.area}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Pill tone={st.tone}>
                {st.text} · {data.freshness_text}
              </Pill>
              {block && <Pill tone="warn">{block}</Pill>}
            </div>
          </div>
        </div>
        {/* Three equal buttons, each an icon over one word, so they line up on any phone. */}
        <div className="grid grid-cols-3 gap-2.5">
          {data.call_url ? (
            <a href={data.call_url} onClick={() => void act('contact')} className={`${HEAD_BTN} bg-finder-accent text-finder-on-orange`}>
              <Phone size={20} strokeWidth={2.2} aria-hidden />
              Call
            </a>
          ) : (
            <button type="button" onClick={() => void act('contact')} disabled={busy !== null} className={`${HEAD_BTN} bg-finder-accent text-finder-on-orange`}>
              <Phone size={20} strokeWidth={2.2} aria-hidden />
              Contact
            </button>
          )}
          {data.located && data.location_confirmed ? (
            <Link to={`/dealer/network/map?focus=${encodeURIComponent(data.ref)}&route=1`} className={`${HEAD_BTN} border-[1.5px] border-finder-accent text-finder-link`}>
              <Navigation size={20} strokeWidth={2.2} aria-hidden />
              Directions
            </Link>
          ) : (
            <span aria-disabled="true" title="Not on the map yet" className={`${HEAD_BTN} border-[1.5px] border-finder-card-line text-finder-muted`}>
              <Navigation size={20} strokeWidth={2.2} aria-hidden />
              Not on map
            </span>
          )}
          <button type="button" onClick={() => void act('nudge')} disabled={busy !== null} className={`${HEAD_BTN} border-[1.5px] border-finder-accent text-finder-link`}>
            <BellRing size={20} strokeWidth={2.2} aria-hidden />
            Nudge
          </button>
        </div>
      </div>

      {(needs.length > 0 || pinCard) && (
        <section aria-labelledby="needs-you" className="flex flex-col gap-2">
          <h2 id="needs-you" className={SECTION}>
            Needs you
          </h2>
          {needs.length > 0 && <div className={`${CARD} px-4 py-1`}>{needs}</div>}
          {pinCard && <div className={`${CARD} p-4`}>{pinCard}</div>}
        </section>
      )}

      <section aria-labelledby="today" className="flex flex-col gap-2">
        <h2 id="today" className={SECTION}>
          Today
        </h2>
        <div className="grid grid-cols-3 gap-2.5">
          {(
            [
              ['Transactions', t.transactions ?? '—', ''],
              ['Found them', t.found_you, ''],
              ['Problems', t.reported_problems, t.reported_problems > 0 ? 'text-danger' : ''],
            ] as const
          ).map(([label, value, tone]) => (
            <div key={label} className={`${CARD} flex flex-col px-3 py-2.5`}>
              <span className={`text-xl font-extrabold leading-tight ${tone}`}>{value}</span>
              <span className="text-xs font-semibold text-finder-muted">{label}</span>
            </div>
          ))}
        </div>
        {t.transactions === null && <p className="-mt-1 text-xs font-medium text-finder-muted">Transactions: Orange’s records are not connected yet.</p>}
      </section>

      <section aria-labelledby="seen" className="flex flex-col gap-2">
        <h2 id="seen" className={SECTION}>
          How customers see them
        </h2>
        <div className={`${CARD} px-4 py-3 text-sm leading-relaxed`}>
          {data.seen_as ? (
            data.seen_as.sides.map((s) => (
              <p key={s.label}>
                <b>{s.label}:</b> {s.phrase}
              </p>
            ))
          ) : (
            <p>{data.customers_see?.headline ?? data.capacity_text}</p>
          )}
          <p className="mt-1 text-[13px] text-finder-muted">
            <b className="text-finder-ink">{data.reliability.label_text}</b> · {data.reliability.text}
          </p>
          <Link to={`/dealer/agents/${encodeURIComponent(data.ref)}/reports`} className="mt-1 flex min-h-[40px] items-center text-sm font-bold text-finder-link">
            Customer reports ›
          </Link>
        </div>
      </section>

      <div className={`${CARD} px-4`}>
        <Fold id="fold-orange" title="Orange record" summary={`${data.active ? 'Active' : 'Inactive'} · ${regionText}`} open={!!open.orange} onToggle={() => toggle('orange')}>
          <div>
            <Line label="Orange agent code" value={data.agent_code ?? (data.source === 'orange_file' ? 'Not given' : 'Not in Orange’s file')} />
            <Line label="Status at Orange" value={data.active ? 'Active' : 'Inactive'} tone={data.active ? 'text-finder-likely' : 'text-danger'} />
            <Line label="Region · town" value={`${regionText} · ${data.city ?? 'No town'}`} />
            <Line label="On the customer map" value={data.located ? (data.location_confirmed ? 'Yes, confirmed' : 'Pinned, not confirmed') : 'No'} />
            <Line label="Verified" value={data.verified ? 'Yes · shown to customers' : (data.verification_note ?? 'Pending · not shown to customers')} tone={data.verified ? 'text-finder-likely' : 'text-warning'} />
            <Line label="Source" value={data.source === 'orange_file' ? "Orange's file" : 'Registered in the app'} />
          </div>
        </Fold>
        <Fold id="fold-money" title="Money" summary="hidden · Reveal" open={!!open.money} onToggle={() => toggle('money')}>
          <div>
            <MaskedValue agentRef={data.ref} field="balance" label="Balance" />
            <MaskedValue agentRef={data.ref} field="float" label="Float position" />
            {!can(PERMISSIONS.viewFinancial) && <p className="text-xs font-medium text-finder-muted">Financial detail needs a permission you do not hold.</p>}
          </div>
        </Fold>
        <Fold id="fold-more" title="More details" summary="sign-in, hours, note" open={!!open.more} onToggle={() => toggle('more')}>
          {data.seen_as && data.seen_as.why.length > 0 && (
            <Block heading="What would raise the listing">
              {data.seen_as.why.map((w) => (
                <p key={w.title} className="text-sm font-medium">
                  <b>{w.title}</b> <span className="text-finder-muted">{w.detail}</span>
                </p>
              ))}
            </Block>
          )}
          <Block heading="Today’s changes">
            {t.successful !== null && <Line label="Successful transactions" value={t.successful} />}
            {data.availability_today.length === 0 && <p className="text-sm font-medium text-finder-muted">No changes today.</p>}
            {data.availability_today.map((e, i) => (
              <Line key={i} label={e.time_text} value={e.text} tone={e.tone === 'warning' ? 'text-warning' : ''} />
            ))}
          </Block>
          {data.photo && <PhotoCard detail={data} onSaved={refresh} />}
          {can(PERMISSIONS.manageAgent) && <SignInCard detail={data} initialCode={location.state?.code ?? null} />}
          <UsualCard detail={data} onSaved={refresh} />
        </Fold>
      </div>

      <p className="text-center text-xs font-medium text-finder-muted">Every action is recorded with your name. None of them changes the agent’s status.</p>
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
    <Block id="agent-sign-in" heading="Sign-in">
      <ActionLine
        label="One-time code"
        action={
          <button type="button" onClick={() => void issue()} disabled={busy} className="flex h-control items-center text-base font-bold text-finder-link disabled:opacity-60">
            {busy ? 'Issuing…' : code ? 'Issue another code' : 'Issue a new sign-in code'}
          </button>
        }
      />
      {code ? (
        <>
          <p className="py-2 text-center text-2xl font-bold tracking-[0.3em] text-finder-ink" aria-label={`One-time code ${code.split('').join(' ')}`}>
            {code.slice(0, 3)} {code.slice(3)}
          </p>
          <p className="text-sm font-medium text-finder-muted">
            For {detail.name}. Read it out in person; it is not shown again. They sign in with their number and this code, then choose a PIN only they know. The code works once.
          </p>
        </>
      ) : (
        <p className="text-xs font-medium text-finder-muted">The agent signs in with a PIN only they know. A new code signs their phones out; they choose a new PIN at the next sign-in.</p>
      )}
    </Block>
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
    <Block id="shop-photo" heading="Shop photo">
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
    </Block>
  )
}

/** Freetown, for a map with no point yet. */
const FREETOWN = { lat: 8.4657, lng: -13.2317 }

/**
 * The agent pinned the shop from the phone. Nobody is sent there until the aggregator
 * confirms. The pin is shown on the map; Move it lets the aggregator drag the map under the
 * pin and confirm the corrected point in one go.
 */
function ConfirmCard({ detail, onSaved }: { detail: DealerAgentDetail; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [point, setPoint] = useState({ lat: detail.lat ?? FREETOWN.lat, lng: detail.lng ?? FREETOWN.lng })
  // Only a drag counts as a move: a detail without a point falls back to Freetown for the
  // map, and that fallback must never be saved as the shop's place.
  const [moved, setMoved] = useState(false)
  const toast = useToast()
  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      if (moved) await operatorApi.editAgent(detail.ref, { lat: point.lat, lng: point.lng })
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
    <Block id="confirm-location" heading="Pin waiting for your confirmation" tone="warning">
      <p className="text-sm font-medium">
        The agent pinned the shop at <b>{detail.area}</b>. Customers are not sent there until you confirm it is right.
      </p>
      <PinMap
        lat={point.lat}
        lng={point.lng}
        mode={moving ? 'move' : 'view'}
        onMove={(pt) => {
          setPoint(pt)
          setMoved(true)
        }}
        label={`${detail.shop_name}, pinned by the agent`}
      />
      {moving && <p className="text-xs font-medium text-finder-muted">Drag the map until the pin sits on the shop, then confirm.</p>}
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <PillButton tone="on" className="flex-1" onClick={confirm} disabled={busy}>
          {busy ? 'Confirming…' : moved ? 'Confirm here' : 'Confirm this location'}
        </PillButton>
        <PillButton className="flex-1" onClick={() => setMoving((m) => !m)} disabled={busy}>
          {moving ? 'Stop moving' : 'Move it'}
        </PillButton>
      </div>
    </Block>
  )
}

/**
 * An agent with no point on the map (every agent from Orange's file arrives this way) is never
 * shown to customers. The dealer pins the shop here: on the map, standing at it with the
 * phone, or by typing the coordinates. An agent inactive at Orange is shown the reason and nothing else.
 */
function PlacementCard({ detail, onSaved }: { detail: DealerAgentDetail; onSaved: () => void }) {
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!detail.active) {
    return (
      <Block heading="Not shown to customers" tone="danger">
        <p className="text-sm font-medium">This agent is marked inactive at Orange. Customers cannot find them until Orange's record changes.</p>
      </Block>
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
  const typedLat = Number(lat)
  const typedLng = Number(lng)
  const hasPoint = lat !== '' && lng !== '' && Number.isFinite(typedLat) && Number.isFinite(typedLng)
  const centre = hasPoint ? { lat: typedLat, lng: typedLng } : FREETOWN
  return (
    <Block id="place-agent" heading="Not on the map yet" tone="warning">
      <p className="text-sm font-medium">Customers cannot find this shop until it has a point. Drag the map until the pin sits on the shop, or stand at the door and use your location.</p>
      <PinMap
        lat={centre.lat}
        lng={centre.lng}
        mode="move"
        onMove={(pt) => {
          setLat(String(pt.lat))
          setLng(String(pt.lng))
        }}
        label={`${detail.shop_name}, drag the map to place the pin`}
      />
      <div className="flex gap-3">
        <PillButton className="flex-1" onClick={useMyLocation} disabled={locating}>
          {locating ? 'Reading location…' : 'Use my location'}
        </PillButton>
        <PillButton className="flex-1" onClick={() => setTyping((t) => !t)} aria-expanded={typing}>
          Type coordinates
        </PillButton>
      </div>
      {typing && (
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
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <FinderCta onClick={save} disabled={saving || !hasPoint}>
        {saving ? 'Saving…' : 'Pin this shop here'}
      </FinderCta>
      <p className="text-xs font-medium text-finder-muted">Customers are sent here once the agent signs in and taps Open.</p>
    </Block>
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
  const [editing, setEditing] = useState(false)
  const num = (raw: string) => (raw.trim() === '' ? null : Math.max(0, Math.floor(Number(raw))))
  async function save() {
    setSaving(true)
    try {
      await operatorApi.setUsual(detail.ref, { usual_max_sle: num(cash), usual_float_max_sle: num(float), usual_daily_transactions: num(daily) })
      setEditing(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }
  const fromRecords = detail.evidence.cash.source === 'operator'
  const u = detail.usual
  const noteText =
    u.usual_max_sle === null && u.usual_float_max_sle === null && u.usual_daily_transactions === null
      ? 'None yet'
      : [u.usual_max_sle !== null && `out ${formatSle(u.usual_max_sle)}`, u.usual_float_max_sle !== null && `in ${formatSle(u.usual_float_max_sle)}`, u.usual_daily_transactions !== null && `${u.usual_daily_transactions}/day`]
          .filter(Boolean)
          .join(' · ')
  return (
    <Block id="agent-note" heading="Usually handles · your note">
      <p className="text-sm font-medium text-finder-muted">{detail.evidence.cash.text}</p>
      {detail.evidence.float.source !== 'none' && <p className="text-sm font-medium text-finder-muted">{detail.evidence.float.text}</p>}
      {fromRecords ? (
        <p className="text-xs font-medium text-finder-muted">From the operator's records. Your note is no longer needed.</p>
      ) : !editing ? (
        <ActionLine
          label="Your note"
          action={
            <span className="flex items-center gap-3">
              <span className="text-base font-semibold text-finder-muted">{noteText}</span>
              <button type="button" onClick={() => setEditing(true)} className="flex h-control items-center text-base font-bold text-finder-link">
                Edit ›
              </button>
            </span>
          }
        />
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
          <div className="flex gap-3">
            <PillButton tone="on" className="flex-1" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save note'}
            </PillButton>
            <PillButton className="flex-1" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </PillButton>
          </div>
          <p className="text-xs font-medium text-finder-muted">Sets what amounts customers are told this agent can likely handle. The figure is never shown to them, and it is replaced by the operator's records on integration.</p>
        </div>
      )}
    </Block>
  )
}
