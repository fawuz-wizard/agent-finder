import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cn, LogoMark, TextInput } from '@/design'
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

  // Presentation only: the flow, the fields and their rules are above and unchanged.
  // Built to OUDS Web v1.4.0 (Orange theme): square corners (business use), a filled text
  // input with its label inside, one brand button, and the 3px Orange focus ring.
  return (
    <div className="flex flex-1 flex-col bg-ouds-bg font-ouds text-ouds-content">
      <header className="flex h-[max(3.5rem,52px)] items-center justify-between gap-[12px] px-[1rem] shadow-[inset_0_-1px_0_0_var(--color-ouds-border-muted)]">
        <span className="flex items-center gap-[12px] text-[1rem] font-bold leading-[1.5]">
          <LogoMark size={32} />
          <span className="sr-only">Agent App</span>
        </span>
        {config.surface === 'customer' && (
          <Link
            to="/"
            className="ouds-focus -mr-[8px] flex min-h-[48px] min-w-[48px] items-center gap-[8px] px-[8px] text-[1rem] font-bold leading-[1.5] text-ouds-action hover:text-ouds-action-hover hover:underline"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-[20px] w-[20px]">
              <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </Link>
        )}
      </header>

      <form
        className="flex flex-1 flex-col px-[1rem] pb-[2rem]"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h1 className="mt-[2.5rem] text-[1.5rem] font-bold leading-[1.3333] tracking-[-0.0075rem]">Sign in</h1>

        {/* One number, no words around it: every agent and every aggregator has their own, and
            the server knows whose it is. */}
        <TextInput
          id="sign-in-ref"
          className="mt-[2rem]"
          label="Phone number"
          prefix="+232"
          value={ref}
          onChange={setRef}
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="tel"
        />

        <TextInput
          id="sign-in-pin"
          className="mt-[1.5rem]"
          label="PIN"
          helper="Your PIN, or the one-time code you were given"
          value={pin}
          onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          type={showPin ? 'text' : 'password'}
          autoComplete="current-password"
          trailing={
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              aria-pressed={showPin}
              className="ouds-focus flex h-[48px] w-[48px] items-center justify-center text-ouds-action hover:bg-ouds-field-hover hover:text-ouds-action-hover active:bg-ouds-field-pressed"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[24px] w-[24px]">
                <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
                {showPin && <path d="M4.5 19.5 19.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
              </svg>
              <span className="sr-only">{showPin ? 'Hide PIN' : 'Show PIN'}</span>
            </button>
          }
        />

        {/* OUDS alert message, negative: tinted surface, the icon carries the colour, the text stays default. */}
        {error && (
          <div role="alert" className="mt-[1.5rem] flex min-h-[48px] items-start gap-[12px] bg-ouds-negative-muted px-[1rem] py-[12px]">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[24px] w-[24px] shrink-0 text-ouds-negative">
              <circle cx="12" cy="12" r="10" fill="currentColor" />
              <path d="M12 7v6" stroke="var(--color-ouds-bg)" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="12" cy="16.8" r="1.3" fill="var(--color-ouds-bg)" />
            </svg>
            <p className="text-[1rem] font-bold leading-[1.5]">{error}</p>
          </div>
        )}

        {/* The one brand (orange) button on the screen. Full width on phones only: OUDS keeps
            block buttons off desktop. Hover and press follow OUDS: grey, then black. */}
        <button
          type="submit"
          disabled={busy || !ready}
          className={cn(
            'ouds-focus mt-[2rem] flex min-h-[max(3rem,48px)] w-full items-center justify-center gap-[8px] px-[32px] py-[12px] text-[1rem] font-bold leading-[1.5] tracking-[0.0125rem] md:w-auto md:self-start',
            busy
              ? 'cursor-progress bg-ouds-brand-pressed text-ouds-on-brand-pressed'
              : ready
                ? 'bg-ouds-brand text-ouds-on-brand hover:bg-ouds-action-hover hover:text-ouds-on-action active:bg-ouds-brand-pressed active:text-ouds-on-brand-pressed'
                : 'cursor-not-allowed bg-ouds-action-disabled text-ouds-on-disabled',
          )}
        >
          {busy && (
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[20px] w-[20px] animate-spin">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          Sign in
        </button>
        <span role="status" className="sr-only">
          {busy ? 'Signing in' : ''}
        </span>
      </form>
    </div>
  )
}
