import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import { useSession } from '@/features/auth/session'
import type { AgentHome, AgentProfile, Presence } from '@/types/operator'
import { FinderCta } from '@/features/end-user/components/finder'
import { AgentTitle } from './components/agentKit'
import { Icon } from './components/agentIcons'
import { BOX, OUTLINE, PRIMARY } from './components/agentClasses'
import { BEEP_AWAY_BASE, askToBeep, beep, cancelBeep } from '@/lib/notify'
import { AWAY_REMINDER_MIN } from './shopPresence'

const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** Away chosen by the agent: "You're still Away" at 30, 60 and 90 minutes, in working hours only. */
async function remindWhileAway(closesAt: string | null) {
  const close = closesAt ? new Date(new Date().toDateString() + ' ' + closesAt).getTime() : null
  const ok = await askToBeep()
  AWAY_REMINDER_MIN.forEach((min, k) => {
    const at = new Date(Date.now() + min * 60_000)
    if (!ok || (close !== null && at.getTime() >= close)) return
    void beep({ id: BEEP_AWAY_BASE + k, title: "You're still Away", body: 'Customers are not sent to you. Tap to open again.', at })
  })
}

function stopAwayReminders() {
  AWAY_REMINDER_MIN.forEach((_, k) => void cancelBeep(BEEP_AWAY_BASE + k))
}

/**
 * Service Status, the new design's screen 10, nothing added: two cards, Open for Business and
 * Away (the one in force is lit; tap the other to switch), where the shop is pinned and the
 * service radius, Update Location, and the switch button. Nothing here shows a balance.
 * Low / none today and Close for today are off this screen for now, as in the design.
 */
export default function StatusPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const home = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])
  const profile = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])
  const [saving, setSaving] = useState<Presence | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function setPresence(presence: Presence) {
    if (!home.data || saving) return
    setSaving(presence)
    setError(null)
    try {
      await operatorApi.declare(ref, { presence, night_mode: home.data.declaration.night_mode })
      if (presence === 'hidden') void remindWhileAway(home.data.schedule.closes_at)
      else stopAwayReminders()
      home.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(null)
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
  const open = presence === 'open'
  const toggle = () => void setPresence(open ? 'hidden' : 'open')

  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <AgentTitle title="Service Status" />
      <div className="flex flex-1 flex-col gap-3.5 px-[18px] pb-8 pt-6">
        {/* Not confirmed at the pin: said plainly, nothing to tap; walking back is enough. */}
        {data.checkin_text && presence === 'open' && (
          <div role="status" className="flex items-center gap-3.5 rounded-[14px] border border-design-amber bg-design-warn-tint px-4 py-[18px]">
            <span aria-hidden="true" className="h-7 w-7 shrink-0 rounded-full bg-design-amber" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-base font-bold">{data.checkin?.hidden_reason === 'away_from_pin' ? 'Hidden · away from your pin' : 'Hidden · open the app at your shop'}</span>
              <span className="text-xs text-finder-muted">
                {data.checkin?.hidden_reason === 'away_from_pin' ? `Since ${hm(data.checkin.away_since!)}. You show again when you're back.` : `No check-in since ${hm(data.checkin!.last_at)}. Opening the app at your shop is enough.`}
              </span>
            </span>
          </div>
        )}
        {/* The design's two state cards: the one in force is lit; tapping the other switches. */}
        {(
          [
            ['open', 'Open for Business', 'You are visible to customers', Icon.check()],
            ['hidden', 'Away', 'Hidden from customers · tap to reopen', Icon.pause()],
          ] as const
        ).map(([value, label, sub, mark]) => {
          const on = value === 'open' ? open : !open
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => !on && void setPresence(value)}
              disabled={saving !== null}
              className={`flex items-center gap-3.5 rounded-[14px] border px-4 py-[18px] text-left transition-transform duration-150 active:scale-[0.98] ${on && value === 'open' ? 'border-agent-open-line bg-agent-green-tint' : 'border-agent-field-line bg-agent-chip'}`}
            >
              <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${value === 'open' ? (on ? 'bg-agent-green' : 'bg-agent-away-dot') : 'bg-agent-away-dot'}`}>
                {mark}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1" role={on ? 'status' : undefined}>
                <span className={`text-base font-bold ${on && value === 'open' ? 'text-agent-green-ink' : ''}`}>{value === 'hidden' && presence === 'closed' ? 'Closed' : label}</span>
                <span className={`text-xs ${on && value === 'open' ? 'text-agent-open-sub' : 'text-finder-muted'}`}>{value === 'hidden' && presence === 'closed' ? 'Customers see you as closed · tap Open to open' : sub}</span>
              </span>
              <span className={on && value === 'open' ? 'text-agent-green-ink' : 'text-finder-muted'}>{Icon.chevron()}</span>
            </button>
          )
        })}

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
          {data.checkin && (
            <>
              <div className="h-px bg-agent-divider" />
              <div className="flex gap-3.5">
                <span className="text-finder-muted">{Icon.check()}</span>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">Last check-in at the shop</span>
                  <span className={`text-[13px] ${data.checkin.hidden_reason ? 'text-finder-muted' : 'font-semibold text-agent-green-ink'}`}>
                    {hm(data.checkin.last_at)}
                    {data.checkin.hidden_reason ? '' : ` · visible until ${hm(data.checkin.visible_until)}`}
                    {data.checkin.location_check ? '' : ' · location check off'}
                  </span>
                </div>
              </div>
            </>
          )}
          <div className="h-px bg-agent-divider" />
          <div className="flex gap-3.5">
            <span className="text-finder-muted">{Icon.target()}</span>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Service Radius</span>
              <span className="text-[13px] text-finder-muted">Customers within 500 m see you first</span>
            </div>
          </div>
        </div>

        <Link to="/agent/shop" className={`${PRIMARY} mt-2 h-[54px]`}>
          {p && !p.located ? 'Pin my shop' : 'Update Location'}
        </Link>
        <button type="button" onClick={toggle} disabled={saving !== null} className={OUTLINE}>
          {saving ? '…' : open ? 'Go Away' : 'Open for Business'}
        </button>
        {data.declaration.source_text && <p className="text-sm font-medium text-finder-muted">{data.declaration.source_text}</p>}
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}

      </div>
    </div>
  )
}
