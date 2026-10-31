import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import { useSession } from '@/features/auth/session'
import type { AgentHome, AgentProfile, LowLevel, Presence } from '@/types/operator'
import { FinderCta } from '@/features/end-user/components/finder'
import { readPrefs } from '@/lib/prefs'
import { Segmented } from './components/agentChrome'
import { AgentTitle } from './components/agentKit'
import { Icon } from './components/agentIcons'
import { BOX, OUTLINE, PRIMARY } from './components/agentClasses'

const LEVELS: { value: 'ok' | LowLevel; label: string }[] = [
  { value: 'ok', label: 'Normal' },
  { value: 'low', label: 'Low today' },
  { value: 'none', label: 'None today' },
]

/**
 * Shop status, the "Open / Close" tile of the home screen: open, closed or away; low or none
 * today for each side, which only ever lowers what customers read; where the shop is pinned and
 * whether the aggregator confirmed it; the hours. Nothing here shows a balance.
 */
export default function StatusPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const home = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])
  const profile = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])
  const [saving, setSaving] = useState<Presence | null>(null)
  const [lowSaving, setLowSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function setPresence(presence: Presence) {
    if (!home.data || saving) return
    setSaving(presence)
    setError(null)
    try {
      await operatorApi.declare(ref, { presence, night_mode: home.data.declaration.night_mode })
      home.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(null)
    }
  }

  async function setLow(side: 'cash_out' | 'deposit', level: 'ok' | LowLevel) {
    if (lowSaving) return
    setLowSaving(`${side}:${level}`)
    setError(null)
    try {
      await operatorApi.setLow(ref, side, level)
      home.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setLowSaving(null)
    }
  }

  if (home.state === 'loading')
    return (
      <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
        <AgentTitle title="Service Status" />
        <p className="mt-6 text-base font-medium text-finder-muted">Loading…</p>
      </div>
    )
  if (home.state === 'error' || !home.data)
    return (
      <div className="flex flex-1 flex-col gap-4 px-5 pb-8 text-finder-ink">
        <AgentTitle title="Service Status" />
        <p className="text-base font-semibold text-danger">{home.error}</p>
        <FinderCta onClick={home.refresh}>Try again</FinderCta>
      </div>
    )

  const data = home.data
  const presence = data.declaration.presence
  const p = profile.data
  const watch = readPrefs().leftShopWatch
  const open = presence === 'open'
  const toggle = () => void setPresence(open ? 'hidden' : 'open')

  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <AgentTitle title="Service Status" />
      <div className="flex flex-1 flex-col gap-3.5 px-[18px] pb-8 pt-6">
        {/* The design's state card: tap it to switch between open and away. */}
        <button
          type="button"
          onClick={toggle}
          disabled={saving !== null}
          className={`flex items-center gap-3.5 rounded-[14px] border px-4 py-[18px] text-left transition-transform duration-150 active:scale-[0.98] ${open ? 'border-agent-open-line bg-agent-green-tint' : 'border-agent-field-line bg-agent-chip'}`}
        >
          <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${open ? 'bg-agent-green' : 'bg-agent-away-dot'}`}>
            {open ? Icon.check() : Icon.pause()}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1" role="status">
            <span className={`text-base font-bold ${open ? 'text-agent-green-ink' : ''}`}>{open ? 'Open for Business' : presence === 'closed' ? 'Closed' : 'Away'}</span>
            <span className={`text-xs ${open ? 'text-agent-open-sub' : 'text-finder-muted'}`}>
              {open ? 'You are visible to customers' : presence === 'closed' ? 'Customers see you as closed · tap to open' : 'Hidden from customers · tap to reopen'}
            </span>
          </span>
          <span className={open ? 'text-agent-green-ink' : 'text-finder-muted'}>{Icon.chevron()}</span>
        </button>

        <div className={`${BOX} flex flex-col gap-5 px-4 py-[18px]`}>
          <div className="flex gap-3.5">
            <span className="text-finder-muted">{Icon.pin()}</span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-semibold">Current Location</span>
              <span className="text-[13px] text-finder-muted">{p?.area ?? data.area}</span>
              {p?.located && (
                <span className={`text-xs font-semibold ${p.location_confirmed ? 'text-agent-green' : 'text-finder-muted'}`}>
                  {p.location_confirmed ? `Confirmed by ${p.dealer_name}` : `Waiting for ${p.dealer_name} to confirm`}
                </span>
              )}
            </div>
          </div>
          <div className="h-px bg-agent-divider" />
          <div className="flex gap-3.5">
            <span className="text-finder-muted">{Icon.target()}</span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Service Radius</span>
              <span className="text-[13px] text-finder-muted">Customers within 500 m see you first</span>
            </div>
          </div>
        </div>

        <Link to="/agent/profile" className={`${PRIMARY} mt-2 h-[54px]`}>
          {p && !p.located ? 'Pin my shop' : 'Update Location'}
        </Link>
        <button type="button" onClick={toggle} disabled={saving !== null} className={OUTLINE}>
          {saving ? '…' : open ? 'Go Away' : 'Open for Business'}
        </button>
        {presence !== 'closed' && (
          <button type="button" onClick={() => void setPresence('closed')} disabled={saving !== null} className="h-control text-sm font-bold text-finder-link">
            Close for today
          </button>
        )}

        <h2 className="mt-3 text-base font-bold">Cash today</h2>
        {(
          [
            ['cash_out', 'Cash out', 'the cash you hand over'],
            ['deposit', 'Cash in', 'the float you credit'],
          ] as const
        ).map(([side, label, hint]) => {
          const current = data.low[side]
          const busy = lowSaving?.startsWith(`${side}:`) ? (lowSaving.split(':')[1] as 'ok' | LowLevel) : null
          return (
            <div key={side} className="flex flex-col gap-2">
              <p className="text-sm font-bold">
                {label} <span className="font-medium text-finder-muted">{hint}</span>
              </p>
              <Segmented label={`${label} today`} options={LEVELS} value={current ?? 'ok'} busy={busy} disabled={lowSaving !== null} onChange={(v) => void setLow(side, v)} />
            </div>
          )
        })}
        <p className="text-xs font-medium text-finder-muted">
          Low: only small amounts read as likely. None: that side reads as unavailable. Both last {data.low.until_text}; you can only lower what customers read, never raise it.
        </p>
        {data.declaration.source_text && <p className="text-sm font-medium text-finder-muted">{data.declaration.source_text}</p>}
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        <Link to="/agent/hours" className={`${BOX} flex min-h-14 items-center justify-between px-4`}>
          <span className="text-sm font-semibold">Working hours</span>
          <span className="text-[13px] text-finder-muted">{data.schedule.hours_text} ›</span>
        </Link>

        <p className="mt-auto pt-6 text-center text-xs leading-relaxed text-finder-muted">
          {watch ? (
            <>
              While the app is open, your phone checks it is near your shop pin.
              <br />
              Your position stays on your phone.
            </>
          ) : (
            'Your position is never checked. Customers see only your shop pin.'
          )}
        </p>
      </div>
    </div>
  )
}
