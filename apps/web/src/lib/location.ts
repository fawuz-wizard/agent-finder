/**
 * Why the phone gave no position, in words that say what to do about it. Shared by every
 * screen that asks for a location, so a customer, an agent and an aggregator all read the
 * same advice.
 */
export type LocationReason = 'permission' | 'off' | 'timeout' | 'unsupported'

export interface LocationProblem {
  reason: LocationReason
  /** One sentence: what is wrong. */
  title: string
  /** How to put it right on this phone. */
  advice: string
}

const PROBLEMS: Record<LocationReason, Omit<LocationProblem, 'reason'>> = {
  permission: {
    title: 'Location is blocked for this app.',
    advice: "Allow location when the phone asks. If it no longer asks, open the phone's Settings › Apps › Agent Finder › Permissions and allow Location.",
  },
  off: {
    title: 'Location is switched off on this phone.',
    advice: "Swipe down from the top of the screen and turn on Location, then try again.",
  },
  timeout: {
    title: 'The phone could not fix a position in time.',
    advice: 'Step outside or near a window and try again.',
  },
  unsupported: {
    title: 'This phone cannot share its location.',
    advice: 'Choose an area instead.',
  },
}

/** Maps a GeolocationPositionError (or its absence) to a reason and advice. */
export function explainLocation(err: { code: number } | null): LocationProblem {
  // GeolocationPositionError codes: 1 permission denied, 2 position unavailable, 3 timeout.
  const reason: LocationReason = err === null ? 'unsupported' : err.code === 1 ? 'permission' : err.code === 3 ? 'timeout' : 'off'
  return { reason, ...PROBLEMS[reason] }
}

/** The same advice as one line, for forms that show a single error string. */
export function locationErrorText(err: { code: number } | null, fallback: string): string {
  const p = explainLocation(err)
  return p.reason === 'unsupported' ? fallback : `${p.title} ${p.advice}`
}
