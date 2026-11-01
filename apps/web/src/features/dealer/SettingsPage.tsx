import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, ChevronRight, Eye, List, Lock, MapPin, TrendingDown, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { operatorApi } from '@/services/operatorApi'
import { FinderCta, FinderSheet } from '@/features/end-user/components/finder'
import { FieldLabel } from '@/features/agent/components/agentChrome'
import { usePlatformTheme } from '@/lib/platformTheme'
import { ScreenTitle } from './components/designKit'
import { CARD, PAGE } from './components/designClasses'
import { BELL_KINDS, readBellOff, writeBellOff, type DealerNotice } from './dealerNotifications'
import pkg from '../../../package.json'

const BELL_ICON: Record<DealerNotice['group'], ReactNode> = {
  requests: <Wallet size={16} strokeWidth={2} aria-hidden />,
  forecast: <TrendingDown size={16} strokeWidth={2} aria-hidden />,
  pins: <MapPin size={16} strokeWidth={2} aria-hidden />,
  earlier: <ArrowLeftRight size={16} strokeWidth={2} aria-hidden />,
}

const GROUP = `${CARD} flex flex-col px-4`
const ROW = 'flex min-h-[50px] items-center gap-3 border-t border-finder-card-line text-[15px] font-bold first:border-t-0'

function Heading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="-mb-2 px-0.5 text-xs font-extrabold uppercase tracking-[0.07em] text-finder-muted">
      {children}
    </h2>
  )
}

function Icon({ children }: { children: ReactNode }) {
  return <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-design-peach text-finder-link">{children}</span>
}

/**
 * Settings: the aggregator's own choices, reached from the gear on Profile, in four short groups.
 * Appearance (this phone). Notifications: which kinds the bell shows, this phone only; the
 * server sends the same. Security: the PIN. Privacy & records: the financial reveals and the
 * aggregator's own logged actions. The version at the foot.
 * Sign out lives on Profile only.
 */
export default function DealerSettingsPage() {
  const [theme, setTheme] = usePlatformTheme()
  const [bellOff, setBellOff] = useState(readBellOff)
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

  function toggleBell(group: DealerNotice['group']) {
    const next = new Set(bellOff)
    if (next.has(group)) next.delete(group)
    else next.add(group)
    writeBellOff(next)
    setBellOff(next)
  }

  return (
    <div className={PAGE.replace('gap-5', 'gap-4')}>
      <ScreenTitle title="Settings" back="/dealer/profile" />

      <Heading id="set-look">Appearance</Heading>
      <section aria-labelledby="set-look" className={`${GROUP} py-3`}>
        <div role="radiogroup" aria-label="Appearance" className="flex gap-1 rounded-xl bg-design-track p-1">
          {(['dark', 'light'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} className={`h-10 flex-1 rounded-[10px] text-sm font-extrabold transition-colors duration-150 ${theme === t ? 'bg-finder-card text-finder-ink shadow-sm' : 'text-finder-muted'}`}>
              {t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs font-medium text-finder-muted">Light is the same screens on white, for bright daylight. This phone only.</p>
      </section>

      <Heading id="set-bell">Notifications · in the bell</Heading>
      <section aria-labelledby="set-bell" className={GROUP}>
        {BELL_KINDS.map((k) => {
          const on = !bellOff.has(k.group)
          return (
            <label key={k.group} className={`${ROW} cursor-pointer`}>
              <Icon>{BELL_ICON[k.group]}</Icon>
              <span className="flex-1">{k.label}</span>
              <input type="checkbox" role="switch" checked={on} onChange={() => toggleBell(k.group)} className="peer sr-only" />
              <span aria-hidden className={`relative h-6 w-[42px] shrink-0 rounded-full transition-colors duration-150 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-finder-link ${on ? 'bg-finder-accent' : 'bg-design-track'}`}>
                <span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-finder-card shadow-sm transition-[left] duration-150 ${on ? 'left-[21px]' : 'left-[3px]'}`} />
              </span>
            </label>
          )
        })}
      </section>
      <p className="-mt-2 px-0.5 text-xs font-medium text-finder-muted">This phone only. Switched off, the bell leaves that kind out; nothing changes for the agents.</p>

      <Heading id="set-security">Security</Heading>
      <section aria-labelledby="set-security" className={GROUP}>
        <button type="button" onClick={() => setPinOpen(true)} className={`${ROW} text-left`} aria-label="Change PIN">
          <Icon>
            <Lock size={16} strokeWidth={2} aria-hidden />
          </Icon>
          <span className="flex-1">PIN</span>
          <span className="text-[13px] font-semibold text-finder-muted">Change</span>
          <ChevronRight size={18} className="text-finder-muted" aria-hidden />
        </button>
      </section>
      {pinDone && (
        <p role="status" className="-mt-2 px-0.5 text-sm font-semibold text-finder-likely">
          Your PIN is changed.
        </p>
      )}

      <Heading id="set-records">Privacy &amp; records</Heading>
      <section aria-labelledby="set-records" className={GROUP}>
        <Link to="/dealer/reveals" className={ROW}>
          <Icon>
            <Eye size={16} strokeWidth={2} aria-hidden />
          </Icon>
          <span className="flex-1">My financial reveals</span>
          <ChevronRight size={18} className="text-finder-muted" aria-hidden />
        </Link>
        <Link to="/dealer/actions" className={ROW}>
          <Icon>
            <List size={16} strokeWidth={2} aria-hidden />
          </Icon>
          <span className="flex-1">My action history</span>
          <ChevronRight size={18} className="text-finder-muted" aria-hidden />
        </Link>
      </section>

      <p className="text-center text-xs font-medium text-finder-muted">Aggregator App · Pilot build {pkg.version}</p>

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
