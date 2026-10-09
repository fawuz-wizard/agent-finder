import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button, Card, LogoMark } from '@/design'
import { config } from '@/lib/config'
import type { Role } from '@/types/operator'
import { useSession } from './session'

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: 'agent', label: 'Agent', hint: 'At a shop' },
  { value: 'dealer', label: 'Aggregator', hint: 'Manages agents' },
]

/**
 * One app, two account types. The role chosen here only decides which experience to open;
 * the backend resolves the real account from the credentials and is the authority on it.
 * An agent signs in with the agent code on Orange's record (or the number the app gave
 * them, or their Orange Money line); an aggregator with their Orange Money line.
 */
export default function SignInPage() {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }
  const [role, setRole] = useState<Role>('agent')
  const [ref, setRef] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = pin.length >= 4 && (role === 'dealer' || ref.trim().length > 0)

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
        className="flex flex-1 flex-col gap-5 p-4 pb-8"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="pt-2">
          <h1 className="text-2xl font-bold leading-tight">Sign in</h1>
          <p className="mt-1 text-base text-muted">For Orange Money agents and the aggregators who manage them.</p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold">I am an</legend>
          <div role="radiogroup" aria-label="I am an" className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={role === r.value}
                onClick={() => {
                  setRole(r.value)
                  setError(null)
                }}
                className={`flex h-[64px] flex-col items-center justify-center rounded-cta border-2 px-2 ${
                  role === r.value ? 'border-ink bg-brand-light text-ink' : 'border-line bg-paper text-muted'
                }`}
              >
                <span className="text-lg font-bold leading-tight">{r.label}</span>
                <span className="text-xs font-semibold">{r.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-bold">{role === 'agent' ? 'Agent code' : 'Orange Money number'}</span>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            autoComplete="username"
            inputMode={role === 'agent' ? 'text' : 'tel'}
            placeholder={role === 'agent' ? 'e.g. 100245' : 'e.g. 076 000 000'}
            aria-label={role === 'agent' ? 'Agent code' : 'Orange Money number'}
            className={field}
          />
          <span className="text-xs text-muted">
            {role === 'agent'
              ? 'The agent code on your Orange record, or your Orange Money number.'
              : 'The Orange Money line Orange has for your aggregator account.'}
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-bold">PIN</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            type="password"
            autoComplete="current-password"
            placeholder="••••"
            aria-label="PIN"
            className={`${field} text-2xl font-bold tracking-[0.4em]`}
          />
        </label>

        {error && (
          <p role="alert" className="text-base font-semibold text-danger">
            {error}
          </p>
        )}

        <Button size="cta" type="submit" disabled={busy || !ready}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>

        {config.isDemo && (
          <Card className="bg-canvas">
            <p className="text-sm text-muted">
              Demo sign-in. PIN <b>1234</b>. Agent codes: 024, 031, 009, 017, 038. Choosing Aggregator opens Kissy Distribution.
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
