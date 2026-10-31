import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { DealerMe } from '@/types/operator'
import { Line } from '@/features/agent/components/agentChrome'
import { ScreenTitle } from './components/designKit'
import { CARD, OUTLINE, PAGE } from './components/designClasses'

const REGION: Record<string, string> = { west: 'West', north: 'North', east: 'East', south: 'South' }

function MenuRow({ to, label, first, onClick, open }: { to?: string; label: string; first?: boolean; onClick?: () => void; open?: boolean }) {
  const cls = `flex w-full items-center gap-3 px-[18px] py-[17px] text-left text-[15px] font-semibold ${first ? '' : 'border-t border-finder-card-line'}`
  const body = (
    <>
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-finder-accent" />
      <span className="flex-1">{label}</span>
      <ChevronRight size={16} strokeWidth={2.4} className={`text-finder-muted transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
    </>
  )
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" aria-expanded={open} onClick={onClick} className={cls}>
      {body}
    </button>
  )
}

/**
 * Profile, as the approved design's screen 19: who you are, a menu of where to go, Log out.
 * Organization details opens Orange's record of you, read only, and your network in five
 * figures, the same figures as before. Appearance, PIN, access and about live on Settings.
 */
export default function DealerProfilePage() {
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const me = useAsync<DealerMe>((s) => operatorApi.me(s))
  const d = me.data
  const [details, setDetails] = useState(false)
  const of = (n: number) => (d ? `${n} of ${d.agents}` : '')
  const warn = (n: number) => (d && n < d.agents ? 'text-warning' : 'text-finder-likely-ink')
  const name = d?.name ?? session?.name ?? 'Aggregator'
  const two = name.replace(/['’]s\b/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')

  return (
    <div className={PAGE}>
      <ScreenTitle title="Profile" back="/dealer" />

      <section className={`${CARD} flex items-center gap-4 p-5`}>
        <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-design-peach text-xl font-extrabold text-design-ink">
          {two}
        </span>
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <h2 className="max-w-full truncate text-lg font-extrabold">{name}</h2>
          {d?.msisdn_masked && <p className="text-[13px] text-finder-muted">{d.msisdn_masked}</p>}
          <span className="rounded-pill bg-finder-tile px-2.5 py-1 text-xs font-bold text-finder-link">Aggregator{d?.region ? ` · ${REGION[d.region] ?? d.region}` : ''}</span>
        </div>
      </section>

      {me.state === 'loading' && <p className="text-sm font-medium text-finder-muted">Loading…</p>}
      {me.state === 'error' && <p className="text-sm font-semibold text-danger">{me.error}</p>}

      <nav aria-label="Profile" className={`${CARD} py-1`}>
        <MenuRow first label="Organization details" open={details} onClick={() => setDetails((v) => !v)} />
        {details && d && (
          <div className="border-t border-finder-card-line px-[18px] pb-3">
            <Line label="Orange Money number" value={d.msisdn_masked ?? '—'} />
            <Line label="Region" value={d.region ? (REGION[d.region] ?? d.region) : '—'} />
            <Line label="On Orange's list" value={`${d.source === 'orange_file' ? "Orange's file" : 'Registered in the app'}${d.since_text ? ` · ${d.since_text}` : ''}`} />
            <Line label="Agents" value={d.agents} />
            <Line label="Verified" value={<span className={warn(d.verified)}>{of(d.verified)}</span>} />
            <Line label="On the map for customers" value={<span className={warn(d.on_map)}>{of(d.on_map)}</span>} />
            <Line label="Signed in to the app" value={<span className={warn(d.signed_in)}>{of(d.signed_in)}</span>} />
            <Line label="Sub-aggregators" value={d.subaggregators} />
            <p className="pt-2 text-xs font-medium text-finder-muted">Orange's record is read only. If something here is wrong, tell the Agent Finder team.</p>
          </div>
        )}
        <MenuRow to="/dealer/agents" label="Manage agents" />
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
    </div>
  )
}
