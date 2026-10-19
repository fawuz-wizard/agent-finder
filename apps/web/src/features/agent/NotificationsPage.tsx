import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '@/features/auth/session'
import { FinderHeader } from '@/features/end-user/components/finder'
import { useNotifications, type Notification } from './notifications'

const TONE: Record<Notification['tone'], string> = {
  neutral: 'text-finder-ink',
  good: 'text-finder-likely',
  warning: 'text-warning',
  danger: 'text-danger',
}

/** What the bell gathered, newest concern first. Opening it marks everything seen on this phone. */
export default function NotificationsPage() {
  const { session } = useSession()
  const ref = session?.ref ?? 'Agent 024'
  const { items, markSeen, loading } = useNotifications(ref)
  useEffect(() => {
    if (!loading) markSeen()
  }, [loading, markSeen])

  return (
    <div className="flex flex-1 flex-col px-5 pb-8 text-finder-ink">
      <div className="mt-4">
        <FinderHeader back="/agent" title="Notifications" />
      </div>
      <div className="mt-4 flex flex-col">
        {loading && <p className="py-3 text-sm font-medium text-finder-muted">Loading…</p>}
        {!loading && items.length === 0 && <p className="py-3 text-base font-medium text-finder-muted">Nothing new. Customers, your aggregator and your status will show up here.</p>}
        {items.map((n) => (
          <Link key={n.id} to={n.to} className="flex min-h-[3.5rem] items-start gap-4 border-b border-finder-line py-3 last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className={`block text-base font-semibold leading-snug ${TONE[n.tone]}`}>{n.text}</span>
              <span className="mt-0.5 block text-xs font-semibold text-finder-muted">{n.when}</span>
            </span>
            <span aria-hidden="true" className="pt-1 text-finder-link">›</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
