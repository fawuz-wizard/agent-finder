import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { SESSION_ENDED_EVENT } from '@/lib/api'
import type { Role, Session } from '@/types/operator'
import { SESSION_ENDED_KEY, SessionContext, WRONG_PLACE, isNational, readStoredSession, writeStoredSession, type SignInPlace } from './session'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readStoredSession())

  // The server said this sign-in has ended (expired, signed out elsewhere, PIN changed): drop it
  // here too. The route guard then sends the person to sign in, keeping the page they were on,
  // and the sign-in page says why.
  useEffect(() => {
    const ended = () => {
      if (!readStoredSession()) return
      try {
        sessionStorage.setItem(SESSION_ENDED_KEY, '1')
      } catch {
        /* storage off: the person still lands on sign-in, just without the note */
      }
      writeStoredSession(null)
      setSession(null)
    }
    window.addEventListener(SESSION_ENDED_EVENT, ended)
    return () => window.removeEventListener(SESSION_ENDED_EVENT, ended)
  }, [])

  const signIn = useCallback(async (ref: string, pin: string, role?: Role, where: SignInPlace = 'app') => {
    // Imported here, not at module scope: the provider wraps every route, and a static
    // import would put the whole operator service — and the seeded operator data with it —
    // into the customer's first payload.
    const { operatorApi } = await import('@/services/operatorApi')
    const s = await operatorApi.signIn(ref, pin, role)
    // Orange's account belongs on its own page, and only there. The server still decides what
    // any account may read; this keeps each app to the people it is for. The session just
    // opened is ended on the server, not kept.
    if (isNational(s) !== (where === 'national')) {
      void operatorApi.signOut(s.token).catch(() => {
        /* offline: the token was never stored here, and it expires on the server */
      })
      throw new Error(WRONG_PLACE[where])
    }
    setSession(s)
    writeStoredSession(s)
    return s
  }, [])

  const pinChosen = useCallback(() => {
    setSession((s) => {
      if (!s) return s
      const next = { ...s, must_set_pin: false }
      writeStoredSession(next)
      return next
    })
  }, [])

  const signOut = useCallback(() => {
    const token = session?.token
    setSession(null)
    writeStoredSession(null)
    if (token) {
      // Revoke on the server too; the local sign-out does not wait for it.
      void import('@/services/operatorApi')
        .then(({ operatorApi }) => operatorApi.signOut(token))
        .catch(() => {
          /* offline or already ended — nothing to do, the token is gone from this browser */
        })
    }
  }, [session])

  const value = useMemo(
    () => ({
      session,
      signIn,
      pinChosen,
      signOut,
      // UX only. The API decides what this person may actually read or do.
      can: (permission: string) => Boolean(session?.permissions.includes(permission)),
    }),
    [session, signIn, pinChosen, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
