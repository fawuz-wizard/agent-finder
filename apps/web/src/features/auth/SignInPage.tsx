import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button, Card, LogoMark } from '@/design'
import { config } from '@/lib/config'
import type { Role } from '@/types/operator'
import { useSession } from './session'

/* Two roles, two pictures. Outline icons from the app's family: 2px stroke, round joins. */
function ShopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M5 11v9h14v-9" />
      <path d="M10 20v-5h4v5" />
    </svg>
  )
}
function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

const ROLES: { value: Role; label: string; hint: string; Icon: () => JSX.Element }[] = [
  { value: 'agent', label: 'Agent', hint: 'At a shop', Icon: ShopIcon },
  { value: 'dealer', label: 'Aggregator', hint: 'Manages agents', Icon: PeopleIcon },
]

/**
 * Sign in, in two steps on one screen: who you are, then your details. The role only decides
 * which experience opens; the backend resolves the real account from the credentials. An
 * agent signs in with the agent code on Orange's record (or the number the app gave them, or
 * their Orange Money line); an aggregator with their Orange Money line.
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

  const field =
    'h-cta w-full rounded-cta border-2 border-line bg-paper px-4 text-lg font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted focus:border-ink'

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-11 items-center justify-between border-b-2 border-ink bg-paper px-4">
        <span className="flex items-center gap-2 text-sm font-bold tracking-tight">
          <LogoMark size={22} className="text-ink" />
          Agent App
        </span>
        {config.surface === 'customer' && (
          <Link to="/" className="text-sm font-semibold text-muted">
            Back
          </Link>
        )}
      </header>

      <form
        className="flex flex-1 flex-col gap-6 p-4 pb-8"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {/* Hierarchy: one headline, one sentence. */}
        <div className="pt-4">
          <h1 className="text-[28px] font-bold leading-none tracking-tight">Sign in</h1>
          <p className="mt-2 text-base text-muted">Orange Money agents and the aggregators who manage them.</p>
        </div>

        {/* Step 1 — who you are. Proximity: the two choices sit together as one group. */}
        <fieldset>
          <legend className="mb-2 flex items-center gap-2 text-sm font-bold">
            <span className="flex h-6 w-6 items-center justify-center bg-ink text-xs font-bold text-paper">1</span>
            Who you are
          </legend>
          <div role="radiogroup" aria-label="Who you are" className="grid grid-cols-2 gap-2">
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
                  className={`relative flex flex-col items-start gap-2 border-2 px-3 py-3 text-left transition-colors ${
                    on ? 'border-ink bg-paper text-ink' : 'border-line bg-paper text-muted'
                  }`}
                >
                  {on && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center bg-brand text-ink" aria-hidden="true">
                      <CheckIcon />
                    </span>
                  )}
                  <span className={on ? 'text-brand-text' : ''}>
                    <Icon />
                  </span>
                  <span className="block">
                    <span className="block text-base font-bold leading-tight">{label}</span>
                    <span className="block text-xs leading-snug">{hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>

        {/* Step 2 — your details. One card, label above each field, helper under it. */}
        <Card className="gap-4">
          <p className="flex items-center gap-2 text-sm font-bold">
            <span className="flex h-6 w-6 items-center justify-center bg-ink text-xs font-bold text-paper">2</span>
            Your details
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sign-in-ref" className="text-sm font-bold">
              {isAgent ? 'Agent code' : 'Orange Money number'}
            </label>
            <input
              id="sign-in-ref"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              autoComplete="username"
              inputMode={isAgent ? 'text' : 'tel'}
              placeholder={isAgent ? 'e.g. 100245' : 'e.g. 076 000 000'}
              className={field}
            />
            <span className="text-xs text-muted">
              {isAgent ? 'On your Orange record. Your Orange Money number works too.' : 'The line Orange has for your aggregator account.'}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="sign-in-pin" className="text-sm font-bold">
                PIN
              </label>
              <button type="button" onClick={() => setShowPin((v) => !v)} className="text-xs font-semibold text-muted underline" aria-pressed={showPin}>
                {showPin ? 'Hide PIN' : 'Show PIN'}
              </button>
            </div>
            <input
              id="sign-in-pin"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              type={showPin ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="4 to 6 digits"
              className={`${field} ${showPin || !pin ? '' : 'tracking-[0.4em]'}`}
            />
          </div>
          {error && (
            <p role="alert" className="border-l-4 border-danger bg-danger-tint px-3 py-2 text-sm font-semibold text-danger">
              {error}
            </p>
          )}
        </Card>

        {/* Contrast: one orange action; everything else is ink or muted. */}
        <Button size="cta" type="submit" disabled={busy || !ready} trailing={busy ? undefined : <ArrowIcon />}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>

        <p className="text-center text-sm text-muted">
          {isAgent ? 'No PIN yet? Your aggregator sets it when you are registered.' : 'No PIN yet? Ask the Agent Finder team.'}
        </p>

        {config.isDemo && (
          <Card className="bg-canvas">
            <p className="text-sm text-muted">
              Demo sign-in. PIN <b>1234</b>. Agent codes: 024, 031, 009, 017, 038. Aggregator: kissy.
            </p>
          </Card>
        )}

        {config.surface === 'customer' && (
          <p className="mt-auto text-center text-sm text-muted">
            Looking for an agent?{' '}
            <Link to="/find" className="font-semibold text-ink underline">
              Open Agent Finder
            </Link>
          </p>
        )}
      </form>
    </div>
  )
}
