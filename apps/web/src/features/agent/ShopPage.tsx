import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentProfile } from '@/types/operator'
import { locationErrorText } from '@/lib/location'
import { shrinkPhoto } from '@/lib/photo'
import { readPrefs, writePrefs } from '@/lib/prefs'
import { PinMap } from '@/features/dealer/components/PinMap'
import { Switch } from './components/agentChrome'
import { AgentTitle } from './components/agentKit'
import { BOX, OUTLINE, PRIMARY } from './components/agentClasses'

/**
 * Your shop, from Service Status → Update Location: where customers are sent and what they
 * recognise. The pin (standing inside, the phone's position becomes the shop's point; the
 * aggregator confirms it), the left-shop check with its switch, said once, the photo of the
 * front, and the working hours.
 */
export default function ShopPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const { data, setData, state, error } = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const [watch, setWatch] = useState(() => readPrefs().leftShopWatch)
  const photoInput = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

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

  function toggleWatch(on: boolean) {
    writePrefs({ leftShopWatch: on })
    setWatch(on)
  }

  const mapText = !data?.located
    ? 'Not on the map yet'
    : data.location_source === 'placed'
      ? 'Placed for a demonstration'
      : `${data.location_source === 'agent' ? 'Pinned by you' : 'Pinned by your aggregator'}${data.location_confirmed ? ' · Confirmed' : ' · Waiting for your aggregator to confirm'}`

  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <AgentTitle title="Your shop" back="/agent/status" />
      <div className="flex flex-col gap-3 px-[18px] pb-8 pt-5">
        {state === 'loading' && !data && <p className="text-sm text-finder-muted">Loading…</p>}
        {state === 'error' && <p className="text-sm font-semibold text-danger">{error}</p>}
        {data && (
          <>
            {data.lat !== null && data.lng !== null && (
              <div className="overflow-hidden rounded-[14px] border border-finder-card-line">
                <PinMap lat={data.lat} lng={data.lng} height={150} label="your shop" />
              </div>
            )}
            <p className={`text-[13px] ${data.located && data.location_source !== 'placed' ? 'text-finder-muted' : 'font-semibold text-warning'}`}>{mapText}</p>
            <button type="button" onClick={pinHere} disabled={locating} className={PRIMARY}>
              {locating ? 'Reading your position…' : data.located ? 'Pin the shop here again' : 'Pin the shop here'}
            </button>
            <p className="text-xs text-finder-muted">Stand inside the shop. Customers are sent to that point once your aggregator confirms it.</p>
            {locError && (
              <p role="alert" className="text-sm font-semibold text-danger">
                {locError}
              </p>
            )}

            <div className={`${BOX} flex items-center gap-3 px-4 py-3`}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-bold">Tell me if I leave the shop</span>
                <span className="text-xs text-finder-muted">While the app is open. Away from your pin, customers can't see you until you're back. Your position stays on your phone; off, your aggregator sees the check is off.</span>
              </span>
              <Switch on={watch} onChange={toggleWatch} label="Tell me if I leave the shop" />
            </div>

            <div className={`${BOX} flex flex-col gap-3 px-4 py-4`}>
              <p className="text-sm font-bold">{data.photo ? 'Your shop, as customers see it' : 'Add a photo of your shop'}</p>
              {data.photo ? (
                <img src={data.photo} alt={`${data.shop_name}, photographed by you`} className="aspect-[4/3] w-full rounded-[12px] object-cover" />
              ) : (
                <p className="text-[13px] text-finder-muted">Stand across the street and snap the front. Customers recognise the shop before they ask.</p>
              )}
              <input ref={photoInput} type="file" accept="image/*" capture="environment" aria-label="Photo of your shop" className="sr-only" onChange={(e) => void photoChosen(e.target.files?.[0])} />
              <div className="flex gap-3">
                <button type="button" onClick={() => photoInput.current?.click()} disabled={photoBusy} className={`${OUTLINE} h-11 flex-1 text-sm`}>
                  {photoBusy ? 'Saving…' : data.photo ? 'Take it again' : 'Take a photo'}
                </button>
                {data.photo && (
                  <button type="button" onClick={() => void removePhoto()} disabled={photoBusy} className="h-11 px-4 text-sm font-bold text-danger">
                    Remove
                  </button>
                )}
              </div>
              {photoError && (
                <p role="alert" className="text-sm font-semibold text-danger">
                  {photoError}
                </p>
              )}
            </div>

            <Link to="/agent/hours" className={`${BOX} flex min-h-14 items-center justify-between gap-3 px-4`}>
              <span className="text-sm font-semibold">Working hours</span>
              <span className="text-[13px] font-bold text-finder-link">{data.hours_text} ›</span>
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
