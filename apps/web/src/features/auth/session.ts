import { createContext, useContext } from 'react'
import type { Role, Session } from '@/types/operator'

export interface SessionContextValue {
  session: Session | null
  signIn: (ref: string, pin: string, role: Role) => Promise<Session>
  signOut: () => void
  can: (permission: string) => boolean
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

/**
 * The session is kept in sessionStorage so a refresh during the demo does not sign the
 * agent out. It holds a token, a role and a display name — never a balance, a float
 * amount or any financial value. Those are read per request and never persisted.
 */
export const SESSION_KEY = 'af.session'

export function readStoredSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    return parsed.token && parsed.role ? parsed : null
  } catch {
    return null
  }
}

export function writeStoredSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* private mode, blocked storage — the session simply does not survive a refresh */
  }
}
