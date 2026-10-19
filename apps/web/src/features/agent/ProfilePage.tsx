import { useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentProfile } from '@/types/operator'
import { locationErrorText } from '@/lib/location'
import { shrinkPhoto } from '@/lib/photo'
import { FinderCta, FinderSheet } from '@/features/end-user/components/finder'
import { FieldLabel, Line, PILL_OFF, PILL_ON, SectionLabel, TextField } from './components/agentChrome'

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

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

/**
 * Profile: who the agent is. Orange's record, read only, with a way to report a mistake to
 * the aggregator; the shop as customers meet it (photo, pin, hours, verified). The agent's
 * own choices, notifications, appearance, PIN, phones, live under the gear, on Settings.
 */
export default function ProfilePage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const toast = useToast()
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

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight">{data.shop_name}</h1>
          <p className="mt-1 text-sm font-medium text-finder-muted">
            {data.name} · {data.ref}
            {data.dealer_name ? ` · ${data.dealer_name}` : ''}
          </p>
        </div>
        <Link to="/agent/settings" aria-label="Settings" className="flex h-control w-control shrink-0 items-center justify-center rounded-pill border-2 border-finder-ink text-finder-ink">
          <GearIcon />
        </Link>
      </div>

      <SectionLabel className="mt-8">Orange record</SectionLabel>
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

      <SectionLabel className="mt-8">Your shop</SectionLabel>
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
