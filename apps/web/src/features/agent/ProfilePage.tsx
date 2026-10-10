import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentProfile } from '@/types/operator'
import { locationErrorText } from '@/lib/location'
import { shrinkPhoto } from '@/lib/photo'
import { readPrefs, writePrefs, type AgentPrefs } from '@/lib/prefs'
import { FinderBox, FinderCta, FinderHeader, FinderSheet } from '@/features/end-user/components/finder'
import { EdgeCard, FieldLabel, PILL_OFF, PILL_ON, PlaceRow, Row, SectionLabel, TextField } from './components/agentChrome'
import pkg from '../../../package.json'

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

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="-mr-1 flex h-control w-14 items-center justify-center">
      <span className={`block h-7 w-12 rounded-full p-1 transition-colors ${on ? 'bg-finder-link' : 'bg-finder-line'}`}>
        <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  )
}

/**
 * Profile: who the agent is, in six short groups. Orange's record, read only, with a way to
 * report a mistake to the aggregator; the shop (pin, hours); customers (the phone switch);
 * alerts (the two beeps, on by default); security (change PIN, the phones signed in, sign
 * out); about. One dark surface, no theme switch: one design to keep right.
 */
export default function ProfilePage() {
  const { session, signOut } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const navigate = useNavigate()
  const toast = useToast()
  const ids = useId()
  const { state, data, setData, refresh } = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const [fullRecord, setFullRecord] = useState(false)
  const [prefs, setPrefs] = useState<AgentPrefs>(readPrefs)
  useEffect(() => {
    const sync = () => setPrefs(readPrefs())
    window.addEventListener('af-prefs', sync)
    return () => window.removeEventListener('af-prefs', sync)
  }, [])

  // Report a mistake: a sheet with the field and what is wrong. Goes to the aggregator.
  const [mistakeOpen, setMistakeOpen] = useState(false)
  const [mistakeField, setMistakeField] = useState<(typeof MISTAKE_FIELDS)[number][0]>('address')
  const [mistakeText, setMistakeText] = useState('')
  const [mistakeBusy, setMistakeBusy] = useState(false)
  const [mistakeError, setMistakeError] = useState<string | null>(null)

  // Change PIN: the current one first.
  const [pinOpen, setPinOpen] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [againPin, setAgainPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [othersBusy, setOthersBusy] = useState(false)

  async function togglePhone(next: boolean) {
    setData(await operatorApi.setPhoneVisible(ref, next))
  }

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

  async function changePin() {
    if (!/^\d{4,6}$/.test(newPin)) {
      setPinError('The new PIN is 4 to 6 digits.')
      return
    }
    if (newPin !== againPin) {
      setPinError('The two new PINs are not the same.')
      return
    }
    setPinBusy(true)
    setPinError(null)
    try {
      await operatorApi.changePin(ref, currentPin, newPin)
      setPinOpen(false)
      setCurrentPin('')
      setNewPin('')
      setAgainPin('')
      toast.show('PIN changed.')
    } catch (e) {
      setPinError(e instanceof Error ? e.message : 'Could not change the PIN.')
    } finally {
      setPinBusy(false)
    }
  }

  async function signOutOthers() {
    setOthersBusy(true)
    try {
      const out = await operatorApi.signOutOthers(ref)
      toast.show(out.signed_out === 0 ? 'No other phone was signed in.' : `Signed out ${out.signed_out} other phone${out.signed_out === 1 ? '' : 's'}.`)
      refresh()
    } finally {
      setOthersBusy(false)
    }
  }

  if (state === 'loading' || !data)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 text-white">
        <FinderHeader title="Profile" />
        <p className="text-base font-medium text-finder-muted">Loading…</p>
      </div>
    )

  const mapText = data.located
    ? data.location_source === 'agent'
      ? data.location_confirmed
        ? 'Pinned by you and confirmed by your aggregator.'
        : 'Pinned by you. Waiting for your aggregator to confirm it.'
      : data.location_source === 'dealer'
        ? 'Pinned by your aggregator.'
        : 'Placed for a demonstration, not yet checked.'
    : 'Not on the map yet. Customers cannot find you until it is.'
  const pinField = 'h-[3.5rem] w-full rounded-field bg-finder-bg px-4 text-md font-bold tracking-[0.4em] text-white shadow-inset-finder outline-none placeholder:text-finder-muted/50 placeholder:tracking-normal focus:outline focus:outline-2 focus:outline-finder-link'

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-white">
      <FinderHeader title="Profile" />

      <div className="mt-6">
        <PlaceRow
          name={data.shop_name}
          sub={<>{data.street || data.area}{data.city ? `, ${data.city}` : ''}</>}
          action={
            <Link to="/agent/hours" aria-label="Working hours" className="flex h-control items-center">
              Hours
            </Link>
          }
        />
      </div>
      <p className="mt-1 text-sm font-medium text-finder-muted">{data.hours_text}</p>

      <SectionLabel className="mt-6">Your Orange record</SectionLabel>
      <div className="mt-3 flex flex-col gap-2">
        <Row label="Name" value={data.name} />
        <Row label="Agent code" value={data.agent_code ?? '—'} />
        <Row label="Address" value={data.street || data.area} />
        <Row label="Aggregator" value={data.dealer_name || '—'} />
        {fullRecord && (
          <>
            <Row label="City" value={data.city ?? '—'} />
            <Row label="Region" value={data.region ? data.region[0]!.toUpperCase() + data.region.slice(1) : '—'} />
            <Row label="Status at Orange" value={data.active ? 'Active' : 'Inactive'} />
          </>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={() => setFullRecord((v) => !v)} aria-expanded={fullRecord} className="h-control text-base font-bold text-finder-link">
          {fullRecord ? 'Show less' : 'See full record ›'}
        </button>
        <button type="button" onClick={() => setMistakeOpen(true)} className="h-control text-base font-bold text-finder-link">
          Report a mistake
        </button>
      </div>
      <p className="text-xs font-medium text-finder-muted">As Orange holds it. The app never changes it; your aggregator corrects it with Orange.</p>

      <SectionLabel className="mt-6">Your shop</SectionLabel>
      <EdgeCard className="mt-3" aria-labelledby="shop-map">
        <p id="shop-map" className={`text-base font-bold ${data.located && data.location_source !== 'placed' ? '' : 'text-warning'}`}>{mapText}</p>
        <p className="text-sm font-medium text-finder-muted">Stand inside the shop and pin it. Customers are sent to this exact point.</p>
        <button type="button" onClick={pinHere} disabled={locating} className={`inline-flex h-chip w-fit items-center rounded-pill px-5 text-base font-bold disabled:opacity-45 ${PILL_ON}`}>
          {locating ? 'Reading your position…' : data.located ? 'Pin the shop here again' : 'Pin the shop here'}
        </button>
        {locError && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {locError}
          </p>
        )}
      </EdgeCard>
      <EdgeCard className="mt-3" aria-labelledby="shop-photo">
        <p id="shop-photo" className="text-base font-bold">{data.photo ? 'Your shop, as customers see it' : 'Add a photo of your shop'}</p>
        {data.photo ? (
          <img src={data.photo} alt={`${data.shop_name}, photographed by you`} className="aspect-[4/3] w-full rounded-field object-cover" />
        ) : (
          <p className="text-sm font-medium text-finder-muted">Stand across the street and snap the front. Customers recognise the shop before they ask.</p>
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
        <div className="flex flex-wrap gap-3">
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
          <p role="alert" className="text-sm font-semibold text-danger">
            {photoError}
          </p>
        )}
      </EdgeCard>
      <div className="mt-2">
        <Row label="Working hours" value={data.hours_text} action={<Link to="/agent/hours" className="text-base font-bold text-finder-link">Change ›</Link>} />
      </div>

      <SectionLabel className="mt-6">Customers</SectionLabel>
      <div className="mt-3">
        <Row label="Phone shown to customers" action={<Switch on={data.phone_visible} label="Phone shown to customers" onChange={(next) => void togglePhone(next)} />} />
      </div>
      <p className="mt-2 text-xs font-medium text-finder-muted">Off by default. On: customers see your number and calls go straight to your phone. They never see your balance or your float.</p>

      <SectionLabel className="mt-6">Alerts</SectionLabel>
      <div className="mt-3 flex flex-col gap-2">
        <Row label="Beep before closing" action={<Switch on={prefs.closingBeep} label="Beep before closing" onChange={(next) => setPrefs(writePrefs({ closingBeep: next }))} />} />
        <Row label="Ask when I leave the shop" action={<Switch on={prefs.leftShopWatch} label="Ask when I leave the shop" onChange={(next) => setPrefs(writePrefs({ leftShopWatch: next }))} />} />
      </div>
      <p className="mt-2 text-xs font-medium text-finder-muted">Fifteen minutes before you close, and when your phone is far from your pin while you are open. Both on this phone only.</p>

      <SectionLabel className="mt-6">Security</SectionLabel>
      <div className="mt-3 flex flex-col gap-2">
        <Row label="PIN" action={<button type="button" onClick={() => setPinOpen(true)} className="text-base font-bold text-finder-link">Change ›</button>} />
        {data.devices.map((d) => (
          <Row key={d.id} label={d.label} value={d.last_seen_text} />
        ))}
        {data.devices.length > 1 && (
          <button type="button" onClick={() => void signOutOthers()} disabled={othersBusy} className={`h-[2.9rem] rounded-pill text-base font-bold ${PILL_OFF}`}>
            {othersBusy ? '…' : 'Sign out the other phones'}
          </button>
        )}
      </div>

      <SectionLabel className="mt-6">About</SectionLabel>
      <div className="mt-3 flex flex-col gap-2">
        <Row label="How customers find you" action={<Link to="/how-availability-works" className="text-base font-bold text-finder-link">Read ›</Link>} />
        <Row label="Agent App" value={`Pilot build ${pkg.version}`} />
      </div>

      <FinderBox className="mt-8">
        <button
          type="button"
          onClick={() => {
            signOut()
            navigate('/sign-in', { replace: true })
          }}
          className="flex h-[3.5rem] w-full items-center justify-center rounded-field text-md font-bold text-finder-link"
        >
          Sign out
        </button>
      </FinderBox>

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

      <FinderSheet open={pinOpen} onClose={() => setPinOpen(false)} title="Change PIN">
        <FieldLabel htmlFor={`${ids}-pin-current`}>Current PIN</FieldLabel>
        <input id={`${ids}-pin-current`} type="password" inputMode="numeric" autoComplete="current-password" value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className={pinField} placeholder="4 to 6 digits" />
        <FieldLabel htmlFor={`${ids}-pin-new`}>New PIN</FieldLabel>
        <input id={`${ids}-pin-new`} type="password" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className={pinField} placeholder="4 to 6 digits" />
        <FieldLabel htmlFor={`${ids}-pin-again`}>New PIN again</FieldLabel>
        <input id={`${ids}-pin-again`} type="password" inputMode="numeric" autoComplete="new-password" value={againPin} onChange={(e) => setAgainPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className={pinField} placeholder="4 to 6 digits" />
        {pinError && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {pinError}
          </p>
        )}
        <FinderCta onClick={() => void changePin()} disabled={pinBusy || currentPin.length < 4 || newPin.length < 4 || againPin.length < 4}>
          {pinBusy ? 'Saving…' : 'Change PIN'}
        </FinderCta>
      </FinderSheet>
    </div>
  )
}
