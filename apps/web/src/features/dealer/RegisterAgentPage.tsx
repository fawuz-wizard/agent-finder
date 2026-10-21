import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useToast } from '@/design'
import { FinderCta, FinderHeader } from '@/features/end-user/components/finder'
import { FieldLabel, TextField } from '@/features/agent/components/agentChrome'
import { PillButton, Section } from './components/dealerChrome'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS } from '@/types/operator'
import type { RegisterAgentBody } from '@/types/operator'
import { locationErrorText } from '@/lib/location'
import { PinMap } from './components/PinMap'

const AREAS = ['Lumley', 'Aberdeen', 'Wilberforce', 'Congo Cross', 'Hill Station', 'Freetown']

/** A label over a field; defined once at module level so typing never remounts the input. */
function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel htmlFor={id}>
        {label}
        {hint && <span className="font-medium text-finder-muted"> ({hint})</span>}
      </FieldLabel>
      {children}
    </div>
  )
}

/**
 * D5 — Register an agent. Any agent the dealer works with, whether or not Orange's file has
 * them: shop, person, number, a coarse location (the dealer can stand at the shop and use the
 * phone's position), hours, phone, and what the agent usually handles. The API decides what
 * reads as likely from that note; the customer never sees it. "Checked against Orange's
 * record" is the dealer's own statement and only shows customers the badge. No PIN is set
 * here: the answer carries a one-time code the dealer reads out, and the agent chooses their
 * own PIN at the first sign-in.
 */
