import { Outlet, Link } from 'react-router-dom'
import { AgentTabBar } from '@/features/agent/components/AgentTabBar'
import { DealerTabBar } from '@/features/dealer/components/DealerTabBar'
import { LogoMark, Wordmark } from '@/design'
import { HostStrip } from '@/features/end-user/components/finder'
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
    // text-ink re-resolves the inherited colour inside the forced dark scope; without it,
    // descendants inherit the light ink already computed on <html>.
    <div data-theme="dark" className="flex min-h-dvh w-full flex-col bg-finder-bg font-finder text-ink">
      <DemoRibbon />
      {/* The customer module ships embedded in a phone super-app; on desktop it presents as a
          framed phone-width module rather than stretching into a thin full-width stack. */}
      <main className="mx-auto flex min-h-0 w-full max-w-[480px] flex-1 flex-col bg-finder-bg md:my-8 md:min-h-[900px] md:flex-none md:border-2 md:border-line">
        <HostStrip />
        <Outlet />
      </main>
    </div>
  )
}

/**
 * Says which app this is and who is signed in: the brand mark, the app's name, the account.
 * Boosted's global header on a phone: black on white, one rule underneath.
 */
function RoleStrip({ role }: { role: 'Agent' | 'Aggregator' }) {
  const { session } = useSession()
  return (
    <div className="flex h-11 items-center justify-between gap-3 border-b-2 border-ink bg-paper px-4">
      <span className="flex items-center gap-2 text-sm font-bold tracking-tight">
        <LogoMark size={22} className="text-ink" />
        {role} App
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-muted">{session?.name}</span>
    </div>
  )
}

const shell = 'mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-x-hidden bg-canvas md:min-h-0 md:my-8 md:border-2 md:border-line'

/** Agent shell: the five modules sit in a tab bar that never leaves the screen. */
export function AgentLayout() {
  return (
    <div className={shell}>
      <DemoRibbon />
      <RoleStrip role="Agent" />
      <Outlet />
      <AgentTabBar />
    </div>
  )
}

/** Aggregator shell: same app as the agent, its own five tabs. */
export function DealerLayout() {
  return (
    <div className={shell}>
      <DemoRibbon />
      <RoleStrip role="Aggregator" />
      <Outlet />
      <DealerTabBar />
    </div>
  )
}

/** Sign-in shell: light, phone-width, no tabs. The Agent App never shows the customer's dark module. */
export function SignInLayout() {
  if (config.surface !== 'agent') return <CustomerLayout />
  return (
    <div className={shell}>
      <DemoRibbon />
      <Outlet />
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
