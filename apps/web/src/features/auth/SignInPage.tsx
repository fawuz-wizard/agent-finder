import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogoMark } from '@/design'
import { config } from '@/lib/config'
import { FinderBox, FinderCta } from '@/features/end-user/components/finder'
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

  const input = 'h-full w-full min-w-0 bg-transparent text-md font-bold text-finder-ink outline-none placeholder:font-medium placeholder:text-finder-muted'
  const field = 'mt-3 flex h-[3.5rem] items-center px-4 focus-within:outline focus-within:outline-2 focus-within:outline-finder-link'

  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <div className="flex h-12 items-center justify-between gap-3 px-5">
        <span className="flex items-center gap-2 text-base font-bold">
          <LogoMark size={20} className="text-finder-ink" />
          Agent App
        </span>
        {config.surface === 'customer' && (
          <Link to="/" className="text-sm font-bold text-finder-muted">
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
        <span aria-hidden="true" className="mt-10 flex h-16 w-16 items-center justify-center rounded-panel bg-finder-accent text-finder-on-orange">
          <LogoMark size={36} />
        </span>
        <h1 className="mt-6 text-xl font-bold leading-tight">Sign in</h1>

        {/* One number, no words around it: every agent and every aggregator has their own, and
            the server knows whose it is. The label exists for screen readers only. */}
        <FinderBox className={`${field} mt-10 gap-3`}>
          <span aria-hidden="true" className="shrink-0 text-md font-bold text-finder-muted">+232</span>
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
        </FinderBox>

        <div className="mt-6 flex items-center justify-between">
          <label htmlFor="sign-in-pin" className="text-[0.95rem] font-medium">
            PIN
          </label>
          <button type="button" onClick={() => setShowPin((v) => !v)} className="text-sm font-bold text-finder-link" aria-pressed={showPin}>
            {showPin ? 'Hide PIN' : 'Show PIN'}
          </button>
        </div>
        <FinderBox className={field}>
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
        </FinderBox>
        {error && (
          <p role="alert" className="mt-4 text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        <FinderCta type="submit" className="mt-8" disabled={busy || !ready}>
          {busy ? 'Signing in…' : 'Sign in'}
        </FinderCta>
      </form>
    </div>
  )
}
