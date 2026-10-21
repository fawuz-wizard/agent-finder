import { Link } from 'react-router-dom'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { PERMISSIONS } from '@/types/operator'
import type { DealerReport } from '@/types/operator'
import { GearIcon, Line, SectionLabel } from '@/features/agent/components/agentChrome'

const PERMISSION_TEXT: Record<string, string> = {
  [PERMISSIONS.viewAgent]: 'See your agents',
  [PERMISSIONS.viewFinancial]: 'Reveal financial detail (recorded)',
  [PERMISSIONS.manageFloat]: 'Decide float requests',
  [PERMISSIONS.viewHistory]: 'See agent history',
  [PERMISSIONS.contact]: 'Contact agents',
  [PERMISSIONS.escalate]: 'Escalate to Orange',
  [PERMISSIONS.manageAgent]: 'Register agents and pin their shops',
}

const chevron = <span aria-hidden="true">›</span>

/**
 * Profile: who you are and what you may do, then two doors: the report with its records,
 * and the financial reveals you made. Your own choices, appearance, PIN, about, sign out,
 * live under the gear, on Settings.
 */
export default function DealerProfilePage() {
  const { session } = useSession()
  const report = useAsync<DealerReport>((s) => operatorApi.report(s))
  const door = 'flex min-h-[3rem] items-center justify-between gap-4 border-b border-finder-line py-1 text-base font-semibold text-finder-ink last:border-b-0'

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">{session?.name ?? 'Aggregator'}</h1>
          <p className="mt-1 text-sm font-medium text-finder-muted">Aggregator account{report.data ? ` · ${report.data.agents} agents` : ''}</p>
        </div>
        <Link to="/dealer/settings" aria-label="Settings" className="flex h-control w-control shrink-0 items-center justify-center rounded-pill border-2 border-finder-ink text-finder-ink">
          <GearIcon />
        </Link>
      </div>

      <SectionLabel className="mt-8">What you may do</SectionLabel>
      <div className="mt-2 flex flex-col">
        {(session?.permissions ?? []).map((p) => (
          <Line key={p} label={PERMISSION_TEXT[p] ?? p} value="" />
        ))}
      </div>
      <p className="mt-2 text-xs font-medium text-finder-muted">Granted one by one. The server checks every request; this list only decides what the app offers.</p>

      <div className="mt-8 flex flex-col">
        <Link to="/dealer/records" className={door}>
          <span>Report and records</span>
          {chevron}
        </Link>
        <Link to="/dealer/reveals" className={door}>
          <span>Your financial reveals</span>
          {chevron}
        </Link>
      </div>
    </div>
  )
}
