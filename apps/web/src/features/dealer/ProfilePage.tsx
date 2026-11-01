import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, ChevronRight, ImageIcon, Trash2 } from 'lucide-react'
import { FinderSheet } from '@/features/end-user/components/finder'
import { shrinkPhoto } from '@/lib/photo'
import { keepDealerPhoto } from './dealerPhotoCache'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { DealerMe } from '@/types/operator'
import { ScreenTitle } from './components/designKit'
import { CARD, OUTLINE, PAGE } from './components/designClasses'

const REGION: Record<string, string> = { west: 'West', north: 'North', east: 'East', south: 'South' }

function MenuRow({ to, label, first }: { to: string; label: string; first?: boolean }) {
  return (
    <Link to={to} className={`flex w-full items-center gap-3 px-[18px] py-[17px] text-left text-[15px] font-semibold ${first ? '' : 'border-t border-finder-card-line'}`}>
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-finder-accent" />
      <span className="flex-1">{label}</span>
      <ChevronRight size={16} strokeWidth={2.4} className="text-finder-muted" aria-hidden />
    </Link>
  )
}

/**
 * Profile, as the approved design's screen 19: who you are (the name, the sign-in name, the
 * region), a menu of where to go, Log out. The network's figures live on Home and Network;
 * appearance, PIN and records on Settings.
 * The round picture can be tapped to add the aggregator's logo or shop sign, shrunk to 256 px
 * on the phone; it replaces the initials here and on Home. Customers never see it.
 */
export default function DealerProfilePage() {
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const me = useAsync<DealerMe>((s) => operatorApi.me(s))
  const d = me.data
  const name = d?.name ?? session?.name ?? 'Aggregator'
  const [picOpen, setPicOpen] = useState(false)
  const [picBusy, setPicBusy] = useState(false)
  const [picError, setPicError] = useState<string | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (d) keepDealerPhoto(d.photo)
  }, [d])

  async function savePicture(file: File | undefined) {
    if (!file) return
    setPicBusy(true)
    setPicError(null)
    try {
      me.setData(await operatorApi.setDealerPhoto(await shrinkPhoto(file, 256, 0.82)))
      setPicOpen(false)
    } catch (e) {
      setPicError(e instanceof Error ? e.message : 'Could not save the picture.')
    } finally {
      setPicBusy(false)
    }
  }

  async function removePicture() {
    setPicBusy(true)
    setPicError(null)
    try {
      me.setData(await operatorApi.removeDealerPhoto())
      setPicOpen(false)
    } catch (e) {
      setPicError(e instanceof Error ? e.message : 'Could not remove the picture.')
    } finally {
      setPicBusy(false)
    }
  }

  const two = name.replace(/['’]s\b/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')

  return (
    <div className={PAGE}>
      <ScreenTitle title="Profile" back="/dealer" />

      <section className={`${CARD} flex items-center gap-4 p-5`}>
        <button type="button" onClick={() => setPicOpen(true)} aria-label={d?.photo ? 'Change your picture' : 'Add your picture'} className="relative h-16 w-16 shrink-0 rounded-full active:scale-[0.97]">
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-design-peach text-xl font-extrabold text-design-ink">{d?.photo ? <img src={d.photo} alt="" className="h-full w-full object-cover" /> : two}</span>
          <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex h-[26px] w-[26px] items-center justify-center rounded-full border-[2.5px] border-finder-card bg-finder-accent text-finder-on-orange">
            <Camera size={13} strokeWidth={2.4} />
          </span>
        </button>
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <h2 className="max-w-full truncate text-lg font-extrabold">{name}</h2>
          {d?.sign_in && (
            <p className="text-[13px] text-finder-muted">
              Sign-in name: <b className="font-bold text-finder-ink">{d.sign_in}</b>
            </p>
          )}
          <span className="rounded-pill bg-finder-tile px-2.5 py-1 text-xs font-bold text-finder-link">Aggregator{d?.region ? ` · ${REGION[d.region] ?? d.region}` : ''}</span>
        </div>
      </section>

      {me.state === 'loading' && <p className="text-sm font-medium text-finder-muted">Loading…</p>}
      {me.state === 'error' && <p className="text-sm font-semibold text-danger">{me.error}</p>}

      <nav aria-label="Profile" className={`${CARD} py-1`}>
        <MenuRow first to="/dealer/agents" label="Manage agents" />
        <MenuRow to="/dealer/records" label="Download a report" />
        <MenuRow to="/dealer/settings" label="Settings" />
      </nav>

      <button
        type="button"
        onClick={() => {
          signOut()
          navigate('/sign-in', { replace: true })
        }}
        className={OUTLINE}
      >
        Log out
      </button>

      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" aria-hidden tabIndex={-1} onChange={(e) => void savePicture(e.target.files?.[0])} />
      <input ref={gallery} type="file" accept="image/*" className="hidden" aria-hidden tabIndex={-1} data-testid="dealer-photo-gallery" onChange={(e) => void savePicture(e.target.files?.[0])} />
      <FinderSheet open={picOpen} onClose={() => setPicOpen(false)} title="Profile picture">
        <p className="text-sm font-medium text-finder-muted">Your logo or shop sign works best. You and Orange see it; customers never do.</p>
        {[
          { label: 'Take photo', icon: <Camera size={18} strokeWidth={2.2} aria-hidden />, on: () => camera.current?.click() },
          { label: 'Choose from gallery', icon: <ImageIcon size={18} strokeWidth={2.2} aria-hidden />, on: () => gallery.current?.click() },
        ].map((o) => (
          <button key={o.label} type="button" disabled={picBusy} onClick={o.on} className="flex h-[52px] items-center gap-3 rounded-[14px] bg-design-track px-4 text-[15px] font-extrabold text-finder-ink disabled:opacity-60">
            <span className="text-finder-link">{o.icon}</span>
            {o.label}
          </button>
        ))}
        {d?.photo && (
          <button type="button" disabled={picBusy} onClick={() => void removePicture()} className="flex h-[52px] items-center gap-3 rounded-[14px] bg-design-track px-4 text-[15px] font-extrabold text-danger disabled:opacity-60">
            <Trash2 size={18} strokeWidth={2.2} aria-hidden />
            Remove picture
          </button>
        )}
        {picBusy && <p role="status" className="text-sm font-semibold text-finder-muted">Saving…</p>}
        {picError && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {picError}
          </p>
        )}
      </FinderSheet>
    </div>
  )
}
