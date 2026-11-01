import { useSession } from '@/features/auth/session'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { ActionLogged } from '@/types/operator'
import { ScreenTitle } from './components/designKit'
import { CARD, PAGE } from './components/designClasses'

/** What the agents sent themselves (a wrong record, a PIN change); not the aggregator's own. */
const FROM_AGENT = new Set<ActionLogged['action']>(['agent_note', 'agent_pin'])

/**
 * My action history: every call, nudge, escalation, registration, record change, pin
 * confirmation and photo removal this aggregator made, newest first, each as it was logged with their name. Reached from Settings.
 */
export default function DealerActionsPage() {
  const { session } = useSession()
  const list = useAsync<ActionLogged[]>((s) => operatorApi.actions(null, s))
  // A photo is logged the same way whoever changed it; the aggregator's own removals start with their name.
  const mine = (list.data ?? []).filter((a) => !FROM_AGENT.has(a.action) && (a.action !== 'photo' || a.note.startsWith(`${session?.name ?? ''} `)))
  return (
    <div className={PAGE.replace('gap-5', 'gap-4')}>
      <ScreenTitle title="My action history" back="/dealer/settings" />
      {list.state === 'loading' && !list.data && <p className="text-base font-medium text-finder-muted">Loading…</p>}
      {list.state === 'error' && (
        <p className="text-base font-semibold text-danger">
          {list.error ?? 'Could not load.'}{' '}
          <button type="button" onClick={list.refresh} className="underline">
            Try again
          </button>
        </p>
      )}
      {list.data && mine.length === 0 && <p className="text-base font-medium text-finder-muted">Nothing yet. Calls, nudges, registrations and changes to agents' records show here.</p>}
      {mine.length > 0 && (
        <ul className={`${CARD} px-4 py-1`} aria-label="My actions">
          {mine.map((a) => (
            <li key={a.id} className="border-t border-finder-card-line py-2.5 first:border-t-0">
              <p className="text-sm font-bold leading-snug">{a.note}</p>
              <p className="text-[13px] text-finder-muted">
                {a.agent_ref.replace(/^Agent /, 'Code ')} · {new Date(a.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs font-medium text-finder-muted">Every action is logged with your name. Orange can see the same record.</p>
    </div>
  )
}
