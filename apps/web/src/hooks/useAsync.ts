import { useCallback, useEffect, useState } from 'react'

export type AsyncState = 'loading' | 'ready' | 'error'

/**
 * Small loader for screens that read once and refresh on demand. Aborts on unmount so a
 * slow response cannot set state on a screen the user has already left.
 */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState>('loading')
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    let alive = true
    setState((s) => (s === 'ready' ? s : 'loading'))
    load(controller.signal)
      .then((value) => {
        if (!alive) return
        setData(value)
        setError(null)
        setState('ready')
      })
      .catch((e: unknown) => {
        if (!alive || (e instanceof DOMException && e.name === 'AbortError')) return
        setError(e instanceof Error ? e.message : 'Could not load this right now.')
        setState('error')
      })
    return () => {
      alive = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps])

  return { state, data, error, refresh, setData }
}
