import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '@/design'
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

  if (state === 'loading' || !data || !weekly) return <p className="p-4 text-base text-muted">Loading…</p>
  const t = data.today

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-paper px-4 py-3">
        <h1 className="text-lg font-bold leading-tight">Working hours</h1>
        <p className="text-xs text-muted">{t.hours_text}</p>
      </header>

      <div className="flex flex-col gap-3 p-4 pb-6">
        <Card>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Today only</p>
          <p className="text-sm text-muted">Changes today and nothing else. Tomorrow follows your weekly hours.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button size="control" variant="secondary" onClick={() => today({ hours: [t.today?.[0] ?? '08:00', '13:00'] })}>
              Half day
            </Button>
            <Button size="control" variant="secondary" onClick={() => today({ day_off: true })}>
              Day off
            </Button>
            <Button size="control" variant="secondary" onClick={() => today({ extend_minutes: 60 })}>
              Stay open 1 more hour
            </Button>
            <Button size="control" variant="secondary" onClick={() => today({ clear: true })} disabled={!t.today_only && !t.extended_until}>
              Back to normal
            </Button>
          </div>
        </Card>

        <Card>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Every week</p>
          <ul className="flex flex-col divide-y divide-line">
            {WEEKDAYS.map((day) => {
              const h = weekly[day]
              return (
                <li key={day} className="flex items-center gap-2 py-2">
                  <span className="w-24 text-sm font-semibold">{WEEKDAY_NAMES[day]}</span>
                  {h ? (
                    <>
                      <input
                        id={`${day}-open`}
                        aria-label={`${WEEKDAY_NAMES[day]} opens`}
                        type="time"
                        value={h[0]}
                        onChange={(e) => setDay(day, [e.target.value, h[1]])}
                        className="h-control flex-1 rounded-card border border-line bg-paper px-2 text-sm"
                      />
                      <span className="text-xs text-muted">to</span>
                      <input
                        id={`${day}-close`}
                        aria-label={`${WEEKDAY_NAMES[day]} closes`}
                        type="time"
                        value={h[1]}
                        onChange={(e) => setDay(day, [h[0], e.target.value])}
                        className="h-control flex-1 rounded-card border border-line bg-paper px-2 text-sm"
                      />
                    </>
                  ) : (
                    <span className="flex-1 text-sm text-muted">Closed</span>
                  )}
                  <label className="flex items-center gap-1 text-xs text-muted">
                    <input
                      type="checkbox"
                      aria-label={`${WEEKDAY_NAMES[day]} closed`}
                      checked={h === null}
                      onChange={(e) => setDay(day, e.target.checked ? null : ['08:00', '20:00'])}
                    />
                    closed
                  </label>
                </li>
              )
            })}
          </ul>
        </Card>

        {error && (
          <p role="alert" className="text-base font-semibold text-danger">
            {error}
          </p>
        )}
        <Button size="cta" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save weekly hours'}
        </Button>
        <p className="text-center text-xs text-muted">
          Outside these hours customers are told you are closed. Fifteen minutes before closing, your home screen asks whether to stay open.
        </p>
      </div>
    </div>
  )
}
