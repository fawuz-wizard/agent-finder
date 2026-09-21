import { useEffect, useState } from 'react'

/** True while the tab is in the foreground. Polling stops when it is not. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => (typeof document === 'undefined' ? true : !document.hidden))
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return visible
}
