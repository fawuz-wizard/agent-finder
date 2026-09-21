import { useCallback, useEffect, useRef, useState } from 'react'
import { customerApi } from '@/services/customerApi'
import { config } from '@/lib/config'
import { ApiRequestError } from '@/lib/api'
import type { SearchRequest, SearchResponse } from '@/types/public'
import { useOnline } from './useOnline'
import { usePageVisible } from './usePageVisible'

export type LoadState = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error'

export interface SearchState {
  state: LoadState
  data: SearchResponse | null
  error: string | null
  /** Set when the data on screen came from an earlier, still-cached answer. */
  stale: boolean
  lastUpdated: Date | null
  refresh: () => void
}

/**
 * Runs the search and re-queries every 30 s while the screen is visible and online
 * (architecture §9 — no websockets). Timers are cancelled on unmount and paused offline.
 */
export function useSearch(req: SearchRequest | null): SearchState {
  const [data, setData] = useState<SearchResponse | null>(null)
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [stale, setStale] = useState(false)
  const online = useOnline()
  const visible = usePageVisible()
  const abortRef = useRef<AbortController | null>(null)
  const key = req ? JSON.stringify(req) : null

  const run = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!key) return
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setState(mode === 'initial' ? 'loading' : 'refreshing')
      setError(null)
      try {
        const res = await customerApi.search(JSON.parse(key) as SearchRequest, ctrl.signal)
        setData(res)
        setLastUpdated(new Date())
        setStale(false)
        setState('ready')
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        const message =
          e instanceof ApiRequestError
            ? e.error.message
            : 'We could not reach Agent Finder. Check your connection and try again.'
        if (mode === 'refresh' && data) {
          // Keep showing the previous answer, marked as stale, rather than blanking the screen.
          setStale(true)
          setState('ready')
        } else {
          setError(message)
          setState('error')
        }
      }
    },
    // `data` is read only to decide stale-vs-error; excluding it keeps the callback stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  useEffect(() => {
    if (!key) return
    void run('initial')
    return () => abortRef.current?.abort()
  }, [key, run])

  // Returning to the tab after longer than the refresh window: bring the answer up to date
  // immediately instead of waiting out the next tick.
  useEffect(() => {
    if (!key || !visible || !online || !lastUpdated) return
    if (Date.now() - lastUpdated.getTime() >= config.searchRefreshMs) void run('refresh')
    // lastUpdated is deliberately not a dependency: this runs on visibility/connectivity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, visible, online, run])

  useEffect(() => {
    if (!key || !visible || !online) return
    const id = window.setInterval(() => {
      if (navigator.onLine === false) return
      void run('refresh')
    }, config.searchRefreshMs)
    return () => window.clearInterval(id)
  }, [key, visible, online, run])

  useEffect(() => {
    if (online && stale) void run('refresh')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  return { state, data, error, stale: stale || !online, lastUpdated, refresh: () => void run('refresh') }
}
