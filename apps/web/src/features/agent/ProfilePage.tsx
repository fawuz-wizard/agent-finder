import { useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentProfile } from '@/types/operator'
import { locationErrorText } from '@/lib/location'
import { shrinkPhoto } from '@/lib/photo'
import { FinderCta, FinderSheet } from '@/features/end-user/components/finder'
import { FieldLabel, Line, PILL_OFF, PILL_ON, TextField } from './components/agentChrome'
import { AgentTitle } from './components/agentKit'
import { Icon } from './components/agentIcons'
import { BOX, OUTLINE } from './components/agentClasses'

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


/**
 * Profile: who the agent is. Orange's record, read only, with a way to report a mistake to
 * the aggregator; the shop as customers meet it (photo, pin, hours, verified). The agent's
 * own choices, notifications, appearance, PIN, phones, live under the gear, on Settings.
 */
export default function ProfilePage() {
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const ref = session?.ref ?? 'Agent 024'
  const toast = useToast()
  // The design's menu: each row opens its part of the profile in place, or goes to Settings.
  const [openPart, setOpenPart] = useState<'person' | 'shop' | null>(null)
  const ids = useId()
  const { state, data, setData } = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)

  // Report a mistake: a sheet with the field and what is wrong. Goes to the aggregator.
  const [mistakeOpen, setMistakeOpen] = useState(false)
  const [mistakeField, setMistakeField] = useState<(typeof MISTAKE_FIELDS)[number][0]>('address')
  const [mistakeText, setMistakeText] = useState('')
  const [mistakeBusy, setMistakeBusy] = useState(false)
  const [mistakeError, setMistakeError] = useState<string | null>(null)

  // The shop's picture: the camera on a phone, the file picker on a laptop. Shrunk here first.
  const photoInput = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  async function photoChosen(file: File | undefined) {
    if (!file) return
    setPhotoBusy(true)
    setPhotoError(null)
    try {
      setData(await operatorApi.setPhoto(ref, await shrinkPhoto(file)))
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Could not save the picture.')
    } finally {
      setPhotoBusy(false)
      if (photoInput.current) photoInput.current.value = ''
    }
  }
  async function removePhoto() {
    setPhotoBusy(true)
    setPhotoError(null)
    try {
      setData(await operatorApi.removePhoto(ref))
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Could not remove the picture.')
    } finally {
      setPhotoBusy(false)
    }
  }

  /** Standing at the shop: the phone's position becomes the shop's point. */
  function pinHere() {
    if (!navigator.geolocation) {
      setLocError('This phone cannot share its location. Ask your aggregator to pin the shop.')
      return
    }
    setLocating(true)
    setLocError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          setData(await operatorApi.setLocation(ref, pos.coords.latitude, pos.coords.longitude))
        } catch (e) {
          setLocError(e instanceof Error ? e.message : 'Could not save the location.')
        } finally {
          setLocating(false)
        }
      },
      (err) => {
        setLocError(locationErrorText(err, 'Could not read the location. Try again, at the shop.'))
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  }

  async function sendMistake() {
    if (mistakeText.trim().length < 3) {
      setMistakeError('Say what is wrong, in a few words.')
      return
    }
    setMistakeBusy(true)
    setMistakeError(null)
    try {
      await operatorApi.reportMistake(ref, mistakeField, mistakeText.trim())
      setMistakeOpen(false)
      setMistakeText('')
      toast.show('Sent to your aggregator. They correct it with Orange.')
    } catch (e) {
      setMistakeError(e instanceof Error ? e.message : 'Could not send that.')
    } finally {
      setMistakeBusy(false)
    }
  }

  if (state === 'loading' || !data)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 pt-6 text-finder-ink">
        <p className="text-base font-medium text-finder-muted">Loading…</p>
      </div>
    )

  const mapText = data.located
    ? data.location_source === 'agent'
      ? data.location_confirmed
        ? 'Pinned by you, confirmed'
        : 'Pinned by you, waiting for your aggregator'
      : data.location_source === 'dealer'
        ? 'Pinned by your aggregator'
        : 'Placed for a demonstration'
    : 'Not on the map yet'
  const region = data.region ? data.region[0]!.toUpperCase() + data.region.slice(1) : '—'

  const two = data.shop_name.replace(/['’]s\b/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
  const row = (first: boolean) => `flex h-14 w-full items-center gap-3.5 px-4 text-left text-sm font-semibold transition-colors active:bg-agent-curve ${first ? '' : 'border-t border-agent-divider'}`
  const chevron = (open?: boolean) => <span className={`text-finder-muted transition-transform ${open ? 'rotate-90' : ''}`}>{Icon.chevron(16)}</span>

  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <AgentTitle title="Profile" />
      <div className="flex items-center gap-4 px-[22px] pb-[22px] pt-[26px]">
        <span aria-hidden="true" className="flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-agent-avatar text-xl font-bold text-agent-avatar-ink">
          {data.photo ? <img src={data.photo} alt="" className="h-full w-full object-cover" /> : two}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="truncate text-lg font-bold">{data.shop_name}</h2>
          <p className="truncate text-[13px] text-finder-muted">
            {data.name} · {data.ref}
          </p>
          <span className="self-start rounded-[20px] bg-agent-pill px-2.5 py-[3px] text-[11px] font-bold text-agent-pill-ink">Agent{data.dealer_name ? ` · ${data.dealer_name}` : ''}</span>
        </div>
      </div>

      <nav aria-label="Profile" className={`${BOX} mx-[18px] flex flex-col overflow-hidden`}>
        <button type="button" aria-expanded={openPart === 'person'} onClick={() => setOpenPart((v) => (v === 'person' ? null : 'person'))} className={row(true)}>
          <span className="text-agent-chip-ink">{Icon.user()}</span>
          <span className="flex-1">Personal Information</span>
          {chevron(openPart === 'person')}
        </button>
        {openPart === 'person' && (
          <div className="border-t border-agent-divider px-4 pb-3">
            <p className="pt-3 text-xs font-bold uppercase tracking-wider text-finder-muted">Orange record</p>
      <div className="mt-2 flex flex-col">
              <Line label="Agent code" value={data.agent_code ?? '—'} />
              <Line label="Address" value={data.street || data.area} />
              <Line label="City" value={data.city ?? '—'} />
              <Line label="Region" value={region} />
              <Line label="Status at Orange" value={<span className={data.active ? 'text-finder-likely' : 'text-danger'}>{data.active ? 'Active' : 'Inactive'}</span>} />
            </div>
            <button type="button" onClick={() => setMistakeOpen(true)} className="mt-2 flex h-control items-center self-start text-base font-bold text-finder-link">
              Report a mistake
            </button>
            <p className="text-xs font-medium text-finder-muted">As Orange holds it. The app never changes it; your aggregator corrects it with Orange.</p>

          </div>
        )}
        <button type="button" aria-expanded={openPart === 'shop'} onClick={() => setOpenPart((v) => (v === 'shop' ? null : 'shop'))} className={row(false)}>
          <span className="text-agent-chip-ink">{Icon.store()}</span>
          <span className="flex-1">Shop &amp; Location</span>
          {chevron(openPart === 'shop')}
        </button>
        {openPart === 'shop' && (
          <div className="border-t border-agent-divider px-4 pb-4">
      <div className="mt-3">
              <p className="text-base font-bold">{data.photo ? 'Your shop, as customers see it' : 'Add a photo of your shop'}</p>
              {data.photo ? (
                <img src={data.photo} alt={`${data.shop_name}, photographed by you`} className="mt-3 aspect-[4/3] w-full rounded-field object-cover" />
              ) : (
                <p className="mt-1 text-sm font-medium text-finder-muted">Stand across the street and snap the front. Customers recognise the shop before they ask.</p>
              )}
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                capture="environment"
                aria-label="Photo of your shop"
                className="sr-only"
                onChange={(e) => void photoChosen(e.target.files?.[0])}
              />
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" onClick={() => photoInput.current?.click()} disabled={photoBusy} className={`inline-flex h-chip items-center rounded-pill px-5 text-base font-bold disabled:opacity-45 ${PILL_ON}`}>
                  {photoBusy ? 'Saving…' : data.photo ? 'Take it again' : 'Take a photo'}
                </button>
                {data.photo && (
                  <button type="button" onClick={() => void removePhoto()} disabled={photoBusy} className={`inline-flex h-chip items-center rounded-pill px-5 text-base font-bold disabled:opacity-45 ${PILL_OFF}`}>
                    Remove
                  </button>
                )}
              </div>
              {photoError && (
                <p role="alert" className="mt-2 text-sm font-semibold text-danger">
                  {photoError}
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-col">
              <Line
                label={<span className="whitespace-nowrap">On the map</span>}
                action={
                  <span className="flex min-w-0 flex-col items-end gap-0.5 text-right">
                    <span className={`text-base font-semibold ${data.located && data.location_source !== 'placed' ? 'text-finder-muted' : 'text-warning'}`}>{mapText}</span>
                    <button type="button" onClick={pinHere} disabled={locating} className="text-sm font-bold text-finder-link disabled:opacity-45">
                      {locating ? 'Reading your position…' : data.located ? 'Pin the shop here again ›' : 'Pin the shop here ›'}
                    </button>
                  </span>
                }
              />
              <Line
                label={<span className="whitespace-nowrap">Working hours</span>}
                action={
                  <span className="flex min-w-0 flex-col items-end gap-0.5 text-right">
                    <span className="text-base font-semibold text-finder-muted">{data.hours_text}</span>
                    <Link to="/agent/hours" className="text-sm font-bold text-finder-link">Change hours ›</Link>
                  </span>
                }
              />
              <Line label="Verified" value={<span className={data.verified ? 'text-finder-likely' : 'text-warning'}>{data.verified ? 'Yes · shown to customers' : 'Pending · not shown to customers'}</span>} />
            </div>
            {locError && (
              <p role="alert" className="mt-2 text-sm font-semibold text-danger">
                {locError}
              </p>
            )}
            <p className="mt-2 text-xs font-medium text-finder-muted">Stand inside the shop to pin it. Customers are sent to that exact point once your aggregator confirms it.</p>

          </div>
        )}
        <Link to="/agent/settings" className={row(false)}>
          <span className="text-agent-chip-ink">{Icon.lock()}</span>
          <span className="flex-1">Change PIN</span>
          {chevron()}
        </Link>
        <Link to="/agent/notifications" className={row(false)}>
          <span className="text-agent-chip-ink">{Icon.bell()}</span>
          <span className="flex-1">Notifications</span>
          {chevron()}
        </Link>
        <Link to="/agent/settings" className={row(false)}>
          <span className="text-agent-chip-ink">{Icon.info()}</span>
          <span className="flex-1">Settings</span>
          {chevron()}
        </Link>
      </nav>

      <div className="mt-auto px-[18px] pb-10 pt-8">
        <button
          type="button"
          onClick={() => {
            signOut()
            navigate('/sign-in', { replace: true })
          }}
          className={OUTLINE}
        >
          Log Out
        </button>
      </div>

      <FinderSheet open={mistakeOpen} onClose={() => setMistakeOpen(false)} title="Report a mistake">
        <p className="text-sm font-medium text-finder-muted">Goes to your aggregator, who corrects it with Orange. The app never edits the record itself.</p>
        <div role="radiogroup" aria-label="Which part is wrong?" className="flex flex-wrap gap-2">
          {MISTAKE_FIELDS.map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={mistakeField === key} onClick={() => setMistakeField(key)} className={`h-chip rounded-pill px-4 text-sm font-bold ${mistakeField === key ? PILL_ON : PILL_OFF}`}>
              {label}
            </button>
          ))}
        </div>
        <FieldLabel htmlFor={`${ids}-mistake`}>What is wrong</FieldLabel>
        <TextField id={`${ids}-mistake`} value={mistakeText} onChange={(e) => setMistakeText(e.target.value.slice(0, 300))} placeholder="e.g. We moved to Lumley Beach Road" />
        {mistakeError && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {mistakeError}
          </p>
        )}
        <FinderCta onClick={() => void sendMistake()} disabled={mistakeBusy}>
          {mistakeBusy ? 'Sending…' : 'Send to my aggregator'}
        </FinderCta>
      </FinderSheet>
    </div>
  )
}
