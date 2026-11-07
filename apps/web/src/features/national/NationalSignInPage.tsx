import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { LogoMark } from '@/design'
import { isNational, useSession } from '@/features/auth/session'

const DIGITS = 6

/**
 * Orange's national map has a page of its own, for a laptop, apart from the Agent App: the
 * account and its 6-digit PIN, then the map. Only the national account signs in here; agents
 * and aggregators are refused and use the Agent App. A national account still on a shorter
 * PIN (or a new code) chooses its 6-digit PIN on this same card before the map opens.
 */
export default function NationalSignInPage() {
  const { session, signIn, signOut, pinChosen } = useSession()
  const navigate = useNavigate()
  const [account, setAccount] = useState('')
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const choosing = Boolean(session && isNational(session) && session.must_set_pin)

  if (session && isNational(session) && !session.must_set_pin) return <Navigate to="/national" replace />

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, DIGITS)
  const ready = choosing ? pin.length === DIGITS && again.length === DIGITS : account.trim().length > 0 && pin.length >= 4

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      if (choosing && session) {
        if (pin !== again) throw new Error('The two PINs are not the same.')
        const { operatorApi } = await import('@/services/operatorApi')
        await operatorApi.choosePin(session.ref, session.role, pin)
        pinChosen()
        navigate('/national', { replace: true })
        return
      }
      const s = await signIn(account.trim().toLowerCase(), pin, 'dealer', 'national')
      setPin('')
      if (!s.must_set_pin) navigate('/national', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.')
      setPin('')
      setAgain('')
    } finally {
      setBusy(false)
    }
  }

  const field = 'mt-1.5 flex h-12 items-center rounded-[12px] border-[1.5px] border-design-field-line bg-design-field px-3.5 focus-within:border-finder-accent'
  const input = 'h-full w-full min-w-0 bg-transparent text-base font-bold text-design-ink outline-none placeholder:font-medium placeholder:text-design-muted'

  return (
    <main className="flex min-h-dvh items-center justify-center bg-design-track px-4 py-10 font-finder text-design-ink">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        className="flex w-full max-w-[360px] flex-col rounded-[18px] bg-white p-6 shadow-[0_8px_30px_rgb(0_0_0/0.06)]"
      >
        <p className="flex items-center gap-2.5 text-lg font-extrabold">
          <LogoMark size={28} />
          Agent Finder · National map
        </p>
        <p className="mt-1 text-sm text-design-muted">For Orange Sierra Leone only.</p>

        {choosing ? (
          <>
            <h1 className="mt-6 text-xl font-extrabold">Choose your 6-digit PIN</h1>
            <p className="mt-1 text-sm text-design-muted">This account sees every agent in the country, so its PIN has 6 digits. Nobody else will know it.</p>
            <label htmlFor="national-new-pin" className="mt-5 text-sm font-bold">
              New PIN
            </label>
            <div className={field}>
              <input id="national-new-pin" autoFocus value={pin} onChange={(e) => setPin(digits(e.target.value))} type="password" inputMode="numeric" autoComplete="new-password" placeholder="6 digits" className={`${input} tracking-widest`} />
            </div>
            <label htmlFor="national-again" className="mt-4 text-sm font-bold">
              The same PIN again
            </label>
            <div className={field}>
              <input id="national-again" value={again} onChange={(e) => setAgain(digits(e.target.value))} type="password" inputMode="numeric" autoComplete="new-password" placeholder="6 digits" className={`${input} tracking-widest`} />
            </div>
          </>
        ) : (
          <>
            <label htmlFor="national-account" className="mt-6 text-sm font-bold">
              Account
            </label>
            <div className={field}>
              <input id="national-account" autoFocus value={account} onChange={(e) => setAccount(e.target.value)} autoComplete="username" autoCapitalize="off" spellCheck={false} className={input} />
            </div>
            <label htmlFor="national-pin" className="mt-4 text-sm font-bold">
              6-digit PIN
            </label>
            <div className={field}>
              <input id="national-pin" value={pin} onChange={(e) => setPin(digits(e.target.value))} type="password" inputMode="numeric" autoComplete="current-password" className={`${input} tracking-widest`} />
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-design-bad-tint px-3.5 py-2.5 text-sm font-bold text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={!ready || busy} className="mt-5 flex h-12 items-center justify-center rounded-[12px] bg-finder-accent text-base font-extrabold text-finder-on-orange transition-transform duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55">
          {busy ? (choosing ? 'Saving…' : 'Signing in…') : choosing ? 'Save PIN and open the map' : 'Sign in'}
        </button>
        {choosing && (
          <button type="button" onClick={signOut} className="mt-3 h-11 text-sm font-bold text-design-muted">
            Sign out
          </button>
        )}
        <span role="status" className="sr-only">
          {busy ? 'Working' : ''}
        </span>
      </form>
    </main>
  )
}
