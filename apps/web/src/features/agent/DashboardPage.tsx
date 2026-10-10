import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import { useSession } from '@/features/auth/session'
import { PRESENCE_LABELS } from '@/types/operator'
import type { AgentHome, Presence } from '@/types/operator'
import { FinderBox, FinderCta, FinderHeader } from '@/features/end-user/components/finder'
import { EdgeCard, PILL_OFF, PILL_ON, PlaceRow, SectionLabel } from './components/agentChrome'
import { ListingCard } from './components/ListingCard'
import { floatRowText } from './floatRow'

const PRESENCE: { value: Presence; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'hidden', label: 'Away' },
  { value: 'closed', label: 'Closed' },
]

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <span className="text-3xl font-bold leading-none text-white">{value}</span>
      <span className="text-center text-sm font-semibold text-finder-muted">{label}</span>
    </div>
  )
}

/**
 * Dashboard: the screen the agent opens twenty times a day. Your own listing as customers
 * see it, Open / Away / Closed, alerts only when there is one, today's three figures, and
 * the float request's state. The chart and the timeline live on the Activity tab.
 */
export default function DashboardPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const home = useAsync<AgentHome>((s) => operatorApi.home(ref, s), [ref])
  const [saving, setSaving] = useState<Presence | 'extend' | null>(null)
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
      <div className="flex flex-col gap-4 px-5 pb-8 text-white">
        <FinderHeader title="Dashboard" />
        <p className="text-base font-medium text-finder-muted">Loading your day…</p>
      </div>
    )
  if (home.state === 'error' || !home.data)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 text-white">
        <FinderHeader title="Dashboard" />
        <p className="text-base font-semibold text-danger">{home.error}</p>
        <FinderCta onClick={home.refresh}>Try again</FinderCta>
      </div>
    )

  const data = home.data
  const d = data.declaration
  const presenceTone = d.presence === 'open' ? 'text-finder-likely' : d.presence === 'hidden' ? 'text-warning' : 'text-finder-muted'

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-white">
      <FinderHeader title="Dashboard" />

      <div className="mt-6">
        <PlaceRow
          name={data.name}
          sub={<>{data.ref} · {data.area}</>}
          action={
            <Link to="/agent/hours" aria-label="Working hours" className="flex h-control items-center">
              Hours
            </Link>
          }
        />
      </div>
      <p className="mt-1 text-sm font-medium text-finder-muted">{data.schedule.hours_text}</p>

      {data.schedule.notice && (
        <EdgeCard className="mt-4" role="status">
          <p className="text-base font-bold">{data.schedule.notice}</p>
          <button type="button" onClick={stayOpen} disabled={saving !== null} className="h-control self-start text-base font-bold text-finder-link">
            {saving === 'extend' ? 'Saving…' : 'Stay open 1 more hour'}
          </button>
        </EdgeCard>
      )}

      <div className="mt-6 flex flex-col gap-3">
        <SectionLabel id="customers-see">Customers now see</SectionLabel>
        <ListingCard name={data.name} street={data.area} see={data.customers_see} />
      </div>

      <h1 className="mt-6 text-xl font-bold leading-tight">Are you open?</h1>
      <div role="radiogroup" aria-label="Are you open?" className="mt-5 flex gap-3">
        {PRESENCE.map((p) => (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={d.presence === p.value}
            disabled={saving !== null}
            onClick={() => void setPresence(p.value)}
            className={`h-[50px] flex-1 rounded-pill text-base font-bold transition-colors ${d.presence === p.value ? PILL_ON : PILL_OFF}`}
          >
            {saving === p.value ? '…' : p.label}
          </button>
        ))}
      </div>
      <p className={`mt-3 text-base font-bold ${presenceTone}`}>{PRESENCE_LABELS[d.presence]}</p>
      {d.source_text && <p className="mt-0.5 text-sm font-medium text-finder-muted">{d.source_text}</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {data.attention.map((sentence) => (
        <FinderBox key={sentence} className="mt-4 border-l-4 border-danger px-5 py-4" role="status">
          <p className="text-base font-bold">{sentence}</p>
        </FinderBox>
      ))}

      <SectionLabel className="mt-6">Today</SectionLabel>
      <FinderBox className="mt-3 flex min-h-[60px] items-center divide-x divide-finder-line px-2 py-4">
        <Figure label="Found you" value={String(data.today.found_you)} />
        <Figure label={data.today.transactions === null ? 'Logged by you' : 'Transactions'} value={String(data.today.transactions ?? data.today.logged)} />
        <Figure label="Reported a problem" value={String(data.today.reported_problems)} />
      </FinderBox>

      <SectionLabel className="mt-6">Float</SectionLabel>
      <FinderBox className="mt-3 flex min-h-[60px] items-center justify-between gap-3 px-5 py-2">
        <span className="text-base font-bold">Float request</span>
        <Link to="/agent/services" className="text-base font-bold text-finder-link">
          {floatRowText(data.latest_float)} ›
        </Link>
      </FinderBox>
    </div>
  )
}
