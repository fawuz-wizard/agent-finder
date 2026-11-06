import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { LocateFixed } from 'lucide-react'
import { useToast } from '@/design'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS } from '@/types/operator'
import type { RegisterAgentBody } from '@/types/operator'
import { locationErrorText } from '@/lib/location'
import { areaOf } from '@/lib/placeName'
import { PinMap } from './components/PinMap'
import { ScreenTitle } from './components/designKit'
import { OUTLINE, PAGE, SOLID } from './components/designClasses'

const FIELD = 'h-12 w-full rounded-xl border-[1.5px] border-finder-card-line bg-finder-card px-3.5 text-[15px] font-semibold text-finder-ink outline-none placeholder:font-medium placeholder:text-finder-muted focus:border-finder-accent'
const LABEL = 'text-[13px] font-bold'
const PHONE = /^\+?[0-9 ]{6,20}$/
/** An Orange Sierra Leone number: 0 and eight digits, with or without +232. */
const localDigits = (phone: string) => phone.replace(/\D/g, '').replace(/^232/, '').replace(/^0/, '')
/** Sierra Leone, roughly: a pin outside it is a typo, not a shop. */
const inSierraLeone = (lat: number, lng: number) => lat >= 6.8 && lat <= 10.1 && lng >= -13.4 && lng <= -10.2

/** A label over a field; defined once at module level so typing never remounts the input. */
function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children}
    </div>
  )
}

/**
 * D5 — Register an agent, on one short screen: what it takes to put a shop on the map. The
 * shop's and the agent's names, the agent's phone (required: how the aggregator calls them),
 * where the shop is (the pin; the area fills in from it), a landmark customers read, and the
 * aggregator's own check against Orange's record, which only shows customers the badge. Hours
 * start at 07:00–20:00 and the agent sets their own week; what they usually handle, whether
 * customers may call and a custom number are set later, on the agent's page or by the agent.
 * No PIN is set here: the answer carries a one-time code the aggregator reads out, and the
 * agent chooses their own PIN at the first sign-in.
 */
