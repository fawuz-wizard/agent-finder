import { createContext, useContext } from 'react'
import type { Role, Session } from '@/types/operator'

/** Where the sign-in happens: the Agent App (agents and aggregators) or the national map page. */
export type SignInPlace = 'app' | 'national'

export const WRONG_PLACE: Record<SignInPlace, string> = {
  app: 'This account opens on the national map page, not in this app.',
  national: "This page is for Orange's national account only.",
}

export interface SessionContextValue {
  session: Session | null
  /** The number decides who signs in; `role` is only an older caller's hint. */
  signIn: (ref: string, pin: string, role?: Role, where?: SignInPlace) => Promise<Session>
  /** The one-time code has been replaced by a PIN: the session is settled from here on. */
  pinChosen: () => void
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

/** Orange's national account: it signs in only on the national map page, never in the Agent App. */
export function isNational(s: Pick<Session, 'permissions'> | null | undefined): boolean {
  return Boolean(s?.permissions.includes('VIEW_NATIONAL'))
}

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
