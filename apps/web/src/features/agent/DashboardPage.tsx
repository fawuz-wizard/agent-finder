import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import { useSession } from '@/features/auth/session'
import { PRESENCE_LABELS } from '@/types/operator'
import type { AgentHome, AgentTransactions, LowLevel, Presence } from '@/types/operator'
import { FinderBox, FinderCta } from '@/features/end-user/components/finder'
import { EdgeCard, PILL_OFF, PILL_ON, PlaceRow, SectionLabel } from './components/agentChrome'
import { ListingCard } from './components/ListingCard'
import { SeenAsCard } from './components/SeenAsCard'
import { floatRowText } from './floatRow'
import { formatSle } from './money'
import { BEEP_CLOSING, askToBeep, beep, cancelBeep } from '@/lib/notify'
import { readPrefs } from '@/lib/prefs'

const PRESENCE: { value: Presence; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'hidden', label: 'Away' },
  { value: 'closed', label: 'Closed' },
]

function Figure({ label, value, tone = 'text-finder-ink' }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex flex-1 flex-col items-start gap-1">
      <span className={`whitespace-nowrap text-2xl font-bold leading-none ${tone}`}>{value}</span>
      <span className="text-sm font-medium text-finder-muted">{label}</span>
    </span>
  )
}

/**
 * Dashboard: the screen the agent opens twenty times a day, in five blocks and one screen.
 * The shop and its hours; Are you open?, the one thing they touch, right under it; an alert
 * only when there is one; what customers see, as the two chips; today's three figures; the
 * float request. Nothing is said twice. The chart and the timeline live on the Activity tab.
 */
export default function DashboardPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const home = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])
  const tx = useAsync<AgentTransactions>((s) => operatorApi.transactions(ref, s), [ref])
  const [saving, setSaving] = useState<Presence | 'extend' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The agent's one correction: low on cash or float today. Only ever lowers what customers read.
  const [lowOpen, setLowOpen] = useState(false)
  const [lowSaving, setLowSaving] = useState<string | null>(null)

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

  async function stayOpen() {
    setSaving('extend')
    try {
      await operatorApi.setToday(ref, { extend_minutes: 60 })
      home.refresh()
    } finally {
      setSaving(null)
    }
  }

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
  const d = data.declaration
  const presenceTone = d.presence === 'open' ? 'text-finder-likely' : d.presence === 'hidden' ? 'text-warning' : 'text-finder-muted'
  const lowText = data.low.cash_out || data.low.deposit ? 'Low today · change ›' : 'Low on cash out or cash in today? ›'

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <div className="mt-6">
        <PlaceRow
          name={data.name}
          sub={<>{data.ref} · {data.area} · {data.schedule.hours_text}</>}
          action={
            <Link to="/agent/hours" aria-label="Working hours" className="flex h-control items-center">
              Hours
            </Link>
          }
        />
      </div>

      {data.schedule.notice && (
        <EdgeCard className="mt-5" role="status">
          <p className="text-base font-bold">{data.schedule.notice}</p>
          <button type="button" onClick={stayOpen} disabled={saving !== null} className="h-control self-start text-base font-bold text-finder-link">
            {saving === 'extend' ? 'Saving…' : 'Stay open 1 more hour'}
          </button>
        </EdgeCard>
      )}

      <h1 className="mt-8 text-lg font-bold leading-tight">Are you open?</h1>
      <div role="radiogroup" aria-label="Are you open?" className="mt-4 flex gap-3">
        {PRESENCE.map((p) => (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={d.presence === p.value}
            disabled={saving !== null}
            onClick={() => void setPresence(p.value)}
            className={`h-[2.9rem] flex-1 rounded-pill text-base font-bold transition-colors ${d.presence === p.value ? PILL_ON : PILL_OFF}`}
          >
            {saving === p.value ? '…' : p.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className={`text-base font-bold ${presenceTone}`}>{PRESENCE_LABELS[d.presence]}</p>
        <button type="button" onClick={() => setLowOpen((v) => !v)} aria-expanded={lowOpen} className="flex h-control items-center text-sm font-bold text-finder-link">
          {lowText}
        </button>
      </div>
      {d.source_text && <p className="text-sm font-medium text-finder-muted">{d.source_text}</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      {lowOpen && (
        <FinderBox className="mt-3 flex flex-col gap-4 px-4 py-4" aria-label="Low today">
          {(
            [
              ['cash_out', 'Cash out', 'the cash you hand over'],
              ['deposit', 'Cash in', 'the float you credit'],
            ] as const
          ).map(([side, label, hint]) => {
            const current = data.low[side]
            return (
              <div key={side} className="flex flex-col gap-2">
                <p className="text-sm font-bold">
                  {label} <span className="font-medium text-finder-muted">{hint}</span>
                </p>
                <div role="radiogroup" aria-label={`${label} today`} className="flex gap-2">
                  {(
                    [
                      ['ok', 'Fine'],
                      ['low', 'Low'],
                      ['none', 'None'],
                    ] as const
                  ).map(([level, text]) => {
                    const on = level === 'ok' ? current === null : current === level
                    return (
                      <button
                        key={level}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={lowSaving !== null}
                        onClick={() => void setLow(side, level)}
                        className={`h-chip flex-1 rounded-pill text-sm font-bold ${on ? PILL_ON : PILL_OFF}`}
                      >
                        {lowSaving === `${side}:${level}` ? '…' : text}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <p className="text-xs font-medium text-finder-muted">
            Low: only small amounts read as likely. None: that side reads as unavailable. Both last {data.low.until_text}; you can only lower what customers read, never raise it.
          </p>
        </FinderBox>
      )}

      {data.attention.map((sentence) => (
        <p key={sentence} role="status" className="mt-5 border-l-4 border-danger pl-4 text-base font-bold leading-snug">
          {sentence}
        </p>
      ))}

      <div className="mt-8 flex flex-col gap-3">
        <SectionLabel id="customers-see">{data.seen_as && data.customers_see.state === 'open' ? 'How customers see you' : 'Customers now see'}</SectionLabel>
        {data.seen_as && data.customers_see.state === 'open' ? (
          <SeenAsCard name={data.name} street={data.area} note={data.seen_as} />
        ) : (
          <ListingCard name={data.name} street={data.area} see={data.customers_see} photoUrl={data.photo_url} compact frame={false} />
        )}
      </div>

      <SectionLabel className="mt-8">Today</SectionLabel>
      <div className="mt-3 flex items-start divide-x divide-finder-line [&>*]:px-3 [&>*:first-child]:pl-0">
        <Link to="/agent/activity" className="flex flex-1" aria-label="Today's commission, see Activity">
          <Figure
            label="commission ›"
            value={tx.data ? `${tx.data.estimated_any ? '≈ ' : ''}${formatSle(tx.data.commission_total_sle)}` : '—'}
            tone="text-finder-likely"
          />
        </Link>
        <Figure label="found you" value={String(data.today.found_you)} />
        <Figure label={data.today.transactions === null ? 'logged by you' : 'transactions'} value={String(data.today.transactions ?? data.today.logged)} />
      </div>

      <div className="mt-8 flex min-h-[3.25rem] items-center justify-between gap-3 border-t border-finder-line pt-3">
        <span className="text-base font-bold">Float request</span>
        <Link to="/agent/services" className="text-base font-bold text-finder-link">
          {floatRowText(data.latest_float)} ›
        </Link>
      </div>
    </div>
  )
}
