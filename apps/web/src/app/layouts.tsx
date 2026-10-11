import { Outlet, Link } from 'react-router-dom'
import { AgentStrip, AgentTabBar } from '@/features/agent/components/agentChrome'
import { ShopPresenceWatch } from '@/features/agent/components/ShopPresence'
import { AggregatorStrip, DealerTabBar } from '@/features/dealer/components/DealerTabBar'
import { Wordmark } from '@/design'
import { HostStrip } from '@/features/end-user/components/finder'
import { config } from '@/lib/config'
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


/** Agent shell: the customer module's dark surface and three tabs that never leave the screen. */
export function AgentLayout() {
  return (
    <div data-theme="dark" className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-finder-bg font-finder text-white md:min-h-0 md:my-8 md:border-2 md:border-finder-line">
      <DemoRibbon />
      <AgentStrip />
      <ShopPresenceWatch />
      <Outlet />
      <AgentTabBar />
    </div>
  )
}

/** Aggregator shell: the same dark surface as the agent's, its own four tabs. */
export function DealerLayout() {
  return (
    <div data-theme="dark" className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-finder-bg font-finder text-white md:min-h-0 md:my-8 md:border-2 md:border-finder-line">
      <DemoRibbon />
      <AggregatorStrip />
      <Outlet />
      <DealerTabBar />
    </div>
  )
}

/** Sign-in shell: the finder's dark surface, phone-width, no tabs. */
export function SignInLayout() {
  if (config.surface !== 'agent') return <CustomerLayout />
  return (
    <div data-theme="dark" className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-finder-bg font-finder text-white md:min-h-0 md:my-8 md:border-2 md:border-finder-line">
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
