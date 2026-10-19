/**
 * The agent's own switches for this phone: what the app tells them about, and the two alerts
 * (the closing beep and the "have you left the shop?" watch). All on by default. Kept on the
 * phone, not the server: they are about this device. Until a notification service is
 * connected they fire while the app is open; the same switches drive phone alerts later.
 */
export interface AgentPrefs {
  floatDecided: boolean
  customerReport: boolean
  newComment: boolean
  statusCheck: boolean
  closingBeep: boolean
  leftShopWatch: boolean
}

const KEY = 'af.agentPrefs'
const DEFAULTS: AgentPrefs = {
  floatDecided: true,
  customerReport: true,
  newComment: true,
  statusCheck: true,
  closingBeep: true,
  leftShopWatch: true,
}

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
