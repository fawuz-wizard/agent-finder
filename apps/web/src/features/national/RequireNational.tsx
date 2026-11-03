import { Navigate, Outlet } from 'react-router-dom'
import { isNational, useSession } from '@/features/auth/session'

/**
 * The national map page opens only for Orange's national account with its 6-digit PIN chosen.
 * A routing convenience: the API refuses the map to anyone else whatever the page does.
 */
export function RequireNational() {
  const { session } = useSession()
  if (!session || !isNational(session) || session.must_set_pin) return <Navigate to="/national/sign-in" replace />
  return <Outlet />
}
