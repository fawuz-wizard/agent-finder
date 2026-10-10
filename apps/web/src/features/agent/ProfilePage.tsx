import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentProfile } from '@/types/operator'
import { locationErrorText } from '@/lib/location'
import { FinderBox, FinderHeader } from '@/features/end-user/components/finder'
import { EdgeCard, PILL_ON, PlaceRow, Row, SectionLabel } from './components/agentChrome'

/**
 * Profile: who the agent is, from Orange's record, untouched; their aggregator; the shop on
 * the map; hours; what customers may see; the devices signed in. Laid out like the finder's
 * agent detail: the place at the top, then sections of 60 px rows.
 */
export default function ProfilePage() {
  const { session, signOut } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const navigate = useNavigate()
  const { state, data, setData } = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)

  async function togglePhone(next: boolean) {
    const updated = await operatorApi.setPhoneVisible(ref, next)
    setData(updated)
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

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-white">
      <FinderHeader title="Profile" />

      <div className="mt-6">
        <PlaceRow
          name={data.shop_name}
          sub={<>{data.street || data.area}{data.city ? `, ${data.city}` : ''}</>}
          action={
            <Link to="/agent/hours" className="flex h-control items-center">
              Working hours
            </Link>
          }
        />
      </div>
      <p className="mt-1 text-sm font-medium text-finder-muted">{data.hours_text}</p>

      <SectionLabel className="mt-6">On the map</SectionLabel>
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

      <SectionLabel className="mt-6">Your Orange record</SectionLabel>
      <div className="mt-3 flex flex-col gap-2">
        <Row label="Name" value={data.name} />
        <Row label="Agent code" value={data.agent_code ?? '—'} />
        <Row label="Address" value={data.street || data.area} />
        <Row label="City" value={data.city ?? '—'} />
        <Row label="Region" value={data.region ? data.region[0]!.toUpperCase() + data.region.slice(1) : '—'} />
        <Row label="Status at Orange" value={data.active ? 'Active' : 'Inactive'} />
        <Row label="Aggregator" value={data.dealer_name || '—'} />
      </div>
      <p className="mt-2 text-sm font-medium text-finder-muted">As Orange holds it. Ask your aggregator to have a mistake corrected; the app never changes it.</p>

      <SectionLabel className="mt-6">Customers</SectionLabel>
      <div className="mt-3 flex flex-col gap-2">
        <Row
          label="Phone shown to customers"
          action={
            <button type="button" role="switch" aria-checked={data.phone_visible} aria-label="Phone shown to customers" onClick={() => togglePhone(!data.phone_visible)} className="-mr-1 flex h-control w-14 items-center justify-center">
              <span className={`block h-7 w-12 rounded-full p-1 transition-colors ${data.phone_visible ? 'bg-finder-link' : 'bg-finder-line'}`}>
                <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${data.phone_visible ? 'translate-x-5' : ''}`} />
              </span>
            </button>
          }
        />
      </div>
      <p className="mt-2 text-sm font-medium text-finder-muted">
        Off by default. Customers only see a number if you turn this on, and calls go straight to your phone. They see your shop name, street, distance and whether you can likely handle their request. Never your balance, your float, or anything your aggregator sees.
      </p>

      <SectionLabel className="mt-6">Security</SectionLabel>
      <div className="mt-3 flex flex-col gap-2">
        {data.devices.map((d) => (
          <Row key={d.id} label={d.label} value={d.last_seen_text} />
        ))}
      </div>

      <FinderBox className="mt-8">
        <button
          type="button"
          onClick={() => {
            signOut()
            navigate('/sign-in', { replace: true })
          }}
          className="flex h-[60px] w-full items-center justify-center rounded-field text-md font-bold text-finder-link"
        >
          Sign out
        </button>
      </FinderBox>
    </div>
  )
}
