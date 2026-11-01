import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, ImageIcon, Trash2 } from 'lucide-react'
import { FinderSheet } from '@/features/end-user/components/finder'
import { shrinkPhoto } from '@/lib/photo'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentProfile } from '@/types/operator'
import { usePlatformTheme } from '@/lib/platformTheme'
import { AgentTitle } from './components/agentKit'
import { Icon } from './components/agentIcons'
import { BOX, OUTLINE } from './components/agentClasses'

const ROWS = [
  { to: '/agent/profile/personal', label: 'Personal Information', icon: Icon.user },
  { to: '/agent/pin', label: 'Change PIN', icon: Icon.lock },
  { to: '/agent/notification-settings', label: 'Notification Settings', icon: Icon.bell },
  { to: '/agent/help', label: 'Help & Support', icon: Icon.help },
  { to: '/agent/about', label: 'About', icon: Icon.info },
] as const

/**
 * Profile, the new design's screen 13: who is signed in (the round picture is the shop photo,
 * which customers and the aggregator see; tap it to take, choose or remove it), Light or Dark, five rows that each
 * open exactly the page they name (the design's › arrows; there is no Settings page), and Log Out. The shop's photo, pin and hours are on Your shop, from
 * Service Status → Update Location.
 */
export default function ProfilePage() {
  const { session, signOut } = useSession()
  const [theme, setTheme] = usePlatformTheme()
  const navigate = useNavigate()
  const ref = session?.ref ?? 'Agent 024'
  const { data, setData } = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])
  // The round picture is the shop photo: customers, the aggregator and the agent all see it.
  const [picOpen, setPicOpen] = useState(false)
  const [picBusy, setPicBusy] = useState(false)
  const [picError, setPicError] = useState<string | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  async function savePicture(file: File | undefined) {
    if (!file) return
    setPicBusy(true)
    setPicError(null)
    try {
      setData(await operatorApi.setPhoto(ref, await shrinkPhoto(file)))
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
      setData(await operatorApi.removePhoto(ref))
      setPicOpen(false)
    } catch (e) {
      setPicError(e instanceof Error ? e.message : 'Could not remove the picture.')
    } finally {
      setPicBusy(false)
    }
  }
  const name = data?.name ?? session?.name ?? ''
  const two = name.replace(/['’]s\b/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')

  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <AgentTitle title="Profile" />
      <div className="flex items-center gap-4 px-[22px] pb-[22px] pt-[26px]">
        <button type="button" onClick={() => setPicOpen(true)} aria-label={data?.photo ? 'Change your shop photo' : 'Add your shop photo'} className="relative h-[68px] w-[68px] shrink-0 rounded-full active:scale-[0.97]">
          <span className="flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-full bg-agent-avatar text-xl font-bold text-agent-avatar-ink">{data?.photo ? <img src={data.photo} alt="" className="h-full w-full object-cover" /> : two}</span>
          <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex h-[26px] w-[26px] items-center justify-center rounded-full border-[2.5px] border-finder-bg bg-finder-accent text-finder-on-orange">
            <Camera size={13} strokeWidth={2.4} />
          </span>
        </button>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="truncate text-lg font-bold">{name}</h2>
          <span className="self-start rounded-[20px] bg-agent-pill px-2.5 py-[3px] text-[11px] font-bold text-agent-pill-ink">Agent</span>
        </div>
      </div>

      {/* Light or dark, one tap, at the top: the only display choice, on this phone only. */}
      <div className={`${BOX} mx-[18px] mb-3 flex items-center gap-3 px-4 py-2.5`}>
        <span className="flex-1 text-sm font-bold">Appearance</span>
        <div role="radiogroup" aria-label="Appearance" className="flex w-[160px] rounded-[12px] bg-agent-chip p-[3px]">
          {(['light', 'dark'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} className={`h-9 flex-1 rounded-[10px] text-[13px] font-bold transition-colors duration-150 ${theme === t ? 'bg-finder-card text-finder-ink shadow-sm' : 'text-finder-muted'}`}>
              {t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </div>

      <nav aria-label="Profile" className={`${BOX} mx-[18px] flex flex-col overflow-hidden`}>
        {ROWS.map((r, k) => (
          <Link key={r.label} to={r.to} className={`flex h-14 w-full items-center gap-3.5 px-4 text-left text-sm font-semibold transition-colors active:bg-agent-curve ${k ? 'border-t border-agent-divider' : ''}`}>
            <span className="text-agent-chip-ink">{r.icon()}</span>
            <span className="flex-1">{r.label}</span>
            <span className="text-finder-muted">{Icon.chevron(16)}</span>
          </Link>
        ))}
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

      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" aria-hidden tabIndex={-1} onChange={(e) => void savePicture(e.target.files?.[0])} />
      <input ref={gallery} type="file" accept="image/*" className="hidden" aria-hidden tabIndex={-1} data-testid="agent-photo-gallery" onChange={(e) => void savePicture(e.target.files?.[0])} />
      <FinderSheet open={picOpen} onClose={() => setPicOpen(false)} title="Shop photo">
        <p className="text-sm font-medium text-finder-muted">Your picture is your shop photo: customers and your aggregator see it. Snap the front so customers recognise the shop from the street.</p>
        {[
          { label: 'Take photo', icon: <Camera size={18} strokeWidth={2.2} aria-hidden />, on: () => camera.current?.click() },
          { label: 'Choose from gallery', icon: <ImageIcon size={18} strokeWidth={2.2} aria-hidden />, on: () => gallery.current?.click() },
        ].map((o) => (
          <button key={o.label} type="button" disabled={picBusy} onClick={o.on} className="flex h-[52px] items-center gap-3 rounded-[14px] bg-agent-chip px-4 text-[15px] font-bold text-finder-ink disabled:opacity-60">
            <span className="text-finder-link">{o.icon}</span>
            {o.label}
          </button>
        ))}
        {data?.photo && (
          <button type="button" disabled={picBusy} onClick={() => void removePicture()} className="flex h-[52px] items-center gap-3 rounded-[14px] bg-agent-chip px-4 text-[15px] font-bold text-danger disabled:opacity-60">
            <Trash2 size={18} strokeWidth={2.2} aria-hidden />
            Remove photo
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
