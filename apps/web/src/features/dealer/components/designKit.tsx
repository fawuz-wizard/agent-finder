import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useBack } from '@/hooks/useBack'
import { ChevronLeft } from 'lucide-react'

/**
 * The aggregator app's pieces, measured from the approved Claude Design file ("Aggregator
 * .html", 2026-10-29): 24 px page sides, borderless white cards with 16-18 px corners, the dark
 * header with the orange-ringed avatar, the white 40 px back button, 20 px titles. Colours come
 * from the platform tokens so the dark theme still works; orange is Orange's #FF7900 with
 * black text, as Orange's rules ask.
 */


function initials(name: string): string {
  const words = name.replace(/['’]s\b/g, '').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w))
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?'
}

/** The design's pastel avatar fills, one per row in turn. */
const PASTELS = ['bg-design-peach', 'bg-design-blue-tint', 'bg-design-good-tint', 'bg-design-track', 'bg-design-pink-tint', 'bg-design-warn-tint', 'bg-design-lilac-tint']
export function RowAvatar({ name, index }: { name: string; index: number }) {
  return (
    <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-design-ink ${PASTELS[index % PASTELS.length]}`}>
      {initials(name)}
    </span>
  )
}

/** The title row: the white 40 px back button and the 20 px title. */
export function ScreenTitle({ title, back, action }: { title: string; back?: string | undefined; action?: ReactNode }) {
  const goBack = useBack(back ?? '/dealer')
  return (
    <div className="flex h-11 items-center gap-3">
      {back !== undefined && (
        <button
          type="button"
          aria-label="Back"
          onClick={goBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-finder-card text-finder-ink"
        >
          <ChevronLeft size={20} strokeWidth={2.4} aria-hidden />
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold tracking-[-0.02em]">{title}</h1>
      {action}
    </div>
  )
}

/** The home's dark header: the orange-ringed avatar (a link to Profile), the greeting, the name, the pill. */
export function DarkHeader({ name, pill, bell, photo }: { name: string; pill: string; bell?: ReactNode; photo?: string | null | undefined }) {
  const h = new Date().getHours()
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return (
    <header className="flex items-center gap-4 bg-finder-head px-6 pb-[60px] pt-4 text-white">
      <Link to="/dealer/profile" aria-label="Profile" className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-finder-accent bg-design-head-avatar text-xl font-extrabold">
        {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : initials(name)}
      </Link>
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <p className="text-[13px] text-design-head-sub">{greeting}</p>
        <p className="max-w-full truncate text-xl font-extrabold tracking-[-0.02em]">{name}</p>
        <span className="rounded-pill bg-finder-accent px-2.5 py-1 text-xs font-bold text-finder-on-orange">{pill}</span>
      </div>
      {bell && <div className="ml-auto self-start pt-1">{bell}</div>}
    </header>
  )
}

/** The sheet that rises 32 px over the dark header, 28 px corners. */
export function Sheet({ children }: { children: ReactNode }) {
  return <div className="relative -mt-8 flex flex-1 flex-col gap-5 rounded-t-[28px] bg-finder-bg px-6 pb-7 pt-7">{children}</div>
}

/** A figure card: label, value at 22 px, a short line under it. A link when it filters something. */
export function Stat({ label, value, delta, deltaTone = "text-finder-muted", to, ariaLabel, valueTone = "" }: { label: string; value: ReactNode; delta?: string | undefined; deltaTone?: string; to?: string | undefined; ariaLabel?: string | undefined; valueTone?: string }) {
  const body = (
    <>
      <span className="text-xs font-semibold text-finder-muted">{label}</span>
      <span className={`text-[22px] font-extrabold leading-tight tracking-[-0.02em] ${valueTone}`}>{value}</span>
      {delta && <span className={`text-xs font-bold ${deltaTone}`}>{delta}</span>}
    </>
  )
  const cls = 'flex flex-col gap-2 rounded-2xl bg-finder-card p-[18px] transition-transform duration-150 active:scale-[0.97]'
  return to ? (
    <Link to={to} aria-label={ariaLabel} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** A quick action: the 36 px pale-orange box with its icon (a count on its corner when there is one), then the label. */
export function Action({ to, label, icon, badge }: { to: string; label: string; icon: ReactNode; badge?: number }) {
  const named = badge ? `${label}, ${badge} to look into` : label
  return (
    <Link to={to} aria-label={named} className="flex min-w-0 items-center gap-3 rounded-2xl bg-finder-card p-[18px] text-sm font-bold leading-tight transition-transform duration-150 active:scale-[0.97] max-[359px]:flex-col max-[359px]:items-start max-[359px]:gap-2 max-[359px]:p-3.5">
      <span aria-hidden="true" className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-finder-tile text-finder-link">
        {icon}
        {badge ? (
          <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-pill border-2 border-finder-card bg-design-red px-1 text-[11px] font-extrabold leading-none text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>
      <span className="min-w-0">{label}</span>
    </Link>
  )
}

/** A section title, 16 px extra-bold, with an optional link on the right. */
export function SectionTitle({ id, children, link }: { id?: string | undefined; children: ReactNode; link?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="text-base font-extrabold">
        {children}
      </h2>
      {link}
    </div>
  )
}


/** The small status pill on a row. */
export function Pill({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'neutral'; children: ReactNode }) {
  const c = tone === 'good' ? 'bg-design-good-tint text-finder-likely-ink' : tone === 'warn' ? 'bg-design-warn-tint text-finder-limited' : tone === 'bad' ? 'bg-design-bad-tint text-danger' : 'bg-design-track text-finder-muted'
  return <span className={`whitespace-nowrap rounded-pill px-2 py-[3px] text-[11px] font-bold ${c}`}>{children}</span>
}

