import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AgentLayout, CustomerLayout, DealerLayout } from './layouts'
import { RequireRole } from '@/features/auth/RequireRole'
import { ResultCardSkeleton } from '@/design'

// Each shell is its own chunk. Customers never download agent or admin code.
const CustomerHome = lazy(() => import('@/features/end-user/HomePage'))
const SearchResults = lazy(() => import('@/features/end-user/ResultsPage'))
const AgentDetail = lazy(() => import('@/features/end-user/AgentDetailPage'))
const HowAvailabilityWorks = lazy(() => import('@/features/end-user/HowAvailabilityWorksPage'))
const ReportVisit = lazy(() => import('@/features/end-user/ReportVisitPage'))
const SignIn = lazy(() => import('@/features/auth/SignInPage'))
const HostHome = lazy(() => import('@/features/host/HostHomePage'))
const AgentHome = lazy(() => import('@/features/agent/AgentHomePage'))
const AgentAvailability = lazy(() => import('@/features/agent/AvailabilityPage'))
const AgentFloat = lazy(() => import('@/features/agent/FloatPage'))
const AgentDashboard = lazy(() => import('@/features/agent/DashboardPage'))
const AgentProfile = lazy(() => import('@/features/agent/ProfilePage'))
const AgentHours = lazy(() => import('@/features/agent/HoursPage'))
const DealerDashboard = lazy(() => import('@/features/dealer/DashboardPage'))
const DealerAgents = lazy(() => import('@/features/dealer/AgentsPage'))
const DealerAgentDetail = lazy(() => import('@/features/dealer/AgentDetailPage'))
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
    element: <CustomerLayout />,
    children: [{ path: '/sign-in', element: withSuspense(<SignIn />) }],
  },
  // The demo starts in the simulated host app; the customer module is what its banner opens.
  { path: '/', element: withSuspense(<HostHome />) },
  { path: '/host', element: <Navigate to="/" replace /> },
  {
    path: '/agent',
    element: <RequireRole role="agent" />,
    children: [
      {
        element: <AgentLayout />,
        children: [
          { index: true, element: withSuspense(<AgentHome />) },
          { path: 'availability', element: withSuspense(<AgentAvailability />) },
          { path: 'float', element: withSuspense(<AgentFloat />) },
          { path: 'dashboard', element: withSuspense(<AgentDashboard />) },
          { path: 'activity', element: <Navigate to="/agent/dashboard" replace /> },
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
