import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogoMark } from '@/design'
import { config } from '@/lib/config'
import type { Role } from '@/types/operator'
import { FinderBox, FinderCta } from '@/features/end-user/components/finder'
import { useSession } from './session'

/* Two roles, two pictures. Outline icons from the app's family: 2px stroke, round joins. */
function ShopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M5 11v9h14v-9" />
      <path d="M10 20v-5h4v5" />
    </svg>
  )
}
function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.5c3 0 5.5 2 5.5 5" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  )
}

const ROLES: { value: Role; label: string; hint: string; Icon: () => JSX.Element }[] = [
  { value: 'agent', label: 'Agent', hint: 'At a shop', Icon: ShopIcon },
  { value: 'dealer', label: 'Aggregator', hint: 'Manages agents', Icon: PeopleIcon },
]

/**
 * Sign in, on the finder's design: who you are as two picture tiles, then your details in
 * the 60 px fields, one orange button. The role only decides which experience opens; the
 * backend resolves the real account from the credentials. An agent signs in with the agent
 * code on Orange's record (or their Orange Money line); an aggregator with their line.
 */
export default function SignInPage() {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }
  const [role, setRole] = useState<Role>('agent')
  const [ref, setRef] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAgent = role === 'agent'
  const ready = pin.length >= 4 && ref.trim().length > 0

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      const s = await signIn(ref.trim(), pin, role)
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

  const input = 'h-full w-full min-w-0 bg-transparent text-md font-bold text-white outline-none placeholder:font-medium placeholder:text-finder-muted/60'

  return (
    <div className="flex flex-1 flex-col text-white">
      <div className="flex h-12 items-center justify-between gap-3 px-5">
        <span className="flex items-center gap-2 text-base font-bold">
          <LogoMark size={20} className="text-white" />
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
        <h1 className="mt-6 text-xl font-bold leading-tight">Sign in</h1>
        <p className="mt-1 text-sm font-medium text-finder-muted">Orange Money agents and the aggregators who manage them.</p>

        <p className="mt-6 text-base font-bold uppercase text-finder-muted">Who you are</p>
        <div role="radiogroup" aria-label="Who you are" className="mt-3 grid grid-cols-2 gap-3">
          {ROLES.map(({ value, label, hint, Icon }) => {
            const on = role === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setRole(value)
                  setError(null)
                }}
                className={`relative flex flex-col items-start gap-3 rounded-panel px-4 py-4 text-left transition-colors ${
                  on ? 'bg-finder-link text-finder-on-orange' : 'bg-finder-bg text-white shadow-inset-finder'
                }`}
              >
                {on && (
                  <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-finder-bg text-white" aria-hidden="true">
                    <CheckIcon />
                  </span>
                )}
                <Icon />
                <span className="block">
                  <span className="block text-base font-bold leading-tight">{label}</span>
                  <span className={`block text-xs font-semibold leading-snug ${on ? 'text-finder-on-orange/80' : 'text-finder-muted'}`}>{hint}</span>
                </span>
              </button>
            )
          })}
        </div>

        <p className="mt-6 text-base font-bold uppercase text-finder-muted">Your details</p>
        <label htmlFor="sign-in-ref" className="mt-3 text-[15px] font-medium">
          {isAgent ? 'Agent code' : 'Orange Money number'}
        </label>
        <FinderBox className="mt-2 flex h-[54px] items-center px-4 focus-within:outline focus-within:outline-2 focus-within:outline-finder-link">
          <input
            id="sign-in-ref"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            autoComplete="username"
            inputMode={isAgent ? 'text' : 'tel'}
            placeholder={isAgent ? 'e.g. 100245' : 'e.g. 076 000 000'}
            className={input}
          />
        </FinderBox>
        <p className="mt-2 text-sm font-medium text-finder-muted">
          {isAgent ? 'On your Orange record. Your Orange Money number works too.' : 'The line Orange has for your aggregator account.'}
        </p>

        <div className="mt-4 flex items-center justify-between">
          <label htmlFor="sign-in-pin" className="text-[15px] font-medium">
            PIN
          </label>
          <button type="button" onClick={() => setShowPin((v) => !v)} className="text-sm font-bold text-finder-link" aria-pressed={showPin}>
            {showPin ? 'Hide PIN' : 'Show PIN'}
          </button>
        </div>
        <FinderBox className="mt-2 flex h-[54px] items-center px-4 focus-within:outline focus-within:outline-2 focus-within:outline-finder-link">
          <input
            id="sign-in-pin"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            type={showPin ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="4 to 6 digits"
            className={`${input} ${showPin || !pin ? '' : 'tracking-[0.4em]'}`}
          />
        </FinderBox>
        {error && (
          <p role="alert" className="mt-3 border-l-4 border-danger pl-3 text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        <FinderCta type="submit" className="mt-6" disabled={busy || !ready}>
          {busy ? 'Signing in…' : 'Sign in'}
        </FinderCta>

        <p className="mt-4 text-center text-sm font-medium text-finder-muted">
          {isAgent ? 'No PIN yet? Your aggregator sets it when you are registered.' : 'No PIN yet? Ask the Agent Finder team.'}
        </p>

        {config.isDemo && (
          <FinderBox className="mt-6 px-4 py-3">
            <p className="text-sm font-medium text-finder-muted">
              Demo sign-in. PIN <b className="text-white">1234</b>. Agent codes: 024, 031, 009, 017, 038. Aggregator: kissy.
            </p>
          </FinderBox>
        )}

        {config.surface === 'customer' && (
          <p className="mt-auto pt-6 text-center text-sm font-medium text-finder-muted">
            Looking for an agent?{' '}
            <Link to="/find" className="font-bold text-finder-link">
              Open Agent Finder
            </Link>
          </p>
        )}
      </form>
    </div>
  )
}
