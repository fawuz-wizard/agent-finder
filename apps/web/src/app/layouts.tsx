import { Outlet, Link } from 'react-router-dom'
import { AgentTabBar } from '@/features/agent/components/AgentTabBar'
import { DealerTabBar } from '@/features/dealer/components/DealerTabBar'
import { Wordmark } from '@/design'
import { config } from '@/lib/config'
import { useSession } from '@/features/auth/session'
import { t } from '@/i18n'

function DemoRibbon() {
  if (!config.isDemo) return null
  return (
    <p className="bg-night px-4 py-1.5 text-center text-xs font-semibold text-night-text" role="note">
      {t('demo.banner')}
    </p>
  )
}

/** Customer shell: one column, 360 px first, no navigation chrome beyond the header. */
export function CustomerLayout() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <DemoRibbon />
      <Outlet />
    </div>
  )
}

/** Says which app this is and who is signed in — the operator app is not Agent Finder. */
function RoleStrip({ role }: { role: 'Agent' | 'Dealer' }) {
  const { session } = useSession()
  return (
    <div className="flex items-center justify-between border-b border-line bg-brand-faint px-4 py-1.5">
      <span className="rounded-pill bg-brand-light px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-text">
        {role} app
      </span>
      <span className="truncate text-xs font-semibold text-muted">{session?.name}</span>
    </div>
  )
}

/** Agent shell: the five modules sit in a tab bar that never leaves the screen. */
export function AgentLayout() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <DemoRibbon />
      <RoleStrip role="Agent" />
      <Outlet />
      <AgentTabBar />
    </div>
  )
}

/** Dealer shell: same app as the agent, its own five tabs. */
export function DealerLayout() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <DemoRibbon />
      <RoleStrip role="Dealer" />
      <Outlet />
      <DealerTabBar />
    </div>
  )
}

/** Admin shell: desktop-oriented, left rail. */
/** Not routed for the pilot (see router.tsx); the admin surface returns after the competition. */
export function AdminLayout() {
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-line bg-paper p-4 md:flex">
        <div className="mb-4">
          <Link to="/admin"><Wordmark size={24} /></Link>
          <p className="mt-1 text-xs font-semibold text-muted">OPERATIONS</p>
        </div>
        {[
          ['/admin', 'Needs attention'],
          ['/admin/agents', 'Agents'],
          ['/admin/reports', 'Reports'],
        ].map(([to, label]) => (
          <Link key={to} to={to!} className="rounded-card px-3 py-2 text-sm font-semibold text-ink hover:bg-brand-faint">
            {label}
          </Link>
        ))}
      </aside>
      <main className="flex-1">
        <DemoRibbon />
        <div className="p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
