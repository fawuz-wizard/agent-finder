import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogoMark } from '@/design'
import { config } from '@/lib/config'
import { useSession } from './session'

/**
 * Sign in, in the approved design (2026-10-29): the mark and the word, "Welcome back", the
 * number, Continue; then the PIN. Nobody is asked who they are: every agent and every
 * aggregator has their own number, the server knows whose it is, and the PIN settles the
 * rest. The first-time code and the demo credentials are told in person, not on the screen.
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
  // The number first, then the PIN: two steps on one screen, one sign-in call at the end.
  const [step, setStep] = useState<'number' | 'pin'>('number')

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
      // Orange's national account has no agents of its own: it opens on the national map.
      const home = s.role === 'agent' ? '/agent' : s.permissions.includes('VIEW_NATIONAL') ? '/dealer/map' : '/dealer'
      navigate(location.state?.from && location.state.from.startsWith(home) ? location.state.from : home, {
        replace: true,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  // Measured from the approved design: 56 px field and button, 14 px corners, 1.5 px edge.
  const field = 'flex h-14 items-center gap-3 rounded-[14px] border-[1.5px] border-design-field-line bg-design-field px-4 focus-within:border-finder-accent'
  const primary = 'mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-finder-accent text-base font-extrabold text-finder-on-orange transition-opacity'
  const on = 'opacity-100'
  const off = 'cursor-not-allowed opacity-55'

  return (
    <div className="flex flex-1 flex-col bg-white text-design-ink">
      {config.surface === 'customer' && (
        <Link to="/" className="flex h-control items-center gap-1 px-5 text-base font-bold text-finder-link">
          ‹ Back
        </Link>
      )}
      <form
        className="flex flex-1 flex-col px-7 pb-8 pt-12"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (step === 'number') {
            if (ref.trim()) {
              setError(null)
              setStep('pin')
            }
          } else void submit()
        }}
      >
        <LogoMark size={64} className="!rounded-[18px]" />
        <p className="mt-4 text-[22px] font-extrabold tracking-[-0.02em]">
          Agent <span className="text-finder-link">Finder</span>
          {config.surface === 'agent' && <span className="sr-only">Agent App</span>}
        </p>

        {step === 'number' ? (
          <>
            <h1 className="mt-14 text-[30px] font-extrabold leading-tight tracking-[-0.03em]">Welcome back</h1>
            <p className="mt-2 text-[15px] leading-normal text-design-muted">Enter your Orange phone number to continue.</p>
            <label htmlFor="sign-in-ref" className="sr-only">
              Phone number
            </label>
            <div className={`mt-8 ${field}`}>
              <span className="text-base font-bold">+232</span>
              <span aria-hidden="true" className="h-6 w-px bg-design-field-line" />
              <input
                id="sign-in-ref"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="76X XXX XXX"
                autoComplete="username"
                autoCapitalize="off"
                spellCheck={false}
                inputMode="tel"
                className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold tracking-[0.04em] outline-none placeholder:text-design-faint"
              />
            </div>
            <button type="submit" disabled={!ref.trim()} className={`${primary} ${ref.trim() ? on : off}`}>
              Continue
            </button>
          </>
        ) : (
          <>
            <h1 className="mt-14 text-[30px] font-extrabold leading-tight tracking-[-0.03em]">Enter your PIN</h1>
            <p className="mt-2 text-[15px] leading-normal text-design-muted">
              For <span className="font-bold text-finder-ink">{ref.trim()}</span> ·{' '}
              <button
                type="button"
                onClick={() => {
                  setStep('number')
                  setPin('')
                  setError(null)
                }}
                className="font-bold text-finder-link"
              >
                Change number
              </button>
            </p>
            <label htmlFor="sign-in-pin" className="sr-only">
              PIN
            </label>
            <div className={`mt-8 ${field}`}>
              <input
                id="sign-in-pin"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="4 to 6 digits"
                inputMode="numeric"
                type={showPin ? 'text' : 'password'}
                autoComplete="current-password"
                aria-describedby="sign-in-pin-help"
                className="h-full min-w-0 flex-1 bg-transparent text-lg font-bold tracking-widest outline-none placeholder:font-medium placeholder:tracking-normal placeholder:text-finder-muted"
              />
              <button type="button" onClick={() => setShowPin((v) => !v)} aria-pressed={showPin} className="text-sm font-bold text-finder-link">
                {showPin ? 'Hide PIN' : 'Show PIN'}
              </button>
            </div>
            <p id="sign-in-pin-help" className="mt-2 text-sm font-medium text-finder-muted">
              Your PIN, or the one-time code you were given.
            </p>
            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-base font-bold text-danger">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy || !ready} className={`${primary} ${busy ? 'cursor-progress ' + on : ready ? on : off}`}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <span role="status" className="sr-only">
              {busy ? 'Signing in' : ''}
            </span>
          </>
        )}

        <p className="mt-auto pt-10 text-center text-sm font-semibold text-design-muted">
          Need help? <span className="text-finder-link">Contact the Agent Finder team</span>
        </p>
      </form>
    </div>
  )
}
