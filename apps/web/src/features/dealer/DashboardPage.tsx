import { Link } from 'react-router-dom'
import { Bell as BellIcon, ChartColumn, Settings, TriangleAlert, Users } from 'lucide-react'
import { useEffect } from 'react'
import { useAsync } from '@/hooks/useAsync'
import { keepOverview, readOverview } from './overviewCache'
import { operatorApi } from '@/services/operatorApi'
import type { DealerOverview } from '@/types/operator'
import { FinderCta } from '@/features/end-user/components/finder'
import { Action, DarkHeader, SectionTitle, Sheet, Stat } from './components/designKit'
import { buildDealerNotices, useDealerSeen } from './dealerNotifications'

/** The bell in the dark header: float requests, pins and the forecast, with the unread count. */
function Bell({ unread }: { unread: number }) {
  return (
    <Link
      to="/dealer/notifications"
      aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
      className="relative flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-design-head-avatar text-white transition-transform duration-150 active:scale-[0.95]"
    >
      <BellIcon size={22} strokeWidth={2} aria-hidden />
      {unread > 0 && (
        <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-pill border-2 border-finder-head bg-design-red px-1 text-xs font-extrabold leading-none text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}

/**
 * Dashboard. Answers one question on open: what is happening with all my agents? Four
 * counts, each a filter on the register, and the quick actions. Float requests, pins to
 * confirm and the float forecast are under the bell in the header (NotificationsPage), with
 * the unread count on it; signals live behind the Attention action, with their count on it.
 * No balance or float figure appears here.
 */
export default function DealerDashboardPage() {
  const { state, data, error, refresh } = useAsync<DealerOverview>((s) => operatorApi.dealerOverview(s), [], readOverview())
  useEffect(() => keepOverview(data), [data])
  const { unread } = useDealerSeen(buildDealerNotices(data ?? null))
  // The next screens the aggregator opens from here, fetched while Home is on screen.
  useEffect(() => {
    void import('./AttentionPage')
    void import('./FloatQueuePage')
    void import('./AgentsPage')
    void import('./NetworkPage')
    void import('./NotificationsPage')
  }, [])

  if (state === 'loading' && !data)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 pt-6 text-finder-ink">
        <p className="text-base font-medium text-finder-muted">Loading your agents…</p>
      </div>
    )
  if (!data)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 pt-6 text-finder-ink">
        <p className="text-base font-semibold text-danger">{error}</p>
        <FinderCta onClick={refresh}>Try again</FinderCta>
      </div>
    )

  const share = data.agent_count ? Math.round((data.counts.active / data.agent_count) * 100) : 0
  const count = (bucket: 'active' | 'limited' | 'hidden' | 'closed', label: string, value: number, delta: string, tone: string) => (
    <Stat key={bucket} to={`/dealer/agents?filter=${bucket}`} ariaLabel={`${label}: ${value} — see these agents`} label={label} value={value} valueTone={tone} delta={delta} deltaTone={bucket === 'active' ? 'text-finder-likely-ink' : 'text-finder-muted'} />
  )

  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <DarkHeader name={data.dealer_name} pill="Aggregator" bell={<Bell unread={unread} />} />
      <Sheet>
        <SectionTitle
          link={
            <Link to="/dealer/network" className="text-[13px] font-bold text-finder-link">
              View map
            </Link>
          }
        >
          Network overview
        </SectionTitle>
        <p className="-mt-3 text-[13px] font-medium text-finder-muted">
          {data.on_map} of {data.agent_count} on the map for customers
        </p>
        {data.not_signed_in > 0 && (
          <p className="-mt-2 text-sm font-medium text-warning">
            {data.not_signed_in} {data.not_signed_in === 1 ? 'agent has' : 'agents have'} not signed in yet. Give them their code; customers see them once they are pinned and open.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {count('active', 'Active', data.counts.active, `${share}% of ${data.agent_count}`, 'text-finder-likely-ink')}
          {count('limited', 'Limited', data.counts.limited, 'low or none today', '')}
          {count('hidden', 'Away', data.counts.hidden, 'not sent now', '')}
          {count('closed', 'Closed', data.counts.closed, 'or status too old', 'text-danger')}
        </div>

        <SectionTitle>Quick actions</SectionTitle>
        <div className="-mt-2 grid grid-cols-2 gap-3">
          <Action to="/dealer/agents" label="Agents" icon={<Users size={19} strokeWidth={2} />} />
          <Action to="/dealer/attention" label="Attention" badge={data.signals.length} icon={<TriangleAlert size={19} strokeWidth={2} />} />
          <Action to="/dealer/records" label="Reports" icon={<ChartColumn size={19} strokeWidth={2} />} />
          <Action to="/dealer/settings" label="Settings" icon={<Settings size={19} strokeWidth={2} />} />
        </div>

      </Sheet>
    </div>
  )
}