export default function RegisterAgentPage() {
  const { can } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({ ref: '', shop_name: '', person_name: '', phone: '', area: '', street: '', lat: '', lng: '', verified: false })
  const [locating, setLocating] = useState(false)
  const [typing, setTyping] = useState(false)
  const [customRef, setCustomRef] = useState(false)
  const [areaEdited, setAreaEdited] = useState(false)
  const [areaState, setAreaState] = useState<'idle' | 'looking' | 'found' | 'unknown'>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The area follows the pin: looked up a moment after it stops moving, unless the aggregator typed one.
  useEffect(() => {
    if (areaEdited || form.lat === '' || form.lng === '') return
    const lat = Number(form.lat)
    const lng = Number(form.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    const ctrl = new AbortController()
    const t = window.setTimeout(() => {
      setAreaState('looking')
      void areaOf({ lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) }, ctrl.signal).then((name) => {
        if (ctrl.signal.aborted) return
        setForm((f) => ({ ...f, area: name ?? '' }))
        setAreaState(name ? 'found' : 'unknown')
      })
    }, 500)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [form.lat, form.lng, areaEdited])

  // The permission decides whether this screen exists at all; the API decides again.
  if (!can(PERMISSIONS.manageAgent)) return <Navigate to="/dealer/agents" replace />

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))
  const phoneOk = PHONE.test(form.phone.trim()) && localDigits(form.phone).length === 8
  const coordsGiven = form.lat !== '' && form.lng !== ''
  const coordsOk = coordsGiven && Number.isFinite(Number(form.lat)) && Number.isFinite(Number(form.lng)) && inSierraLeone(Number(form.lat), Number(form.lng))
  const ready = form.shop_name.trim() && form.person_name.trim() && phoneOk && form.street.trim() && form.area.trim() && coordsOk
  // Why Register is grey: the first thing still missing, in the order of the form.
  const missing = !form.shop_name.trim()
    ? 'Enter the shop name'
    : !form.person_name.trim()
      ? "Enter the agent's name"
      : !phoneOk
        ? "Enter the agent's phone number"
        : !coordsGiven
          ? 'Place the shop on the map'
          : !coordsOk
            ? 'Move the pin onto the shop in Sierra Leone'
            : !form.area.trim()
              ? 'Enter the area'
              : !form.street.trim()
                ? 'Enter a landmark customers read'
                : null

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('This phone cannot share its location. Type the coordinates instead.')
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Rounded to ~1 m of precision for the shop's own point; it is the shop, not a person.
        set('lat', pos.coords.latitude.toFixed(5))
        set('lng', pos.coords.longitude.toFixed(5))
        setLocating(false)
      },
      (err) => {
        setError(locationErrorText(err, 'Could not read the location. Type the coordinates instead.'))
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  }

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    const body: RegisterAgentBody = {
      ref: customRef ? form.ref.trim() || null : null,
      person_name: form.person_name.trim(),
      shop_name: form.shop_name.trim(),
      area: form.area.trim(),
      street: form.street.trim(),
      lat: Number(form.lat),
      lng: Number(form.lng),
      phone: form.phone.trim(),
      phone_visible: false,
      open_time: '07:00',
      close_time: '20:00',
      usual_max_sle: null,
      usual_float_max_sle: null,
      usual_daily_transactions: null,
      verified: form.verified,
    }
    try {
      const out = await operatorApi.registerAgent(body)
      toast.show(`${out.shop_name} registered as ${out.ref}`)
      // The code travels in navigation state, never in the URL or the address bar's history.
      navigate(`/dealer/agents/${encodeURIComponent(out.ref)}`, { replace: true, state: { code: out.code } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not register the agent.')
      setBusy(false)
    }
  }

  const placed = form.lat !== '' && form.lng !== ''
  return (
    <div className={PAGE.replace('gap-5', 'gap-3.5')}>
      <ScreenTitle title="Register an agent" back="/dealer/agents" />

      <Field id="reg-shop" label="Shop name">
        <input id="reg-shop" className={FIELD} value={form.shop_name} onChange={(e) => set('shop_name', e.target.value)} />
      </Field>
      <Field id="reg-person" label="Agent's name">
        <input id="reg-person" className={FIELD} value={form.person_name} onChange={(e) => set('person_name', e.target.value)} />
      </Field>
      <Field id="reg-phone" label="Phone">
        <input id="reg-phone" className={FIELD} value={form.phone} inputMode="tel" placeholder="+232 76 000 000" aria-invalid={form.phone.trim() !== '' && !phoneOk} aria-describedby="reg-phone-hint" onChange={(e) => set('phone', e.target.value)} />
        {form.phone.trim() !== '' && !phoneOk && (
          <p id="reg-phone-hint" className="text-xs font-semibold text-danger">
            Enter a 9-digit Orange number, e.g. 076 123 456
          </p>
        )}
      </Field>

      <section aria-labelledby="reg-where" className="flex flex-col gap-2">
        <h2 id="reg-where" className={LABEL}>
          Where is the shop?
        </h2>
        <div className="relative overflow-hidden rounded-[14px] border-[1.5px] border-finder-card-line">
          <PinMap
            lat={placed && Number.isFinite(Number(form.lat)) ? Number(form.lat) : 8.4657}
            lng={placed && Number.isFinite(Number(form.lng)) ? Number(form.lng) : -13.2317}
            mode="move"
            height={170}
            onMove={(pt) => {
              set('lat', String(pt.lat))
              set('lng', String(pt.lng))
            }}
            label="the shop, drag the map to place the pin"
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={useMyLocation} disabled={locating} className={`${SOLID} h-11 gap-1.5 disabled:opacity-60`}>
            <LocateFixed size={17} strokeWidth={2.2} aria-hidden />
            {locating ? 'Reading…' : 'Use my location'}
          </button>
          <button type="button" onClick={() => setTyping((v) => !v)} aria-expanded={typing} className={`${OUTLINE} h-11 text-sm`}>
            Type coordinates
          </button>
        </div>
        {typing && (
          <div className="grid grid-cols-2 gap-2.5">
            <Field id="reg-lat" label="Latitude">
              <input id="reg-lat" className={FIELD} value={form.lat} inputMode="decimal" placeholder="8.4700" onChange={(e) => set('lat', e.target.value)} />
            </Field>
            <Field id="reg-lng" label="Longitude">
              <input id="reg-lng" className={FIELD} value={form.lng} inputMode="decimal" placeholder="-13.2600" onChange={(e) => set('lng', e.target.value)} />
            </Field>
          </div>
        )}
        {placed && !coordsOk && (
          <p role="alert" className="text-xs font-semibold text-danger">
            That point is outside Sierra Leone. Check the numbers, or drag the map onto the shop.
          </p>
        )}
        {!placed && <p className="text-xs font-medium text-finder-muted">Stand at the shop and use your location, or drag the map until the pin sits on it.</p>}
        {placed && (areaEdited || areaState === 'unknown') ? (
          <Field id="reg-area" label="Area">
            <input
              id="reg-area"
              className={FIELD}
              value={form.area}
              placeholder="e.g. Lumley"
              onChange={(e) => {
                setAreaEdited(true)
                set('area', e.target.value)
              }}
            />
          </Field>
        ) : (
          placed && (
            <p role="status" className="text-[13px] font-semibold text-finder-muted">
              {areaState === 'found' ? (
                <>
                  Area: <b className="text-finder-ink">{form.area}</b> ·{' '}
                  <button type="button" onClick={() => setAreaEdited(true)} className="font-bold text-finder-link">
                    Change
                  </button>
                </>
              ) : (
                'Finding the area…'
              )}
            </p>
          )
        )}
        <Field id="reg-street" label="Landmark customers read">
          <input id="reg-street" className={FIELD} value={form.street} placeholder="e.g. Opposite the mosque, Lumley Junction" onChange={(e) => set('street', e.target.value)} />
        </Field>
      </section>

      <label className="flex items-start gap-3 text-[13px] font-bold">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-finder-accent" checked={form.verified} onChange={(e) => set('verified', e.target.checked)} />
        <span>
          I checked this agent against Orange's record
          <span className="block font-medium text-finder-muted">Customers see the “Verified agent” badge.</span>
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <button type="button" onClick={submit} disabled={!ready || busy} className={`${SOLID} text-[15px] disabled:opacity-50`}>
        {busy ? 'Registering…' : 'Register agent'}
      </button>
      {!busy && missing && <p className="-mt-1.5 text-center text-xs font-medium text-finder-muted">{missing}</p>}
      {customRef ? (
        <Field id="reg-ref" label="Agent number">
          <input id="reg-ref" className={FIELD} value={form.ref} inputMode="numeric" placeholder="e.g. 101" onChange={(e) => set('ref', e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} />
        </Field>
      ) : (
        <p className="text-xs font-medium text-finder-muted">
          The next free number is given automatically ·{' '}
          <button type="button" onClick={() => setCustomRef(true)} className="font-bold text-finder-link">
            Use a specific number
          </button>
        </p>
      )}
      <p className="text-xs font-medium text-finder-muted">You get a one-time sign-in code to read out to the agent. They choose their own PIN; hours start at 07:00–20:00 and they set their own week.</p>
    </div>
  )
}
