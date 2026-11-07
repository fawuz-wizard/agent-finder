import { AlertTriangle, WifiOff } from 'lucide-react'
import { useRouteError } from 'react-router-dom'
import { config } from '@/lib/config'

/** A screen's code could not be downloaded (first visit offline, or a new version replaced it). */
function isLoadFailure(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(text)
}

/**
 * What a person sees instead of a crash: "You're offline" when the screen could not be
 * fetched (or the phone has no connection), otherwise "Something went wrong" with Reload and
 * a way home. Never the router's developer page, never the error's text.
 */
export function RouteError() {
  const error = useRouteError()
  const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || isLoadFailure(error)
  const customer = config.surface === 'customer'
  const home = config.surface === 'national' ? '/national' : '/'
  const reload = () => window.location.reload()
  const Icon = offline ? WifiOff : AlertTriangle
  const button = `flex h-14 w-full max-w-80 items-center justify-center font-bold ${customer ? 'rounded-action' : 'rounded-[14px]'}`

  return (
    <div
      data-platform={customer ? undefined : 'light'}
      data-theme={customer ? undefined : 'light'}
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-finder-bg px-7 py-10 text-center font-finder text-finder-ink"
    >
      <div className="flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full bg-finder-tile">
        <Icon aria-hidden="true" className="h-9 w-9 text-finder-link" strokeWidth={2} />
      </div>
      <h1 className="mt-1 text-2xl font-extrabold">{offline ? "You're offline" : 'Something went wrong'}</h1>
      <p className="max-w-[19rem] text-base leading-relaxed text-finder-muted">
        {offline
          ? 'This page needs internet to open the first time. Check your data or Wi-Fi, then try again.'
          : 'This screen hit a problem. Reload to try again; if it keeps happening, tell the Agent Finder team.'}
      </p>
      <button type="button" onClick={reload} className={`${button} mt-3 bg-finder-cta text-finder-on-cta`}>
        {offline ? 'Try again' : 'Reload'}
      </button>
      {!offline && (
        <a href={home} className={`${button} border-2 border-finder-ink`}>
          Go to Home
        </a>
      )}
    </div>
  )
}
