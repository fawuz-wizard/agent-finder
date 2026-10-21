import { Link } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { DealerMe } from '@/types/operator'
import { GearIcon, Line, SectionLabel } from '@/features/agent/components/agentChrome'

const REGION: Record<string, string> = { west: 'West', north: 'North', east: 'East', south: 'South' }

/**
 * Profile: who you are on the network. Orange's record of you, read only, and your network
 * in five figures. Your own choices, appearance, PIN, access, about, sign out, live under the
 * gear, on Settings. Reporting lives on the Dashboard.
 */
export default function DealerProfilePage() {
  const { session } = useSession()
  const me = useAsync<DealerMe>((s) => operatorApi.me(s))
  const d = me.data
  const of = (n: number) => (d ? `${n} of ${d.agents}` : '')
  const warn = (n: number) => (d && n < d.agents ? 'text-warning' : 'text-finder-likely')

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">{d?.name ?? session?.name ?? 'Aggregator'}</h1>
          <p className="mt-1 text-sm font-medium text-finder-muted">Aggregator{d?.region ? ` · ${REGION[d.region] ?? d.region}` : ''}</p>
        </div>
        <Link to="/dealer/settings" aria-label="Settings" className="flex h-control w-control shrink-0 items-center justify-center rounded-pill border-2 border-finder-ink text-finder-ink">
          <GearIcon />
        </Link>
      </div>

      {me.state === 'loading' && <p className="mt-6 text-base font-medium text-finder-muted">Loading…</p>}
      {me.state === 'error' && <p className="mt-6 text-base font-semibold text-danger">{me.error}</p>}
      {d && (
        <>
          <SectionLabel className="mt-8">Orange record</SectionLabel>
          <div className="mt-2 flex flex-col">
            <Line label="Orange Money number" value={d.msisdn_masked ?? '—'} />
            <Line label="Region" value={d.region ? (REGION[d.region] ?? d.region) : '—'} />
            <Line label="On Orange's list" value={`${d.source === 'orange_file' ? "Orange's file" : 'Registered in the app'}${d.since_text ? ` · ${d.since_text}` : ''}`} />
          </div>

          <SectionLabel className="mt-8">Your network</SectionLabel>
          <div className="mt-2 flex flex-col">
            <Line label="Agents" value={d.agents} />
            <Line label="Verified" value={<span className={warn(d.verified)}>{of(d.verified)}</span>} />
            <Line label="On the map for customers" value={<span className={warn(d.on_map)}>{of(d.on_map)}</span>} />
            <Line label="Signed in to the app" value={<span className={warn(d.signed_in)}>{of(d.signed_in)}</span>} />
            <Line label="Sub-aggregators" value={d.subaggregators} />
          </div>
          <p className="mt-2 text-xs font-medium text-finder-muted">Orange's record is read only. If something here is wrong, tell the Agent Finder team.</p>
        </>
      )}
    </div>
  )
}
