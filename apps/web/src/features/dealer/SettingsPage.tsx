import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { FinderCta, FinderHeader, FinderSheet } from '@/features/end-user/components/finder'
import { FieldLabel, Line, PILL_OFF, PILL_ON, SectionLabel } from '@/features/agent/components/agentChrome'
import { usePlatformTheme } from '@/lib/platformTheme'
import pkg from '../../../package.json'

/** Settings: the aggregator's own choices, reached from the gear on Profile. Appearance, PIN, about, sign out. */
export default function DealerSettingsPage() {
  const [theme, setTheme] = usePlatformTheme()
  const { signOut } = useSession()
  const navigate = useNavigate()
  // Change PIN: the current one first.
  const [pinOpen, setPinOpen] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [againPin, setAgainPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinDone, setPinDone] = useState(false)

  async function changePin() {
    if (newPin !== againPin) {
      setPinError('The two new PINs are not the same.')
      return
    }
    setPinBusy(true)
    setPinError(null)
    try {
      await operatorApi.changeDealerPin(currentPin, newPin)
      setPinOpen(false)
      setCurrentPin('')
      setNewPin('')
      setAgainPin('')
      setPinDone(true)
    } catch (e) {
      setPinError(e instanceof Error ? e.message : 'Could not change the PIN.')
    } finally {
      setPinBusy(false)
    }
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6)
  const pinField = 'h-[3.5rem] w-full rounded-field bg-finder-bg px-4 text-lg font-bold tracking-[0.4em] text-finder-ink shadow-inset-finder outline-none placeholder:text-finder-muted placeholder:tracking-normal focus:outline focus:outline-2 focus:outline-finder-link'

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <FinderHeader back="/dealer/profile" title="Settings" />

      <SectionLabel className="mt-6">Appearance</SectionLabel>
      <div role="radiogroup" aria-label="Appearance" className="mt-3 flex gap-3">
        {(['light', 'dark'] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} className={`h-[2.9rem] flex-1 rounded-pill text-base font-bold ${theme === t ? PILL_ON : PILL_OFF}`}>
            {t === 'light' ? 'Light' : 'Dark'}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs font-medium text-finder-muted">Light reads best in daylight. Dark is the same screens on the dark surface. On this phone only.</p>

      <SectionLabel className="mt-8">Security</SectionLabel>
      <div className="mt-2 flex flex-col">
        <Line
          label="PIN"
          action={
            <button type="button" onClick={() => setPinOpen(true)} className="flex h-control items-center text-base font-bold text-finder-link">
              Change ›
            </button>
          }
        />
      </div>
      {pinDone && (
        <p role="status" className="mt-2 text-sm font-semibold text-finder-likely">
          Your PIN is changed.
        </p>
      )}
      <p className="mt-2 text-xs font-medium text-finder-muted">Forgot it? The Agent Finder team gives you a one-time code; you choose a new PIN when you sign in with it.</p>

      <SectionLabel className="mt-8">About</SectionLabel>
      <div className="mt-2 flex flex-col">
        <Line label="Aggregator App" value={`Pilot build ${pkg.version}`} />
      </div>

      <button
        type="button"
        onClick={() => {
          signOut()
          navigate('/sign-in', { replace: true })
        }}
        className={`mt-10 h-[2.9rem] w-full rounded-pill text-base font-bold ${PILL_OFF}`}
      >
        Sign out
      </button>

      <FinderSheet open={pinOpen} onClose={() => setPinOpen(false)} title="Change PIN">
        <FieldLabel htmlFor="dealer-pin-current">Current PIN</FieldLabel>
        <input id="dealer-pin-current" type="password" inputMode="numeric" autoComplete="current-password" value={currentPin} onChange={(e) => setCurrentPin(digits(e.target.value))} className={pinField} placeholder="4 to 6 digits" />
        <FieldLabel htmlFor="dealer-pin-new">New PIN</FieldLabel>
        <input id="dealer-pin-new" type="password" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(e) => setNewPin(digits(e.target.value))} className={pinField} placeholder="4 to 6 digits" />
        <FieldLabel htmlFor="dealer-pin-again">New PIN again</FieldLabel>
        <input id="dealer-pin-again" type="password" inputMode="numeric" autoComplete="new-password" value={againPin} onChange={(e) => setAgainPin(digits(e.target.value))} className={pinField} placeholder="4 to 6 digits" />
        {pinError && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {pinError}
          </p>
        )}
        <FinderCta onClick={() => void changePin()} disabled={pinBusy || currentPin.length < 4 || newPin.length < 4 || againPin.length < 4}>
          {pinBusy ? 'Saving…' : 'Change PIN'}
        </FinderCta>
      </FinderSheet>
    </div>
  )
}
