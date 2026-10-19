import { useEffect, useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from '@/design'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import type { AgentProfile } from '@/types/operator'
import { readPrefs, writePrefs, type AgentPrefs } from '@/lib/prefs'
import { usePlatformTheme } from '@/lib/platformTheme'
import { FinderCta, FinderHeader, FinderSheet } from '@/features/end-user/components/finder'
import { FieldLabel, Line, PILL_OFF, PILL_ON, SectionLabel, Switch } from './components/agentChrome'
import pkg from '../../../package.json'

const ALERTS: { key: keyof AgentPrefs; label: string }[] = [
  { key: 'closingBeep', label: 'Beep before closing' },
  { key: 'leftShopWatch', label: 'Ask when I leave the shop' },
]

/**
 * Settings: the agent's own choices, reached from the gear on Profile. The two alerts the
 * phone can give today, whether customers see their phone, light or dark, the PIN and the
 * phones signed in, about, sign out. No notification centre: nothing is promised that the
 * phone cannot deliver without a notification service.
 */
export default function SettingsPage() {
  const [theme, setTheme] = usePlatformTheme()
  const { session, signOut } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const navigate = useNavigate()
  const toast = useToast()
  const ids = useId()
  const { data, setData, refresh } = useAsync<AgentProfile>((s) => operatorApi.profile(ref, s), [ref])
  const [prefs, setPrefs] = useState<AgentPrefs>(readPrefs)
  useEffect(() => {
    const sync = () => setPrefs(readPrefs())
    window.addEventListener('af-prefs', sync)
    return () => window.removeEventListener('af-prefs', sync)
  }, [])

  // Change PIN: the current one first.
  const [pinOpen, setPinOpen] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [againPin, setAgainPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [othersBusy, setOthersBusy] = useState(false)

  async function togglePhone(next: boolean) {
    setData(await operatorApi.setPhoneVisible(ref, next))
  }

  async function changePin() {
    if (!/^\d{4,6}$/.test(newPin)) {
      setPinError('The new PIN is 4 to 6 digits.')
      return
    }
    if (newPin !== againPin) {
      setPinError('The two new PINs are not the same.')
      return
    }
    setPinBusy(true)
    setPinError(null)
    try {
      await operatorApi.changePin(ref, currentPin, newPin)
      setPinOpen(false)
      setCurrentPin('')
      setNewPin('')
      setAgainPin('')
      toast.show('PIN changed.')
    } catch (e) {
      setPinError(e instanceof Error ? e.message : 'Could not change the PIN.')
    } finally {
      setPinBusy(false)
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

  const pinField = 'h-[3.5rem] w-full rounded-field bg-finder-bg px-4 text-lg font-bold tracking-[0.4em] text-finder-ink shadow-inset-finder outline-none placeholder:text-finder-muted placeholder:tracking-normal focus:outline focus:outline-2 focus:outline-finder-link'

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <div className="mt-4">
        <FinderHeader back="/agent/profile" title="Settings" />
      </div>

      <SectionLabel className="mt-6">Alerts</SectionLabel>
      <div className="mt-2 flex flex-col">
        {ALERTS.map((n) => (
          <Line key={n.key} label={n.label} action={<Switch on={prefs[n.key]} label={n.label} onChange={(next) => setPrefs(writePrefs({ [n.key]: next }))} />} />
        ))}
      </div>
      <p className="mt-2 text-xs font-medium text-finder-muted">Fifteen minutes before you close, and when your phone is far from your pin while you are open. Both on this phone only.</p>

      <SectionLabel className="mt-8">Customers</SectionLabel>
      <div className="mt-2 flex flex-col">
        <Line label="Show my phone to customers" action={<Switch on={Boolean(data?.phone_visible)} label="Show my phone to customers" onChange={(next) => void togglePhone(next)} />} />
      </div>
      <p className="mt-2 text-xs font-medium text-finder-muted">Off by default. On: customers see your number and calls go straight to your phone. They never see your balance or your float.</p>

      <SectionLabel className="mt-8">Appearance</SectionLabel>
      <div role="radiogroup" aria-label="Appearance" className="mt-3 flex gap-3">
        {(['light', 'dark'] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} className={`h-[2.9rem] flex-1 rounded-pill text-base font-bold ${theme === t ? PILL_ON : PILL_OFF}`}>
            {t === 'light' ? 'Light' : 'Dark'}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs font-medium text-finder-muted">Light reads best at the counter in daylight. Dark is the same screens on the dark surface. On this phone only.</p>

      <SectionLabel className="mt-8">Security</SectionLabel>
      <div className="mt-2 flex flex-col">
        <Line label="PIN" action={<button type="button" onClick={() => setPinOpen(true)} className="text-base font-bold text-finder-link">Change ›</button>} />
        {(data?.devices ?? []).map((d) => (
          <Line key={d.id} label={d.label} value={d.last_seen_text} />
        ))}
      </div>
      {(data?.devices.length ?? 0) > 1 && (
        <button type="button" onClick={() => void signOutOthers()} disabled={othersBusy} className={`mt-3 h-[2.9rem] rounded-pill text-base font-bold ${PILL_OFF}`}>
          {othersBusy ? '…' : 'Sign out the other phones'}
        </button>
      )}

      <SectionLabel className="mt-8">About</SectionLabel>
      <div className="mt-2 flex flex-col">
        <Line label="How customers find you" action={<Link to="/how-availability-works" className="text-base font-bold text-finder-link">Read ›</Link>} />
        <Line label="Agent App" value={`Pilot build ${pkg.version}`} />
      </div>

      <button
        type="button"
        onClick={() => {
          signOut()
          navigate('/sign-in', { replace: true })
        }}
        className={`mt-8 h-[3rem] w-full rounded-pill text-base font-bold ${PILL_OFF}`}
      >
        Sign out
      </button>

      <FinderSheet open={pinOpen} onClose={() => setPinOpen(false)} title="Change PIN">
        <FieldLabel htmlFor={`${ids}-pin-current`}>Current PIN</FieldLabel>
        <input id={`${ids}-pin-current`} type="password" inputMode="numeric" autoComplete="current-password" value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className={pinField} placeholder="4 to 6 digits" />
        <FieldLabel htmlFor={`${ids}-pin-new`}>New PIN</FieldLabel>
        <input id={`${ids}-pin-new`} type="password" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className={pinField} placeholder="4 to 6 digits" />
        <FieldLabel htmlFor={`${ids}-pin-again`}>New PIN again</FieldLabel>
        <input id={`${ids}-pin-again`} type="password" inputMode="numeric" autoComplete="new-password" value={againPin} onChange={(e) => setAgainPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className={pinField} placeholder="4 to 6 digits" />
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
