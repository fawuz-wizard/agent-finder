import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Role, Session } from '@/types/operator'
import { SessionContext, readStoredSession, writeStoredSession } from './session'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readStoredSession())

  const signIn = useCallback(async (ref: string, pin: string, role: Role) => {
    // Imported here, not at module scope: the provider wraps every route, and a static
    // import would put the whole operator service — and the seeded operator data with it —
    // into the customer's first payload.
    const { operatorApi } = await import('@/services/operatorApi')
    const s = await operatorApi.signIn(ref, pin, role)
    setSession(s)
    writeStoredSession(s)
    return s
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
      signOut,
      // UX only. The API decides what this person may actually read or do.
      can: (permission: string) => Boolean(session?.permissions.includes(permission)),
    }),
    [session, signIn, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
