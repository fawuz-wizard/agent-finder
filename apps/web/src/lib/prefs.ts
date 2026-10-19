/**
 * The agent's own switches for this phone: the closing beep and the "have you left the shop?"
 * watch. Both on by default. Kept on the phone, not the server: they are about this device.
 */
export interface AgentPrefs {
  closingBeep: boolean
  leftShopWatch: boolean
}

const KEY = 'af.agentPrefs'
const DEFAULTS: AgentPrefs = { closingBeep: true, leftShopWatch: true }

export function readPrefs(): AgentPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AgentPrefs>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function writePrefs(next: Partial<AgentPrefs>): AgentPrefs {
  const merged = { ...readPrefs(), ...next }
  try {
    localStorage.setItem(KEY, JSON.stringify(merged))
  } catch {
    // Fine without it; the defaults apply.
  }
  window.dispatchEvent(new Event('af-prefs'))
  return merged
}
