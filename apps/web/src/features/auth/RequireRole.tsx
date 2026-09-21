import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { Role } from '@/types/operator'
import { useSession } from './session'

/**
 * Sends the wrong role away instead of rendering a screen it should not see. This is a
 * routing convenience, not a security boundary — every protected response is authorised
 * again by the API.
 */
export function RequireRole({ role }: { role: Role }) {
  const { session } = useSession()
  const location = useLocation()
  if (!session) return <Navigate to="/sign-in" state={{ from: location.pathname }} replace />
  if (session.role !== role) return <Navigate to={session.role === 'agent' ? '/agent' : '/dealer'} replace />
  return <Outlet />
}
