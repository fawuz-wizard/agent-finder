import { useEffect } from 'react'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import { useSession } from '@/features/auth/session'
import type { AgentHome, AgentProfile, AgentTransactions } from '@/types/operator'
import { FinderCta } from '@/features/end-user/components/finder'
import { Bell } from './components/agentChrome'
import { Icon } from './components/agentIcons'
import { BOX } from './components/agentClasses'
import { Link } from 'react-router-dom'
import { floatRowText } from './floatRow'
import { formatSle } from './money'
import { BEEP_CLOSING, askToBeep, beep, cancelBeep } from '@/lib/notify'
import { readPrefs } from '@/lib/prefs'

/**
 * Home, as the new agent design's screen 9 (2026-11-01), nothing added: the dark header (the
 * agent's own name, the Agent pill, the place, the bell), Today's Summary (transactions, total
 * volume and commission, from the agent's records and Orange's rows) and four tiles. Open /
 * Close leads to Service Status; Do Transaction records what the agent did in Orange Money.
 * The closing beep still runs in the background.
 */
export default function DashboardPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const home = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])
  const tx = useAsync<AgentTransactions>((s) => operatorApi.transactions(ref, s), [ref])
  const me = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])

  // The closing beep: fifteen minutes before today's close, so an agent still serving can
  // tap "stay open" instead of vanishing from the map mid-queue. Re-scheduled whenever the
  // day's hours change; one id, so it never stacks.
  const closesAt = home.data?.schedule.closes_at ?? null
  const openNow = home.data?.schedule.open_now ?? false
  useEffect(() => {
    if (!closesAt || !openNow || !readPrefs().closingBeep) {
      void cancelBeep(BEEP_CLOSING)
      return
    }
    const [h, m] = closesAt.split(':').map(Number)
    const at = new Date()
    at.setHours(h ?? 0, (m ?? 0) - 15, 0, 0)
    if (at.getTime() <= Date.now()) return
    void askToBeep().then((ok) => {
      if (ok) void beep({ id: BEEP_CLOSING, title: `Closing at ${closesAt}`, body: 'Still serving? Open the app and tap "Stay open 1 more hour", or customers stop being sent to you.', at })
    })
  }, [closesAt, openNow])

  if (home.state === 'loading')
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 pt-6 text-finder-ink">
        <p className="text-base font-medium text-finder-muted">Loading your day…</p>
      </div>
    )
  if (home.state === 'error' || !home.data)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 pt-6 text-finder-ink">
        <p className="text-base font-semibold text-danger">{home.error}</p>
        <FinderCta onClick={home.refresh}>Try again</FinderCta>
      </div>
    )

  const data = home.data
  const floatText = floatRowText(data.latest_float)
  const done = (tx.data?.rows ?? []).filter((r) => r.successful)
  const count = tx.data ? done.length : (data.today.transactions ?? data.today.logged)
  const volume = done.reduce((n, r) => n + (r.amount_sle ?? 0), 0)
  const commission = tx.data ? `${tx.data.estimated_any ? '≈ ' : ''}${formatSle(tx.data.commission_total_sle).replace(/^SLE /, '')}` : '—'
  const person = me.data?.name ?? data.name
  const initials = person.replace(/['’]s\b/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
  const tile = 'flex h-[108px] flex-col items-center justify-start gap-3 rounded-[14px] bg-finder-tile pt-6 text-center text-[13px] font-semibold leading-tight transition-transform duration-150 active:scale-[0.97] active:bg-agent-tile-press'
  const stat = `${BOX} flex flex-col items-center gap-2.5 rounded-xl px-1.5 py-3 text-center`

  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      {/* The dark header of the design: the avatar ringed in orange, the name, the Agent pill, the place. */}
      <header className="bg-finder-head px-6 pb-11 pt-4 text-white">
        <div className="mt-2 flex items-center gap-4">
          <span aria-hidden="true" className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full border-2 border-finder-accent bg-agent-head-avatar text-xl font-bold text-agent-head-initials">
            {data.photo_url ? <img src={data.photo_url} alt="" className="h-full w-full rounded-full object-cover" /> : initials}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h1 className="truncate text-xl font-bold">{person}</h1>
            <span className="self-start rounded-[20px] bg-finder-accent px-2.5 py-[3px] text-[11px] font-bold text-finder-on-orange">Agent</span>
            <p className="flex items-center gap-1 truncate text-xs text-agent-head-sub">
              {Icon.pin(12)}
              {data.area}{me.data?.city && me.data.city !== data.area ? `, ${me.data.city}` : ''}
            </p>
          </div>
          <Bell className="text-white" />
        </div>
      </header>

      <div className="relative -mt-6 flex flex-1 flex-col gap-3.5 rounded-t-3xl bg-finder-bg px-[18px] pb-8 pt-[22px]">
        <h2 className="text-[17px] font-bold">Today’s Summary</h2>
        <div className="grid grid-cols-3 gap-2">
          <div className={stat}>
            <span className="text-[11px] text-finder-muted">Transactions</span>
            <span className="whitespace-nowrap text-[15px] font-extrabold">{String(count)}</span>
          </div>
          <div className={stat}>
            <span className="text-[11px] text-finder-muted">Total Volume</span>
            <span className="whitespace-nowrap text-[15px] font-extrabold">
              <span className="text-[10px] font-semibold">SLE </span>
              {tx.data ? volume.toLocaleString('en-US') : '—'}
            </span>
          </div>
          <Link to="/agent/history" aria-label="Today's commission, see History" className={stat}>
            <span className="text-[11px] text-finder-muted">Commission</span>
            <span className="whitespace-nowrap text-[15px] font-extrabold">
              <span className="text-[10px] font-semibold">SLE </span>
              {commission}
            </span>
          </Link>
        </div>

        <div className="mt-1 grid grid-cols-2 gap-2.5">
          <Link to="/agent/status" className={tile}>
            <span className="text-finder-link">{Icon.power()}</span>Open / Close
          </Link>
          <Link to="/agent/history" className={tile}>
            <span className="text-finder-link">{Icon.receipt()}</span>Transaction
            <br />
            History
          </Link>
          <Link to="/agent/float" className={tile}>
            <span className="text-finder-link">{Icon.wallet()}</span>
            <span>
              Float Request
              {floatText !== 'Request float' && <span className="block text-[11px] font-medium text-finder-muted">{floatText}</span>}
            </span>
          </Link>
          <Link to="/agent/services" className={tile}>
            <span className="text-finder-link">{Icon.swap()}</span>Do Transaction
          </Link>
        </div>

      </div>
    </div>
  )
}
