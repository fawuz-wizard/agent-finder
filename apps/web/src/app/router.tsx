import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AgentLayout, CustomerLayout, DealerLayout, SignInLayout } from './layouts'
import { RequireRole } from '@/features/auth/RequireRole'
import { ResultCardSkeleton } from '@/design'
import { config } from '@/lib/config'

// Each shell is its own chunk. Customers never download agent or admin code.
const CustomerHome = lazy(() => import('@/features/end-user/HomePage'))
const SearchResults = lazy(() => import('@/features/end-user/ResultsPage'))
const AgentDetail = lazy(() => import('@/features/end-user/AgentDetailPage'))
const HowAvailabilityWorks = lazy(() => import('@/features/end-user/HowAvailabilityWorksPage'))
const ReportVisit = lazy(() => import('@/features/end-user/ReportVisitPage'))
const SignIn = lazy(() => import('@/features/auth/SignInPage'))
const HostHome = lazy(() => import('@/features/host/HostHomePage'))
const AgentDashboard = lazy(() => import('@/features/agent/DashboardPage'))
const AgentServices = lazy(() => import('@/features/agent/ServicesPage'))
const AgentProfile = lazy(() => import('@/features/agent/ProfilePage'))
const AgentHours = lazy(() => import('@/features/agent/HoursPage'))
const DealerDashboard = lazy(() => import('@/features/dealer/DashboardPage'))
const DealerAgents = lazy(() => import('@/features/dealer/AgentsPage'))
const DealerAgentDetail = lazy(() => import('@/features/dealer/AgentDetailPage'))
const DealerRegisterAgent = lazy(() => import('@/features/dealer/RegisterAgentPage'))
const DealerFloatQueue = lazy(() => import('@/features/dealer/FloatQueuePage'))
const DealerFloatReview = lazy(() => import('@/features/dealer/FloatReviewPage'))
const DealerAttention = lazy(() => import('@/features/dealer/AttentionPage'))
const DealerProfile = lazy(() => import('@/features/dealer/ProfilePage'))
const NotFound = lazy(() => import('./NotFound'))

function Fallback() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-busy="true">
      <ResultCardSkeleton />
      <ResultCardSkeleton />
    </div>
  )
}

const withSuspense = (el: React.ReactNode) => <Suspense fallback={<Fallback />}>{el}</Suspense>

const router = createBrowserRouter([
  {
    element: <CustomerLayout />,
    children: [
      { path: '/find', element: withSuspense(<CustomerHome />) },
      { path: '/search', element: withSuspense(<SearchResults />) },
      { path: '/agents/:id', element: withSuspense(<AgentDetail />) },
      { path: '/how-availability-works', element: withSuspense(<HowAvailabilityWorks />) },
      { path: '/report-a-visit', element: withSuspense(<ReportVisit />) },
    ],
  },
  {
    element: <SignInLayout />,
    children: [{ path: '/sign-in', element: withSuspense(<SignIn />) }],
  },
  // The customer build starts in the simulated host app; its banner opens the customer module.
  // The Agent App build starts on sign-in: agents and dealers never see the customer home.
  {
    path: '/',
    element: config.surface === 'agent' ? <Navigate to="/sign-in" replace /> : withSuspense(<HostHome />),
  },
  { path: '/host', element: <Navigate to={config.surface === 'agent' ? '/sign-in' : '/'} replace /> },
  {
    path: '/agent',
    element: <RequireRole role="agent" />,
    children: [
      {
        element: <AgentLayout />,
        children: [
          { index: true, element: withSuspense(<AgentDashboard />) },
          { path: 'services', element: withSuspense(<AgentServices />) },
          // The five old modules fold into three tabs; old links still land somewhere right.
          { path: 'availability', element: <Navigate to="/agent" replace /> },
          { path: 'dashboard', element: <Navigate to="/agent" replace /> },
          { path: 'activity', element: <Navigate to="/agent" replace /> },
          { path: 'float', element: <Navigate to="/agent/services" replace /> },
          { path: 'profile', element: withSuspense(<AgentProfile />) },
          { path: 'hours', element: withSuspense(<AgentHours />) },
        ],
      },
    ],
  },
  {
    path: '/dealer',
    element: <RequireRole role="dealer" />,
    children: [
      {
        element: <DealerLayout />,
        children: [
          { index: true, element: withSuspense(<DealerDashboard />) },
          { path: 'agents', element: withSuspense(<DealerAgents />) },
          { path: 'agents/new', element: withSuspense(<DealerRegisterAgent />) },
          { path: 'agents/:ref', element: withSuspense(<DealerAgentDetail />) },
          { path: 'float', element: withSuspense(<DealerFloatQueue />) },
          { path: 'float/:id', element: withSuspense(<DealerFloatReview />) },
          { path: 'attention', element: withSuspense(<DealerAttention />) },
          { path: 'attention/:id', element: withSuspense(<DealerAttention />) },
          { path: 'profile', element: withSuspense(<DealerProfile />) },
        ],
      },
    ],
  },
  // /admin (features/admin, AdminLayout) is not routed for the pilot; it returns after the competition.
  { path: '*', element: withSuspense(<NotFound />) },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
