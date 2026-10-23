import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { LogoMark } from '@/design'
import { FinderBox, FinderCta } from '@/features/end-user/components/finder'
import { useSession } from './session'

/**
 * The one screen a one-time code opens. The aggregator (or the team) read the code out in
 * person; the PIN chosen here replaces it and is known to nobody else. Until it is chosen,
 * every other screen sends the person back here, and the API answers the same way.
 */
export default function ChoosePinPage() {
  const { session, pinChosen, signOut } = useSession()
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!session) return <Navigate to="/sign-in" replace />
  if (!session.must_set_pin) return <Navigate to={session.role === 'agent' ? '/agent' : '/dealer'} replace />

  const ready = pin.length >= 4 && again.length >= 4

  async function submit() {
    if (!ready || busy || !session) return
    if (pin !== again) {
      setError('The two PINs are not the same.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { operatorApi } = await import('@/services/operatorApi')
      await operatorApi.choosePin(session.ref, session.role, pin)
      pinChosen()
      navigate(session.role === 'agent' ? '/agent' : '/dealer', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the PIN.')
      setBusy(false)
    }
  }

  const input = 'h-full w-full min-w-0 bg-transparent text-lg font-bold text-finder-ink outline-none placeholder:font-medium placeholder:text-finder-muted'
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6)

  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <div className="flex h-12 items-center justify-between gap-3 px-5">
        <span className="flex items-center gap-2 text-base font-bold">
          <LogoMark size={20} className="text-finder-ink" />
          <span className="sr-only">Agent App</span>
        </span>
        <button type="button" onClick={signOut} className="text-sm font-bold text-finder-muted">
          Sign out
        </button>
      </div>

      <form
        className="flex flex-1 flex-col px-5 pb-8"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h1 className="mt-6 text-lg font-bold leading-tight">Choose your PIN</h1>
        <p className="mt-1 text-sm font-medium text-finder-muted">
          Welcome, {session.name}. The code you signed in with works once. Pick 4 to 6 digits that only you know; you will sign in with
          them from now on.
        </p>

        <div className="mt-6 flex items-center justify-between">
          <label htmlFor="choose-pin" className="text-[0.95rem] font-medium">
            New PIN
          </label>
          <button type="button" onClick={() => setShow((v) => !v)} className="text-sm font-bold text-finder-link" aria-pressed={show}>
            {show ? 'Hide PIN' : 'Show PIN'}
          </button>
        </div>
        <FinderBox className="mt-2 flex h-[3.5rem] items-center px-4 focus-within:outline focus-within:outline-2 focus-within:outline-finder-link">
          <input
            id="choose-pin"
            value={pin}
            onChange={(e) => setPin(digits(e.target.value))}
            inputMode="numeric"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="4 to 6 digits"
            className={`${input} ${show || !pin ? '' : 'tracking-[0.4em]'}`}
          />
        </FinderBox>

        <label htmlFor="choose-pin-again" className="mt-4 text-[0.95rem] font-medium">
          The same PIN again
        </label>
        <FinderBox className="mt-2 flex h-[3.5rem] items-center px-4 focus-within:outline focus-within:outline-2 focus-within:outline-finder-link">
          <input
            id="choose-pin-again"
            value={again}
            onChange={(e) => setAgain(digits(e.target.value))}
            inputMode="numeric"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="4 to 6 digits"
            className={`${input} ${show || !again ? '' : 'tracking-[0.4em]'}`}
          />
        </FinderBox>
        {error && (
          <p role="alert" className="mt-3 border-l-4 border-danger pl-3 text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        <FinderCta type="submit" className="mt-6" disabled={busy || !ready}>
          {busy ? 'Saving…' : 'Save PIN'}
        </FinderCta>
        <p className="mt-4 text-center text-sm font-medium text-finder-muted">
          Forgot it later? {session.role === 'agent' ? 'Your aggregator' : 'The Agent Finder team'} gives you a new code.
        </p>
      </form>
    </div>
  )
}
