import { useEffect, useState } from 'react'
import { readPrefs, writePrefs, type AgentPrefs } from '@/lib/prefs'
import { Switch } from './components/agentChrome'
import { AgentTitle } from './components/agentKit'
import { BOX } from './components/agentClasses'

const ALERTS: { key: keyof AgentPrefs; label: string; sub: string }[] = [
  { key: 'closingBeep', label: 'Closing reminder', sub: '15 minutes before you close, so you can stay open longer.' },
  { key: 'leftShopWatch', label: 'Tell me if I leave the shop', sub: "While the app is open. Away from your pin, customers can't see you until you're back." },
]

/** Notification Settings, from Profile: the two alerts the agent chooses, on this phone only. */
export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<AgentPrefs>(readPrefs)
  useEffect(() => {
    const sync = () => setPrefs(readPrefs())
    window.addEventListener('af-prefs', sync)
    return () => window.removeEventListener('af-prefs', sync)
  }, [])
  return (
    <div className="flex flex-1 flex-col text-finder-ink">
      <AgentTitle title="Notification Settings" back="/agent/profile" />
      <div className="flex flex-col gap-3 px-[18px] pb-8 pt-5">
        <div className={`${BOX} flex flex-col`}>
          {ALERTS.map((a, k) => (
            <div key={a.key} className={`flex items-center gap-3 px-4 py-3 ${k ? 'border-t border-agent-divider' : ''}`}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-bold">{a.label}</span>
                <span className="text-xs text-finder-muted">{a.sub}</span>
              </span>
              <Switch on={prefs[a.key]} label={a.label} onChange={(next) => setPrefs(writePrefs({ [a.key]: next }))} />
            </div>
          ))}
        </div>
        <p className="text-xs text-finder-muted">On this phone only. Float decisions, customer reports and "still Away" reminders always reach you in the bell.</p>
      </div>
    </div>
  )
}