export default function RegisterAgentPage() {
  const { can } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({
    ref: '',
    shop_name: '',
    person_name: '',
    area: AREAS[0]!,
    street: '',
    lat: '',
    lng: '',
    phone: '',
    phone_visible: false,
    open_time: '07:00',
    close_time: '20:00',
    usual_max_sle: '',
    usual_float_max_sle: '',
    usual_daily_transactions: '',
    verified: false,
  })
  const [locating, setLocating] = useState(false)
  const [typing, setTyping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The permission decides whether this screen exists at all; the API decides again.
  if (!can(PERMISSIONS.manageAgent)) return <Navigate to="/dealer/agents" replace />

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))
  const num = (raw: string) => (raw.trim() === '' ? null : Math.max(0, Math.floor(Number(raw))))
  const ready = form.shop_name.trim() && form.person_name.trim() && form.street.trim() && form.lat && form.lng

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
      ref: form.ref.trim() || null,
      person_name: form.person_name.trim(),
      shop_name: form.shop_name.trim(),
      area: form.area,
      street: form.street.trim(),
      lat: Number(form.lat),
      lng: Number(form.lng),
      phone: form.phone.trim() || null,
      phone_visible: form.phone_visible,
      open_time: form.open_time,
      close_time: form.close_time,
      usual_max_sle: num(form.usual_max_sle),
      usual_float_max_sle: num(form.usual_float_max_sle),
      usual_daily_transactions: num(form.usual_daily_transactions),
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

  const select = 'h-[3.5rem] w-full rounded-field bg-finder-bg px-4 text-base font-medium text-finder-ink shadow-inset-finder outline-none focus:outline focus:outline-2 focus:outline-finder-link'
  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <FinderHeader back="/dealer/agents" title="Agents" />
      <h1 className="mt-6 text-lg font-bold leading-tight">Register an agent</h1>
      <p className="mt-1 text-sm font-medium text-finder-muted">Any agent you work with, on Orange's list or not.</p>

      <div className="mt-5 flex flex-col gap-3">
        <Section heading="The shop" className="gap-3">
          <Field id="reg-shop" label="Shop name">
            <TextField id="reg-shop" value={form.shop_name} onChange={(e) => set('shop_name', e.target.value)} />
          </Field>
          <Field id="reg-person" label="Agent's name">
            <TextField id="reg-person" value={form.person_name} onChange={(e) => set('person_name', e.target.value)} />
          </Field>
          <Field id="reg-ref" label="Agent number" hint="optional, the next free number otherwise">
            <TextField id="reg-ref" value={form.ref} inputMode="numeric" placeholder="e.g. 101" onChange={(e) => set('ref', e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} />
          </Field>
          <Field id="reg-phone" label="Phone" hint="optional">
            <TextField id="reg-phone" value={form.phone} inputMode="tel" placeholder="+232 76 000 000" onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5 accent-finder-link" checked={form.phone_visible} onChange={(e) => set('phone_visible', e.target.checked)} />
            Customers may call this number
          </label>
        </Section>

        <Section heading="Where" className="gap-3">
          <Field id="reg-area" label="Area">
            <select id="reg-area" value={form.area} onChange={(e) => set('area', e.target.value)} className={select}>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field id="reg-street" label="Street or landmark" hint="what customers read">
            <TextField id="reg-street" value={form.street} onChange={(e) => set('street', e.target.value)} />
          </Field>
          <PinMap
            lat={form.lat !== '' && Number.isFinite(Number(form.lat)) ? Number(form.lat) : 8.4657}
            lng={form.lng !== '' && Number.isFinite(Number(form.lng)) ? Number(form.lng) : -13.2317}
            mode="move"
            height={220}
            onMove={(pt) => {
              set('lat', String(pt.lat))
              set('lng', String(pt.lng))
            }}
            label="the shop, drag the map to place the pin"
          />
          <div className="flex gap-3">
            <PillButton className="flex-1" onClick={useMyLocation} disabled={locating}>
              {locating ? 'Reading location…' : 'Use my location'}
            </PillButton>
            <PillButton className="flex-1" onClick={() => setTyping((v) => !v)} aria-expanded={typing}>
              Type coordinates
            </PillButton>
          </div>
          {typing && (
            <div className="grid grid-cols-2 gap-3">
              <Field id="reg-lat" label="Latitude">
                <TextField id="reg-lat" value={form.lat} inputMode="decimal" placeholder="8.4700" onChange={(e) => set('lat', e.target.value)} />
              </Field>
              <Field id="reg-lng" label="Longitude">
                <TextField id="reg-lng" value={form.lng} inputMode="decimal" placeholder="-13.2600" onChange={(e) => set('lng', e.target.value)} />
              </Field>
            </div>
          )}
          <p className="text-xs font-medium text-finder-muted">Drag the map until the pin sits on the shop, stand at the door for the phone's position, or type the coordinates.</p>
        </Section>

        <Section heading="Hours" className="gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field id="reg-open" label="Opens">
              <TextField id="reg-open" type="time" value={form.open_time} onChange={(e) => set('open_time', e.target.value)} />
            </Field>
            <Field id="reg-close" label="Closes">
              <TextField id="reg-close" type="time" value={form.close_time} onChange={(e) => set('close_time', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section heading="Usually handles" className="gap-3">
          <p className="text-sm font-medium text-finder-muted">Sets what amounts customers are told this agent can likely handle, until records replace it. Customers never see the figures.</p>
          <Field id="reg-cash" label="Cash out, up to about (SLE)">
            <TextField id="reg-cash" value={form.usual_max_sle} inputMode="numeric" onChange={(e) => set('usual_max_sle', e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field id="reg-float" label="Cash in, up to about (SLE)">
            <TextField id="reg-float" value={form.usual_float_max_sle} inputMode="numeric" onChange={(e) => set('usual_float_max_sle', e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field id="reg-daily" label="Transactions on a usual day">
            <TextField id="reg-daily" value={form.usual_daily_transactions} inputMode="numeric" onChange={(e) => set('usual_daily_transactions', e.target.value.replace(/\D/g, ''))} />
          </Field>
          <label className="flex items-start gap-3 text-sm font-medium">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-finder-link" checked={form.verified} onChange={(e) => set('verified', e.target.checked)} />
            <span>
              I checked this agent against Orange's record. <span className="text-finder-muted">Customers then see the “Verified agent” badge.</span>
            </span>
          </label>
        </Section>

        {error && (
          <p role="alert" className="text-base font-semibold text-danger">
            {error}
          </p>
        )}
        <FinderCta onClick={submit} disabled={!ready || busy}>
          {busy ? 'Registering…' : 'Register agent'}
        </FinderCta>
        <p className="text-center text-xs font-medium text-finder-muted">
          You get a one-time sign-in code to read out to the agent. They choose their own PIN, and customers see the shop once they sign in and set Open.
        </p>
      </div>
    </div>
  )
}
