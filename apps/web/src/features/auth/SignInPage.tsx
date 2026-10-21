import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogoMark } from '@/design'
import { config } from '@/lib/config'
import { useSession } from './session'

/**
 * Sign in. Nobody is asked who they are and nothing is explained: every agent and every
 * aggregator has their own number, the server knows whose it is, and the PIN settles the
 * rest. The mark, the word, one number, one PIN, one button. The first-time code and the
 * demo credentials are told in person and written in RUNNING.md, not on the screen.
 */
export default function SignInPage() {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }
  const [ref, setRef] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = pin.length >= 4 && ref.trim().length > 0

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      const s = await signIn(ref.trim(), pin)
      if (s.must_set_pin) {
        navigate('/choose-pin', { replace: true })
        return
      }
      const home = s.role === 'agent' ? '/agent' : '/dealer'
      navigate(location.state?.from && location.state.from.startsWith(home) ? location.state.from : home, {
        replace: true,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  // Presentation only: the flow, the fields and their rules are above and unchanged.
  const label = 'text-sm font-semibold text-finder-ink'
  const field =
    'mt-2 flex h-[3.25rem] items-center gap-3 rounded-[10px] border-[1.5px] border-finder-line bg-finder-bg px-3.5 transition-[border-color,box-shadow] focus-within:border-finder-accent focus-within:ring-[3px] focus-within:ring-finder-accent/20'
  const input = 'h-full w-full min-w-0 bg-transparent text-base font-semibold text-finder-ink outline-none placeholder:font-medium placeholder:text-finder-muted'

  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <div className="flex h-14 items-center justify-between gap-3 border-b border-finder-line px-5">
        <span className="flex items-center gap-2.5 text-base font-bold">
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-finder-accent text-finder-on-orange">
            <LogoMark size={16} />
          </span>
          Agent App
        </span>
        {config.surface === 'customer' && (
          <Link to="/" className="-mr-2 flex h-10 items-center gap-1 px-2 text-sm font-semibold text-finder-ink">
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
              <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </Link>
        )}
      </div>

      <form
        className="flex flex-1 flex-col px-5 pb-8"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h1 className="mt-9 text-[1.625rem] font-bold leading-none tracking-tight">Sign in</h1>

        {/* One number, no words around it: every agent and every aggregator has their own, and
            the server knows whose it is. */}
        <label htmlFor="sign-in-ref" className={`${label} mt-8`}>
          Phone number
        </label>
        <div className={field}>
          <span aria-hidden="true" className="shrink-0 border-r border-finder-line pr-3 text-base font-bold leading-none text-finder-ink">
            +232
          </span>
          <input
            id="sign-in-ref"
            aria-label="Your number"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="tel"
            placeholder="Your number"
            className={input}
          />
        </div>

        <div className="mt-7 flex items-end justify-between">
          <label htmlFor="sign-in-pin" className={label}>
            PIN
          </label>
          <button
            type="button"
            onClick={() => setShowPin((v) => !v)}
            className="-mb-2.5 -mr-2 flex h-10 items-center gap-1.5 px-2 text-sm font-bold text-finder-link"
            aria-pressed={showPin}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
              <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="10" cy="10" r="2.4" fill="currentColor" />
              {showPin && <path d="M4 16 16 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
            </svg>
            {showPin ? 'Hide PIN' : 'Show PIN'}
          </button>
        </div>
        <div className={field}>
          <input
            id="sign-in-pin"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            type={showPin ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="PIN, or your one-time code"
            className={`${input} ${showPin || !pin ? '' : 'tracking-[0.4em]'}`}
          />
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !ready}
          className="mt-8 flex h-[3.25rem] w-full items-center justify-center rounded-[12px] bg-finder-accent text-base font-bold text-finder-on-orange transition-[filter] hover:brightness-95 active:brightness-90 disabled:opacity-45"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
