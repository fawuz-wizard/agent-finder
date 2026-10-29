/**
 * Error tracking with Sentry, off unless VITE_SENTRY_DSN is set and the build is live (the demo
 * never reports). The package loads only when it is on, so the demo and an unset build carry
 * none of it. What leaves the phone is the error, the screen's path and the release: never the
 * query (a search carries the customer's position and amount), the user or the breadcrumbs.
 */
import { config } from './config'

interface ReportEvent {
  request?: { url?: string | undefined } | undefined
  user?: unknown
  breadcrumbs?: unknown
}

export function scrub<E extends ReportEvent>(event: E): E {
  if (event.request) {
    const raw = event.request.url
    const url = typeof raw === 'string' ? (raw.split(/[?#]/)[0] ?? '') : undefined
    event.request = (url === undefined ? {} : { url }) as E['request']
  }
  delete event.user
  delete event.breadcrumbs
  return event
}

export async function initMonitoring(): Promise<boolean> {
  if (!config.sentryDsn || config.isDemo) return false
  const Sentry = await import('@sentry/react')
  Sentry.init({
    dsn: config.sentryDsn,
    environment: import.meta.env.MODE,
    release: `agent-finder-web@${config.surface}`,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    integrations: [],
    beforeSend: (event) => scrub(event),
  })
  return true
}
