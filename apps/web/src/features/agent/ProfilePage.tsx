import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, AppBar } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentProfile } from '@/types/operator'

function Row({ k, v, action }: { k: string; v: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-sm text-muted">{k}</span>
      <span className="text-right text-sm font-bold">{action ?? v}</span>
    </div>
  )
}

/**
 * A5 — Profile. The last card is deliberate: an agent who knows exactly what customers
 * can and cannot see about them declares more honestly.
 */
export default function ProfilePage() {
  const { session, signOut } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const navigate = useNavigate()
  const { state, data, setData } = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])

  async function togglePhone(next: boolean) {
    const updated = await operatorApi.setPhoneVisible(ref, next)
    setData(updated)
  }
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)

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
      () => {
        setLocError('Could not read the location. Allow location access and try again, at the shop.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  }

  if (state === 'loading' || !data) return <p className="p-4 text-base text-muted">Loading…</p>

  return (
    <div className="flex flex-1 flex-col">
      <AppBar title={data.name} subtitle={<>{data.agent_code ? `Agent code ${data.agent_code}` : data.ref}{data.verified ? ' · Verified agent' : ''}</>} />

      <div className="flex flex-col gap-3 p-4 pb-6">
        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Business</p>
          <Row k="Shop name" v={data.shop_name} />
          <Row k="Location" v={data.area} />
          <Row k="Hours" v={data.hours_text} />
          <Row
            k="Phone shown to customers"
            v=""
            action={
              <button
                type="button"
                role="switch"
                aria-checked={data.phone_visible}
                aria-label="Phone shown to customers"
                onClick={() => togglePhone(!data.phone_visible)}
                className="-mr-1 flex h-control w-14 items-center justify-center"
              >
                <span className={`block h-7 w-12 rounded-full p-1 transition-colors ${data.phone_visible ? 'bg-brand' : 'bg-line'}`}>
                  <span
                    className={`block h-5 w-5 rounded-full bg-paper shadow transition-transform ${data.phone_visible ? 'translate-x-5' : ''}`}
                  />
                </span>
              </button>
            }
          />
          <p className="pt-2 text-xs text-muted">
            Off by default. Customers only see a number if you turn this on, and calls go straight to your phone —
            this app never places or records them.
          </p>
        </Card>

        <Card className={data.located ? '' : 'border-warning bg-warning-tint/40'} aria-labelledby="shop-map">
          <p id="shop-map" className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Your shop on the map</p>
          {data.located ? (
            <p className="text-sm">
              <b>{data.street}</b>
              <span className="text-muted">
                {' '}
                · {data.location_source === 'agent' ? 'pinned by you' : data.location_source === 'dealer' ? 'pinned by your aggregator' : "placed from Orange's record, not yet checked"}
              </span>
            </p>
          ) : (
            <p className="text-sm font-semibold text-warning">Not on the map yet. Customers cannot find you until it is.</p>
          )}
          <p className="text-sm text-muted">Stand inside the shop and pin it. Customers are sent to this exact point.</p>
          <Button size="control" variant={data.located && data.location_source !== 'placed' ? 'secondary' : 'primary'} className="mt-1" onClick={pinHere} disabled={locating}>
            {locating ? 'Reading your position…' : data.located ? 'Pin the shop here again' : 'Pin the shop here'}
          </Button>
          {locError && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {locError}
            </p>
          )}
        </Card>

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Orange record</p>
          <Row k="Agent code" v={data.agent_code ?? '—'} />
          <Row k="Aggregator" v={data.dealer_name || '—'} />
          <Row k="Region" v={data.region ? data.region[0]!.toUpperCase() + data.region.slice(1) : '—'} />
          <Row k="Status at Orange" v={data.active ? 'Active' : 'Inactive'} />
        </Card>

        <Card>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Security</p>
          {data.devices.map((d) => (
            <Row
              key={d.id}
              k={d.label}
              v={d.last_seen_text}
              action={d.current ? <span className="text-muted">{d.last_seen_text}</span> : <span className="text-danger">Sign out</span>}
            />
          ))}
        </Card>

        <Card className="border-brand-deep bg-brand-faint">
          <p className="text-base font-bold">What customers see about you</p>
          <p className="mt-1 text-sm text-muted">
            Your shop name, street, distance, whether you can likely handle their request, and when you last updated.
            Never your balance, your float, or anything your aggregator sees.
          </p>
        </Card>

        <Button
          size="cta"
          variant="secondary"
          onClick={() => {
            signOut()
            navigate('/sign-in', { replace: true })
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  )
}
