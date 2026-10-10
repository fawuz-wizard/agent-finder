import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FinderBox, FinderCta, FinderHeader } from '@/features/end-user/components/finder'
import { PILL_OFF, PILL_ON, SectionLabel } from './components/agentChrome'
import { useAsync } from '@/hooks/useAsync'
import { useSession } from '@/features/auth/session'
import { operatorApi } from '@/services/operatorApi'
import { WEEKDAYS, WEEKDAY_NAMES } from '@/types/operator'
import type { Schedule, TodayChange, Weekday, WeeklyHours } from '@/types/operator'

/**
 * Working hours. The agent's own instruction: a weekly pattern, and one-tap changes for today.
 * Outside these hours the system closes them to customers, after a fifteen-minute warning on
 * the home screen with "stay open". No status, no words, no refresh.
 */
export default function HoursPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const navigate = useNavigate()
  const { state, data, refresh } = useAsync<Schedule>((s) => operatorApi.schedule(ref, s), [ref])
  const [weekly, setWeekly] = useState<WeeklyHours | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data) setWeekly({ ...data.weekly })
  }, [data])

  function setDay(day: Weekday, hours: [string, string] | null) {
    setWeekly((w) => (w ? { ...w, [day]: hours } : w))
  }

  async function save() {
    if (!weekly) return
    setSaving(true)
    setError(null)
    try {
      await operatorApi.setSchedule(ref, weekly)
      navigate('/agent')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
      setSaving(false)
    }
  }

  async function today(change: TodayChange) {
    setError(null)
    try {
      await operatorApi.setToday(ref, change)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change today.')
    }
  }

  if (state === 'loading' || !data || !weekly)
    return (
      <div className="flex flex-col gap-4 px-5 pb-8 text-white">
        <FinderHeader title="Working hours" back={() => history.back()} />
        <p className="text-base font-medium text-finder-muted">Loading…</p>
      </div>
    )
  const t = data.today
  // Which of today's four choices is in force, so it shows orange.
  const mode: 'normal' | 'half' | 'off' | 'extended' = t.extended_until
    ? 'extended'
    : !t.today_only
      ? 'normal'
      : t.today === null
        ? 'off'
        : 'half'
  const timeClass = 'h-10 w-[118px] rounded-field bg-finder-line px-2 text-center text-sm font-bold text-white outline-none focus:outline focus:outline-2 focus:outline-finder-link'

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-white">
      <FinderHeader title="Working hours" back={() => history.back()} />
      <p className="mt-6 text-md font-bold leading-tight">{t.hours_text}</p>
      <p className="mt-1 text-sm font-medium text-finder-muted">Outside these hours customers are told you are closed. Fifteen minutes before closing, the Dashboard asks whether to stay open.</p>

      <SectionLabel className="mt-6">Today only</SectionLabel>
      <p className="mt-1 text-sm font-medium text-finder-muted">Changes today and nothing else. Tomorrow follows your weekly hours.</p>
      <div role="radiogroup" aria-label="Today" className="mt-3 grid grid-cols-2 gap-3">
        {(
          [
            ['Normal day', 'normal', () => today({ clear: true })],
            ['Half day', 'half', () => today({ hours: [t.today?.[0] ?? '07:00', '13:00'] })],
            ['Day off', 'off', () => today({ day_off: true })],
            ['Open 1 more hour', 'extended', () => today({ extend_minutes: 60 })],
          ] as const
        ).map(([label, key, act]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={mode === key}
            onClick={act}
            className={`h-[46px] rounded-pill px-3 text-[15px] font-bold leading-tight ${mode === key ? PILL_ON : PILL_OFF}`}
          >
            {label}
          </button>
        ))}
      </div>

      <SectionLabel className="mt-8">Every week</SectionLabel>
      <ul className="mt-3 flex flex-col gap-2">
        {WEEKDAYS.map((day) => {
          const h = weekly[day]
          return (
            <li key={day}>
              <FinderBox className="flex min-h-[54px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-2">
                <span className="text-base font-bold">{WEEKDAY_NAMES[day]}</span>
                <label className="flex items-center gap-2 text-sm font-semibold text-finder-muted">
                  <input
                    type="checkbox"
                    aria-label={`${WEEKDAY_NAMES[day]} closed`}
                    checked={h === null}
                    onChange={(e) => setDay(day, e.target.checked ? null : ['07:00', '19:00'])}
                    className="h-5 w-5 accent-finder-link"
                  />
                  Closed
                </label>
                {h ? (
                  <div className="flex w-full items-center gap-2">
                    <input id={`${day}-open`} aria-label={`${WEEKDAY_NAMES[day]} opens`} type="time" value={h[0]} onChange={(e) => setDay(day, [e.target.value, h[1]])} className={timeClass} />
                    <span className="text-sm font-semibold text-finder-muted">to</span>
                    <input id={`${day}-close`} aria-label={`${WEEKDAY_NAMES[day]} closes`} type="time" value={h[1]} onChange={(e) => setDay(day, [h[0], e.target.value])} className={timeClass} />
                  </div>
                ) : (
                  <span className="w-full text-sm font-medium text-finder-muted">Closed all day</span>
                )}
              </FinderBox>
            </li>
          )
        })}
      </ul>

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <FinderCta className="mt-6" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save weekly hours'}
      </FinderCta>
    </div>
  )
}
