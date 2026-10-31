import { useEffect, useState } from 'react'

/**
 * The agent and aggregator platform opens in daylight by default: the warm page, white cards
 * and orange tiles of the approved design (2026-10-29). Anyone may switch it to dark from
 * Settings; the choice is this phone's, kept in local storage, never on the server.
 */
export type PlatformTheme = 'light' | 'dark'

const KEY = 'af.platformTheme'
const EVENT = 'af-platform-theme'

export function readPlatformTheme(): PlatformTheme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function writePlatformTheme(theme: PlatformTheme): PlatformTheme {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Fine without it: the default applies next time.
  }
  window.dispatchEvent(new Event(EVENT))
  return theme
}

export function usePlatformTheme(): [PlatformTheme, (next: PlatformTheme) => void] {
  const [theme, setTheme] = useState<PlatformTheme>(readPlatformTheme)
  useEffect(() => {
    const sync = () => setTheme(readPlatformTheme())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return [theme, (next) => setTheme(writePlatformTheme(next))]
}
