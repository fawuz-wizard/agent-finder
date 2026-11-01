import { useId, useState } from 'react'
import { useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentProfile } from '@/types/operator'
import { AgentTitle } from './components/agentKit'
import { BOX, FIELD, PRIMARY } from './components/agentClasses'

/**
 * Change PIN, from Profile: the current PIN, the new one twice, Save. A forgotten PIN is the
 * aggregator's one-time code, never set here. Below, the phones signed in to this account and
 * one way to sign the others out.
 */
export default function ChangePinPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const toast = useToast()
  const ids = useId()
  const { data, refresh } = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [othersBusy, setOthersBusy] = useState(false)

  async function save() {
    if (!/^\d{4,6}$/.test(next)) return setError('The new PIN is 4 to 6 digits.')
    if (next !== again) return setError('The two new PINs are not the same.')
    setBusy(true)
    setError(null)
    try {
      await operatorApi.changePin(ref, current, next)
      setCurrent('')
      setNext('')
      setAgain('')
      toast.show('PIN changed.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the PIN.')
    } finally {
      setBusy(false)
    }
  }

  async function signOutOthers() {
    setOthersBusy(true)
    try {
      const out = await operatorApi.signOutOthers(ref)
      toast.show(out.signed_out === 0 ? 'No other phone was signed in.' : `Signed out ${out.signed_out} other phone${out.signed_out === 1 ? '' : 's'}.`)
      refresh()
    } finally {
      setOthersBusy(false)
    }
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6)
  const input = 'h-full min-w-0 flex-1 bg-transparent text-lg font-bold tracking-[0.4em] outline-none placeholder:text-sm placeholder:font-medium placeholder:tracking-normal placeholder:text-finder-muted'
  const fields: [string, string, string, (v: string) => void, string][] = [
    ['current', 'Current PIN', current, setCurrent, 'current-password'],
    ['new', 'New PIN', next, setNext, 'new-password'],
    ['again', 'New PIN again', again, setAgain, 'new-password'],
  ]
  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <AgentTitle title="Change PIN" back="/agent/profile" />
      <div className="flex flex-col gap-2.5 px-[18px] pb-8 pt-5">
        {fields.map(([key, label, value, set, auto]) => (
          <div key={key} className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-${key}`} className="text-sm font-bold">
              {label}
            </label>
            <div className={FIELD}>
              <input id={`${ids}-${key}`} type="password" inputMode="numeric" autoComplete={auto} value={value} onChange={(e) => set(digits(e.target.value))} placeholder="4 to 6 digits" className={input} />
            </div>
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <button type="button" onClick={() => void save()} disabled={busy || current.length < 4 || next.length < 4 || again.length < 4} className={`${PRIMARY} mt-2`}>
          {busy ? 'Saving…' : 'Save PIN'}
        </button>
        <p className="text-xs text-finder-muted">Forgot it? Your aggregator gives you a one-time code; you choose a new PIN when you sign in with it.</p>

        <section aria-labelledby="phones" className={`${BOX} mt-3 flex flex-col gap-1 px-4 py-3`}>
          <h2 id="phones" className="text-sm font-bold">
            Phones signed in
          </h2>
          {(data?.devices ?? []).map((d) => (
            <p key={d.id} className="text-[13px] text-finder-muted">
              {d.label} · {d.last_seen_text}
              {d.current && !/this phone/i.test(d.label) ? ' · this phone' : ''}
            </p>
          ))}
          {(data?.devices.length ?? 0) > 1 && (
            <button type="button" onClick={() => void signOutOthers()} disabled={othersBusy} className="mt-1 self-start text-sm font-bold text-finder-link disabled:opacity-50">
              {othersBusy ? 'Signing out…' : 'Sign out the other phones'}
            </button>
          )}
        </section>
      </div>
    </div>
  )
}
