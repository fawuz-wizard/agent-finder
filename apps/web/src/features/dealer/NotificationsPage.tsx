import { Link } from 'react-router-dom'
import { Check, MapPin, TrendingDown, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAsync } from '@/hooks/useAsync'
import { operatorApi } from '@/services/operatorApi'
import type { DealerOverview, FloatForecast, FloatSend } from '@/types/operator'
import { formatSle } from '@/features/agent/money'
import { readOverview } from './overviewCache'
import { ScreenTitle } from './components/designKit'
import { CARD, PAGE } from './components/designClasses'
import { buildDealerNotices, useDealerSeen, type DealerNotice } from './dealerNotifications'

const ICON: Record<DealerNotice['group'], ReactNode> = {
  requests: <Wallet size={19} strokeWidth={1.8} />,
  pins: <MapPin size={19} strokeWidth={1.8} />,
  forecast: <TrendingDown size={19} strokeWidth={1.8} />,
  earlier: <Check size={19} strokeWidth={2} />,
}

const SMALL = 'flex h-9 items-center rounded-[10px] px-3 text-[13px] font-bold transition-transform duration-150 active:scale-[0.97]'

/**
 * Notifications, from the bell on Home: what used to sit in Home's float blocks. Float
 * requests waiting (Review opens the request), pins to confirm, the float forecast in words
 * (See who opens Float → Low today), and float sent this week. Opening one marks it read on
 * this phone; nothing is decided from here.
 */
export default function DealerNotificationsPage() {
  const overview = useAsync<DealerOverview>((s) => operatorApi.dealerOverview(s), [], readOverview())
  const forecast = useAsync<FloatForecast[]>((s) => operatorApi.floatForecast(s))
  const sends = useAsync<FloatSend[]>((s) => operatorApi.floatSends(null, 7, s))
  const notices = buildDealerNotices(overview.data ?? null, forecast.data ?? [], sends.data ?? [])
  const { seen, unread, markSeen } = useDealerSeen(notices)

  const groups: [DealerNotice['group'], string][] = [
    ['requests', `Float requests · ${notices.filter((n) => n.group === 'requests').length} waiting`],
    ['pins', 'Pins to confirm'],
    ['forecast', 'Float forecast'],
    ['earlier', 'Earlier'],
  ]

  return (
    <div className={PAGE}>
      <ScreenTitle
        title="Notifications"
        back="/dealer"
        action={
          unread > 0 ? (
            <button type="button" onClick={() => markSeen(notices.map((n) => n.id))} aria-label="Mark all read" className="shrink-0 text-sm font-bold text-finder-link">
              <span className="max-[359px]:hidden">Mark all read</span>
              <span className="hidden max-[359px]:inline">All read</span>
            </button>
          ) : undefined
        }
      />
      {overview.state === 'loading' && !overview.data && <p className="text-base font-medium text-finder-muted">Loading…</p>}
      {!overview.data && overview.error && (
        <p className="text-base font-semibold text-danger">
          {overview.error}{' '}
          <button type="button" onClick={overview.refresh} className="underline">
            Try again
          </button>
        </p>
      )}
      {overview.data && notices.length === 0 && <p className="text-base font-medium text-finder-muted">Nothing new. Float requests, pins to confirm and the float forecast show here.</p>}
      {groups.map(([g, label]) => {
        const rows = notices.filter((n) => n.group === g)
        if (rows.length === 0) return null
        return (
          <section key={g} aria-label={label} className="flex flex-col gap-2.5">
            <h2 className="text-xs font-extrabold uppercase tracking-[0.06em] text-finder-muted">{label}</h2>
            {rows.map((n) => {
              const isNew = g !== 'earlier' && !seen.has(n.id)
              const go = () => markSeen([n.id])
              return (
                <article key={n.id} className={`${CARD} flex gap-3 p-3.5 ${g === 'earlier' ? 'opacity-70' : ''}`}>
                  <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${g === 'forecast' ? 'bg-design-bad-tint text-danger' : 'bg-finder-tile text-finder-link'}`}>
                    {ICON[g]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 text-[15px] font-bold leading-snug">
                        {isNew && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-finder-accent align-middle" aria-label="New" />}
                        {n.title}
                      </p>
                      {n.amount !== undefined && <span className="shrink-0 text-[15px] font-extrabold">{formatSle(n.amount)}</span>}
                    </div>
                    <p className="mt-0.5 text-[13px] font-medium leading-snug text-finder-muted">{n.sub}</p>
                    {g !== 'earlier' && (
                      <div className="mt-2.5 flex gap-2">
                        <Link to={n.to} onClick={go} className={`${SMALL} ${g === 'requests' ? 'bg-finder-accent text-finder-on-orange' : 'border-[1.5px] border-finder-card-line text-finder-ink'}`}>
                          {g === 'forecast' ? 'See who' : 'Review'}
                        </Link>
                        {n.call && (
                          <a href={n.call} onClick={go} className={`${SMALL} border-[1.5px] border-finder-card-line text-finder-ink`}>
                            Call
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
