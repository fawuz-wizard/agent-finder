import { Outlet, Link, useLocation } from 'react-router-dom'
import { AgentTabBar } from '@/features/agent/components/agentChrome'
import { ShopPresenceWatch } from '@/features/agent/components/ShopPresence'
import { DealerTabBar } from '@/features/dealer/components/DealerTabBar'
import { Wordmark } from '@/design'
import { HostStrip } from '@/features/end-user/components/finder'
import { config } from '@/lib/config'
import { usePlatformTheme } from '@/lib/platformTheme'
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
 * The agent and aggregator platform's frame. On a phone the app is the whole screen. On a
 * laptop it sits in a phone, as the approved design presents it: 390 x 844, a 10 px black
 * bezel with 54 px corners, a soft shadow on the warm grey page, the screen scrolling inside.
 * The demo label sits above the phone, never on the screen.
 */
function PlatformFrame({ theme, app, children }: { theme: string; app?: 'agent' | 'aggregator'; children: React.ReactNode }) {
  return (
    <div data-theme={theme} data-platform={theme} data-app={app} className="flex min-h-dvh flex-col bg-finder-bg font-finder text-finder-ink md:items-center md:justify-center md:gap-4 md:bg-design-nav-line md:py-8">
      {config.isDemo && (
        <p className="bg-night px-4 py-1.5 text-center text-xs font-semibold text-night-text md:rounded-pill md:px-4 md:py-1" role="note">
          {t('demo.banner')}
        </p>
      )}
      <div className="flex w-full flex-1 flex-col md:h-[min(844px,calc(100dvh-6rem))] md:w-[390px] md:flex-none md:rounded-[54px] md:bg-black md:p-[10px] md:shadow-[0_30px_60px_-20px_rgba(0,0,0,0.35)]">
        <div className="no-scrollbar flex min-h-0 flex-1 flex-col bg-finder-bg md:overflow-y-auto md:rounded-[44px]">{children}</div>
      </div>
    </div>
  )
}

/** Agent shell: the platform surface (dark by default, daylight on request) and the tabs that never leave the screen. */
/** The agent screens the new design draws without the tab bar: one task each, with a back arrow. */
const AGENT_NO_TABS = ['/agent/status', '/agent/float', '/agent/profile', '/agent/services', '/agent/profile/personal', '/agent/shop', '/agent/help', '/agent/about', '/agent/pin', '/agent/notification-settings']

export function AgentLayout() {
  const [theme] = usePlatformTheme()
  const { pathname } = useLocation()
  return (
    <PlatformFrame theme={theme} app="agent">
      <ShopPresenceWatch />
      <Outlet />
      {!AGENT_NO_TABS.includes(pathname) && <AgentTabBar />}
    </PlatformFrame>
  )
}

/** Aggregator shell: the same platform surface as the agent's, its own four tabs. */
export function DealerLayout() {
  const [theme] = usePlatformTheme()
  return (
    <PlatformFrame theme={theme}>
      <Outlet />
      <DealerTabBar />
    </PlatformFrame>
  )
}

/** The aggregator's full-screen pages (the Full map): the same frame, no tabs. */
export function DealerBareLayout() {
  const [theme] = usePlatformTheme()
  return (
    <PlatformFrame theme={theme}>
      <Outlet />
    </PlatformFrame>
  )
}

/** Sign-in shell: the platform surface in both builds, phone-width, no tabs. */
export function SignInLayout() {
  const [theme] = usePlatformTheme()
  return (
    <PlatformFrame theme={theme}>
      <Outlet />
    </PlatformFrame>
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
