import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Card, useToast, AppBar } from '@/design'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS } from '@/types/operator'
import type { RegisterAgentBody } from '@/types/operator'
import { locationErrorText } from '@/lib/location'

const AREAS = ['Lumley', 'Aberdeen', 'Wilberforce', 'Congo Cross', 'Hill Station', 'Freetown']

/**
 * D5 — Register an agent. Any agent the dealer works with, whether or not Orange's file has
 * them: shop, person, number, a coarse location (the dealer can stand at the shop and use the
 * phone's position), hours, phone, the initial PIN, and what the agent usually handles. The
 * API decides what reads as likely from that note; the customer never sees it. "Checked
 * against Orange's record" is the dealer's own statement and only shows customers the badge.
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
    pin: '',
    usual_max_sle: '',
    usual_float_max_sle: '',
    usual_daily_transactions: '',
    verified: false,
  })
  const [locating, setLocating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The permission decides whether this screen exists at all; the API decides again.
  if (!can(PERMISSIONS.manageAgent)) return <Navigate to="/dealer/agents" replace />

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))
  const num = (raw: string) => (raw.trim() === '' ? null : Math.max(0, Math.floor(Number(raw))))
  const ready =
    form.shop_name.trim() && form.person_name.trim() && form.street.trim() && form.lat && form.lng && /^\d{4,6}$/.test(form.pin)

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
      pin: form.pin,
      usual_max_sle: num(form.usual_max_sle),
      usual_float_max_sle: num(form.usual_float_max_sle),
      usual_daily_transactions: num(form.usual_daily_transactions),
      verified: form.verified,
    }
    try {
      const out = await operatorApi.registerAgent(body)
      toast.show(`${out.shop_name} registered as ${out.ref}`)
      navigate(`/dealer/agents/${encodeURIComponent(out.ref)}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not register the agent.')
      setBusy(false)
    }
  }

  const field = 'h-control w-full rounded-card border border-line bg-paper px-3 text-base'

  return (
    <div className="flex flex-1 flex-col">
      <AppBar back="/dealer/agents" title="Register an agent" subtitle={<>Any agent you work with, on Orange's list or not</>} />

      <div className="flex flex-col gap-3 p-4 pb-6">
        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">The shop</p>
          <label className="text-sm font-semibold" htmlFor="reg-shop">
            Shop name
            <input id="reg-shop" value={form.shop_name} onChange={(e) => set('shop_name', e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className="mt-2 text-sm font-semibold" htmlFor="reg-person">
            Agent's name
            <input id="reg-person" value={form.person_name} onChange={(e) => set('person_name', e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className="mt-2 text-sm font-semibold" htmlFor="reg-ref">
            Agent number <span className="font-normal text-muted">(optional — the next free number otherwise)</span>
            <input id="reg-ref" value={form.ref} inputMode="numeric" placeholder="e.g. 101" onChange={(e) => set('ref', e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} className={`mt-1 ${field}`} />
          </label>
          <label className="mt-2 text-sm font-semibold" htmlFor="reg-phone">
            Phone <span className="font-normal text-muted">(optional)</span>
            <input id="reg-phone" value={form.phone} inputMode="tel" placeholder="+232 76 000 000" onChange={(e) => set('phone', e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.phone_visible} onChange={(e) => set('phone_visible', e.target.checked)} />
            Customers may call this number
          </label>
        </Card>

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Where</p>
          <label className="text-sm font-semibold" htmlFor="reg-area">
            Area
            <select id="reg-area" value={form.area} onChange={(e) => set('area', e.target.value)} className={`mt-1 ${field}`}>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 text-sm font-semibold" htmlFor="reg-street">
            Street or landmark <span className="font-normal text-muted">(what customers read)</span>
            <input id="reg-street" value={form.street} onChange={(e) => set('street', e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-sm font-semibold" htmlFor="reg-lat">
              Latitude
              <input id="reg-lat" value={form.lat} inputMode="decimal" placeholder="8.4700" onChange={(e) => set('lat', e.target.value)} className={`mt-1 ${field}`} />
            </label>
            <label className="text-sm font-semibold" htmlFor="reg-lng">
              Longitude
              <input id="reg-lng" value={form.lng} inputMode="decimal" placeholder="-13.2600" onChange={(e) => set('lng', e.target.value)} className={`mt-1 ${field}`} />
            </label>
          </div>
          <Button size="control" variant="secondary" className="mt-2" onClick={useMyLocation} disabled={locating}>
            {locating ? 'Reading location…' : 'Use my location (stand at the shop)'}
          </Button>
        </Card>

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Hours and PIN</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm font-semibold" htmlFor="reg-open">
              Opens
              <input id="reg-open" type="time" value={form.open_time} onChange={(e) => set('open_time', e.target.value)} className={`mt-1 ${field}`} />
            </label>
            <label className="text-sm font-semibold" htmlFor="reg-close">
              Closes
              <input id="reg-close" type="time" value={form.close_time} onChange={(e) => set('close_time', e.target.value)} className={`mt-1 ${field}`} />
            </label>
          </div>
          <label className="mt-2 text-sm font-semibold" htmlFor="reg-pin">
            Initial PIN <span className="font-normal text-muted">(4–6 digits; tell the agent in person)</span>
            <input id="reg-pin" value={form.pin} inputMode="numeric" type="password" autoComplete="off" onChange={(e) => set('pin', e.target.value.replace(/\D/g, '').slice(0, 6))} className={`mt-1 ${field}`} />
          </label>
        </Card>

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Usually handles</p>
          <p className="text-sm text-muted">Sets what amounts customers are told this agent can likely handle, until records replace it. Customers never see the figures.</p>
          <label className="mt-2 text-sm font-semibold" htmlFor="reg-cash">
            Cash out, up to about (SLE)
            <input id="reg-cash" value={form.usual_max_sle} inputMode="numeric" onChange={(e) => set('usual_max_sle', e.target.value.replace(/\D/g, ''))} className={`mt-1 ${field}`} />
          </label>
          <label className="mt-2 text-sm font-semibold" htmlFor="reg-float">
            Deposit, up to about (SLE)
            <input id="reg-float" value={form.usual_float_max_sle} inputMode="numeric" onChange={(e) => set('usual_float_max_sle', e.target.value.replace(/\D/g, ''))} className={`mt-1 ${field}`} />
          </label>
          <label className="mt-2 text-sm font-semibold" htmlFor="reg-daily">
            Transactions on a usual day
            <input id="reg-daily" value={form.usual_daily_transactions} inputMode="numeric" onChange={(e) => set('usual_daily_transactions', e.target.value.replace(/\D/g, ''))} className={`mt-1 ${field}`} />
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={form.verified} onChange={(e) => set('verified', e.target.checked)} />
            <span>
              I checked this agent against Orange's record. <span className="text-muted">Customers then see the “Verified agent” badge.</span>
            </span>
          </label>
        </Card>

        {error && (
          <p role="alert" className="text-base font-semibold text-danger">
            {error}
          </p>
        )}
        <Button size="cta" onClick={submit} disabled={!ready || busy}>
          {busy ? 'Registering…' : 'Register agent'}
        </Button>
        <p className="text-center text-xs text-muted">
          Customers see the shop once the agent signs in with this number and PIN and sets Open.
        </p>
      </div>
    </div>
  )
}
