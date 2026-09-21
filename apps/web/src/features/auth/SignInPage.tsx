import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button, Card } from '@/design'
import { config } from '@/lib/config'
import type { Role } from '@/types/operator'
import { useSession } from './session'

/**
 * One app, two account types. The role chosen here only decides which experience to open;
 * the backend resolves the real role from the credentials and is the authority on it.
 */
export default function SignInPage() {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }
  const [role, setRole] = useState<Role>('agent')
  const [ref, setRef] = useState('Agent 024')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      // A dealer has no agent number; the pilot has one dealer account, so the server resolves it.
      const s = await signIn(role === 'agent' ? ref : '', pin, role)
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

  return (
    <div className="flex flex-1 flex-col gap-5 p-4">
      <header className="flex h-12 items-center justify-between">
        <Link to="/" className="-ml-2 flex h-control items-center gap-1 rounded-card px-2 text-base font-semibold text-muted">
          <span aria-hidden="true" className="text-xl leading-none">
            ‹
          </span>
          Back
        </Link>
        <span className="rounded-pill bg-brand-light px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-text">
          Agent &amp; Dealer app
        </span>
      </header>

      <div>
        <h1 className="text-2xl font-bold leading-tight">Sign in</h1>
        <p className="mt-1 text-base text-muted">
          For Orange Money agents and their dealers. Customer looking for an agent?{' '}
          <Link to="/find" className="font-semibold text-brand-text underline">
            Go to Agent Finder
          </Link>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted" id="role-label">
          I am an
        </span>
        <div role="radiogroup" aria-labelledby="role-label" className="flex gap-2">
          {(['agent', 'dealer'] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              onClick={() => setRole(r)}
              className={`h-cta flex-1 rounded-cta border-2 text-lg font-bold capitalize ${
                role === r ? 'border-brand-deep bg-brand-light text-ink' : 'border-line bg-paper text-muted'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {role === 'agent' && (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-muted">Agent number</span>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            autoComplete="username"
            className="h-cta rounded-cta border-2 border-line bg-paper px-4 text-lg font-semibold outline-none focus:border-brand-deep"
          />
        </label>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">PIN</span>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          type="password"
          autoComplete="current-password"
          placeholder="••••"
          className="h-cta rounded-cta border-2 border-line bg-paper px-4 text-2xl font-bold tracking-[0.4em] outline-none focus:border-brand-deep"
        />
      </label>

      {error && (
        <p role="alert" className="text-base font-semibold text-danger">
          {error}
        </p>
      )}

      <Button size="cta" onClick={submit} disabled={busy || pin.length < 4}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>

      {config.isDemo && (
        <Card className="bg-canvas">
          <p className="text-sm text-muted">
            Demo sign-in. PIN <b>1234</b>. Agent numbers: 024, 031, 009, 017, 038. Choosing Dealer opens Kissy
            Distribution.
          </p>
        </Card>
      )}
    </div>
  )
}
